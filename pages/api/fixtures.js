// This code runs on the server (never in the user's browser), so the API
// key stays hidden. The frontend calls /api/fixtures instead of calling
// football-data.org directly.
//
// football-data.org's free tier allows very few requests per minute, so we
// cache the combined result in memory for a few minutes. Repeated page
// visits within that window are served from cache instead of hitting the
// API again.

const COMPETITIONS = [
  { code: "CL", name: "Champions League" },
  { code: "PL", name: "Premier League" },
  { code: "PD", name: "La Liga" },
  { code: "BL1", name: "Bundesliga" },
  { code: "SA", name: "Serie A" },
];

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache = { key: null, data: null, timestamp: 0 };

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

  const isCacheFresh = cache.key === cacheKey && Date.now() - cache.timestamp < CACHE_TTL_MS;
  if (isCacheFresh) {
    return res.status(200).json({ ...cache.data, cached: true });
  }

  try {
    const allMatches = [];
    const errors = [];

    for (const comp of COMPETITIONS) {
      const url = `https://api.football-data.org/v4/competitions/${comp.code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
      try {
        const response = await fetch(url, { headers: { "X-Auth-Token": apiKey } });
        if (!response.ok) {
          const text = await response.text();
          errors.push(`${comp.name}: ${text}`);
          continue;
        }
        const data = await response.json();
        const matches = (data.matches || []).map((m) => ({
          id: m.id,
          competition: comp.name,
          utcDate: m.utcDate,
          status: m.status,
          home: m.homeTeam.name,
          away: m.awayTeam.name,
          score: m.score.fullTime,
        }));
        allMatches.push(...matches);
      } catch (e) {
        errors.push(`${comp.name}: ${e.message}`);
      }
    }

    allMatches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

    const result = { matches: allMatches, errors: errors.length ? errors : undefined };

    // Only cache a fully-successful response, so a rate-limited attempt
    // doesn't get "stuck" as the cached result for the next 5 minutes.
    if (errors.length === 0) {
      cache = { key: cacheKey, data: result, timestamp: Date.now() };
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: `No se pudo contactar football-data.org: ${err.message}` });
  }
}
