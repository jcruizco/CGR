import { buildStatsIndex, getTeamVenueStats, buildMarkets, computeForm } from "../../lib/picks";

const COMPETITIONS = [
  { code: "CL", name: "Champions League" },
  { code: "PL", name: "Premier League" },
  { code: "PD", name: "La Liga" },
  { code: "BL1", name: "Bundesliga" },
  { code: "SA", name: "Serie A" },
];

const RAW_MATCHES_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STANDINGS_TTL_MS = 30 * 60 * 1000; // 30 minutes — changes slowly
const FORM_LOOKBACK_DAYS = 45; // how far back we pull to compute recent form

let rawMatchesCache = {}; // { [competitionCode]: { data, timestamp } }
let standingsCache = {}; // { [competitionCode]: { data, timestamp } }

async function fetchJSON(url, apiKey) {
  const response = await fetch(url, { headers: { "X-Auth-Token": apiKey } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
}

// One call per competition, covering FORM_LOOKBACK_DAYS in the past through
// the requested upcoming window. Reused both for the fixtures we display
// AND for computing recent form — no extra API calls needed.
async function getRawMatches(code, dateTo, apiKey) {
  const cached = rawMatchesCache[code];
  if (cached && Date.now() - cached.timestamp < RAW_MATCHES_TTL_MS) {
    return cached.data;
  }
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - FORM_LOOKBACK_DAYS);
  const dateFromISO = dateFrom.toISOString().split("T")[0];

  const data = await fetchJSON(
    `https://api.football-data.org/v4/competitions/${code}/matches?dateFrom=${dateFromISO}&dateTo=${dateTo}`,
    apiKey
  );
  const matches = data.matches || [];
  rawMatchesCache[code] = { data: matches, timestamp: Date.now() };
  return matches;
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

  const errors = [];
  const enriched = [];

  for (const comp of COMPETITIONS) {
    let rawMatches;
    try {
      rawMatches = await getRawMatches(comp.code, dateTo, apiKey);
    } catch (e) {
      errors.push(`Partidos ${comp.name}: ${e.message}`);
      continue;
    }

    const upcoming = rawMatches.filter((m) => {
      const d = m.utcDate.split("T")[0];
      return d >= dateFrom && d <= dateTo;
    });
    if (upcoming.length === 0) continue;

    let statsIndex = null;
    try {
      const standingsData = await getStandings(comp.code, apiKey);
      statsIndex = buildStatsIndex(standingsData);
    } catch (e) {
      errors.push(`Estadísticas ${comp.name}: ${e.message}`);
    }

    for (const m of upcoming) {
      const base = {
        id: m.id,
        competitionCode: comp.code,
        competition: comp.name,
        utcDate: m.utcDate,
        status: m.status,
        home: m.homeTeam.name,
        away: m.awayTeam.name,
        score: m.score.fullTime,
      };

      if (!statsIndex) {
        enriched.push({ ...base, marketsError: "Sin estadísticas disponibles para esta liga todavía." });
        continue;
      }

      const homeVenueStats = getTeamVenueStats(statsIndex, m.homeTeam.id, "home");
      const awayVenueStats = getTeamVenueStats(statsIndex, m.awayTeam.id, "away");
      if (!homeVenueStats || !awayVenueStats) {
        enriched.push({ ...base, marketsError: "Alguno de los dos equipos no tiene suficientes partidos jugados aún." });
        continue;
      }

      const homeForm = computeForm(rawMatches, m.homeTeam.id, m.utcDate);
      const awayForm = computeForm(rawMatches, m.awayTeam.id, m.utcDate);

      const homeStats = { ...homeVenueStats, ...homeForm };
      const awayStats = { ...awayVenueStats, ...awayForm };

      const markets = buildMarkets(m.homeTeam.name, m.awayTeam.name, homeStats, awayStats);
      enriched.push({ ...base, markets });
    }
  }

  enriched.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  res.status(200).json({ matches: enriched, errors: errors.length ? errors : undefined });
}
