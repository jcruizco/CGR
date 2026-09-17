import { buildStatsIndex, getTeamVenueStats, buildMarkets } from "../../lib/picks";

const COMPETITIONS = [
  { code: "CL", name: "Champions League" },
  { code: "PL", name: "Premier League" },
  { code: "PD", name: "La Liga" },
  { code: "BL1", name: "Bundesliga" },
  { code: "SA", name: "Serie A" },
];

const FIXTURES_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STANDINGS_TTL_MS = 30 * 60 * 1000; // 30 minutes — changes slowly

let fixturesCache = { key: null, data: null, timestamp: 0 };
let standingsCache = {}; // { [competitionCode]: { data, timestamp } }

async function fetchJSON(url, apiKey) {
  const response = await fetch(url, { headers: { "X-Auth-Token": apiKey } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
}

async function getStandings(code, apiKey) {
  const cached = standingsCache[code];
  if (cached && Date.now() - cached.timestamp < STANDINGS_TTL_MS) {
    return cached.data;
  }
  const data = await fetchJSON(`https://api.football-data.org/v4/competitions/${code}/standings`, apiKey);
  standingsCache[code] = { data, timestamp: Date.now() };
  return data;
}

export default async function handler(req, res) {
  const apiKey = process.env.FOOTBALL_DATA_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta configurar FOOTBALL_DATA_KEY en las variables de entorno." });
  }

  const today = new Date();
  const in2Days = new Date();
  in2Days.setDate(today.getDate() + 2);
  const toISODate = (d) => d.toISOString().split("T")[0];
  const dateFrom = req.query.dateFrom || toISODate(today);
  const dateTo = req.query.dateTo || toISODate(in2Days);
  const cacheKey = `${dateFrom}_${dateTo}`;

  const errors = [];
  let matches = [];

  const isFixturesCacheFresh = fixturesCache.key === cacheKey && Date.now() - fixturesCache.timestamp < FIXTURES_TTL_MS;
  if (isFixturesCacheFresh) {
    matches = fixturesCache.data;
  } else {
    for (const comp of COMPETITIONS) {
      try {
        const data = await fetchJSON(
          `https://api.football-data.org/v4/competitions/${comp.code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
          apiKey
        );
        const compMatches = (data.matches || []).map((m) => ({
          id: m.id,
          competitionCode: comp.code,
          competition: comp.name,
          utcDate: m.utcDate,
          status: m.status,
          home: m.homeTeam.name,
          away: m.awayTeam.name,
          homeId: m.homeTeam.id,
          awayId: m.awayTeam.id,
          score: m.score.fullTime,
        }));
        matches.push(...compMatches);
      } catch (e) {
        errors.push(`Partidos ${comp.name}: ${e.message}`);
      }
    }
    matches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    if (errors.length === 0) {
      fixturesCache = { key: cacheKey, data: matches, timestamp: Date.now() };
    }
  }

  // Only fetch standings for competitions that actually have matches in range
  const neededCompetitions = [...new Set(matches.map((m) => m.competitionCode))];
  const statsIndexByCompetition = {};

  for (const code of neededCompetitions) {
    try {
      const standingsData = await getStandings(code, apiKey);
      statsIndexByCompetition[code] = buildStatsIndex(standingsData);
    } catch (e) {
      errors.push(`Estadísticas ${code}: ${e.message}`);
    }
  }

  const enriched = matches.map((m) => {
    const statsIndex = statsIndexByCompetition[m.competitionCode];
    if (!statsIndex) {
      return { ...m, marketsError: "Sin estadísticas disponibles para esta liga todavía." };
    }
    const homeStats = getTeamVenueStats(statsIndex, m.homeId, "home");
    const awayStats = getTeamVenueStats(statsIndex, m.awayId, "away");
    if (!homeStats || !awayStats) {
      return { ...m, marketsError: "Alguno de los dos equipos no tiene suficientes partidos jugados aún." };
    }
    const markets = buildMarkets(m.home, m.away, homeStats, awayStats);
    return { ...m, markets };
  });

  res.status(200).json({ matches: enriched, errors: errors.length ? errors : undefined });
}
