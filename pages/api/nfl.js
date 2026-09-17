import { buildNflMarkets } from "../../lib/nflPicks";

const STANDINGS_TTL_MS = 60 * 60 * 1000; // 1 hour — season stats change slowly
const SCOREBOARD_TTL_MS = 5 * 60 * 1000; // 5 minutes

let standingsCache = { data: null, timestamp: 0 };
let scoreboardCache = { key: null, data: null, timestamp: 0 };

async function fetchJSON(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

// Builds { [teamId]: { winPct, pf, pa } } from ESPN's standings response.
// ESPN's stat array uses different "name"/"shortDisplayName" values across
// seasons, so we match loosely (case-insensitive, a few aliases).
function buildStatsIndex(standingsData) {
  const index = {};
  const groups = standingsData?.children || standingsData?.standings?.entries ? [standingsData] : standingsData?.children || [];
  const entries = [];

  // ESPN nests standings under children[].standings.entries[] (by conference/division)
  const children = standingsData?.children || [];
  for (const child of children) {
    const childEntries = child?.standings?.entries || [];
    entries.push(...childEntries);
  }
  // Fallback: some responses put entries directly under standings.entries
  if (entries.length === 0 && standingsData?.standings?.entries) {
    entries.push(...standingsData.standings.entries);
  }

  for (const entry of entries) {
    const teamId = entry?.team?.id;
    if (!teamId) continue;
    const statByName = {};
    for (const s of entry.stats || []) {
      const key = (s.name || s.shortDisplayName || "").toLowerCase();
      statByName[key] = s.value;
    }
    const wins = statByName["wins"] ?? 0;
    const losses = statByName["losses"] ?? 0;
    const played = wins + losses || 1;
    const pf = (statByName["pointsfor"] ?? statByName["avgpointsfor"] * played) || 0;
    const pa = (statByName["pointsagainst"] ?? statByName["avgpointsagainst"] * played) || 0;

    index[teamId] = {
      winPct: Math.round((wins / played) * 100),
      pf: pf / played,
      pa: pa / played,
    };
  }
  return index;
}

async function getStandings() {
  if (standingsCache.data && Date.now() - standingsCache.timestamp < STANDINGS_TTL_MS) {
    return standingsCache.data;
  }
  const data = await fetchJSON("https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings");
  standingsCache = { data, timestamp: Date.now() };
  return data;
}

// ESPN's date-range query (dates=FROM-TO) started failing with a generic
// 400 "Failed to get events endpoint." We fetch one day at a time instead
// and merge — same data, just one call per date.
async function getScoreboardForDays(dayYMDs) {
  const cacheKey = dayYMDs.join("_");
  if (scoreboardCache.key === cacheKey && Date.now() - scoreboardCache.timestamp < SCOREBOARD_TTL_MS) {
    return scoreboardCache.data;
  }
  const allEvents = [];
  for (const ymd of dayYMDs) {
    try {
      const data = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${ymd}`);
      allEvents.push(...(data.events || []));
    } catch (e) {
      // one bad day shouldn't kill the whole week
    }
  }
  scoreboardCache = { key: cacheKey, data: allEvents, timestamp: Date.now() };
  return allEvents;
}

export default async function handler(req, res) {
  const errors = [];
  const toYMD = (d) => d.toISOString().split("T")[0].replace(/-/g, "");
  const dayYMDs = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dayYMDs.push(toYMD(d));
  }

  let statsIndex = {};
  try {
    const standingsData = await getStandings();
    statsIndex = buildStatsIndex(standingsData);
  } catch (e) {
    errors.push(`Standings NFL: ${e.message}`);
  }

  let events = [];
  try {
    events = await getScoreboardForDays(dayYMDs);
    // de-duplicate in case a game appears on more than one day's response
    const seen = new Set();
    events = events.filter((ev) => (seen.has(ev.id) ? false : (seen.add(ev.id), true)));
  } catch (e) {
    errors.push(`Scoreboard NFL: ${e.message}`);
  }

  const matches = events.map((ev) => {
    const comp = ev.competitions?.[0];
    const homeC = comp?.competitors?.find((c) => c.homeAway === "home");
    const awayC = comp?.competitors?.find((c) => c.homeAway === "away");

    const base = {
      id: ev.id,
      competition: "NFL",
      utcDate: ev.date,
      status: comp?.status?.type?.name,
      home: homeC?.team?.displayName || "Local",
      away: awayC?.team?.displayName || "Visitante",
      score: homeC && awayC ? { home: homeC.score, away: awayC.score } : null,
    };

    const homeStats = homeC?.team?.id ? statsIndex[homeC.team.id] : null;
    const awayStats = awayC?.team?.id ? statsIndex[awayC.team.id] : null;

    if (!homeStats || !awayStats) {
      return { ...base, marketsError: "Sin estadísticas de temporada disponibles todavía para uno de los dos equipos." };
    }

    const markets = buildNflMarkets(base.home, base.away, homeStats, awayStats);
    return { ...base, markets };
  });

  matches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  res.status(200).json({ matches, errors: errors.length ? errors : undefined });
}
