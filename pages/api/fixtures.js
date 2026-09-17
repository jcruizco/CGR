// This code runs on the server (never in the user's browser), so the API
// key stays hidden. The frontend calls /api/fixtures instead of calling
// football-data.org directly.

const COMPETITIONS = [
  { code: "CL", name: "Champions League" },
  { code: "PL", name: "Premier League" },
  { code: "PD", name: "La Liga" },
  { code: "BL1", name: "Bundesliga" },
  { code: "SA", name: "Serie A" },
];

export default async function handler(req, res) {
  const apiKey = process.env.FOOTBALL_DATA_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Falta configurar FOOTBALL_DATA_KEY en las variables de entorno." });
  }

  // Default window: today through 2 days ahead (3 days total).
  // Can be overridden with ?dateFrom=&dateTo=
  const today = new Date();
  const in2Days = new Date();
  in2Days.setDate(today.getDate() + 2);
  const toISODate = (d) => d.toISOString().split("T")[0];

  const dateFrom = req.query.dateFrom || toISODate(today);
  const dateTo = req.query.dateTo || toISODate(in2Days);

  try {
    // football-data.org's free tier is rate-limited, so we fetch the
    // competitions one at a time instead of all in parallel.
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

    res.status(200).json({ matches: allMatches, errors: errors.length ? errors : undefined });
  } catch (err) {
    res.status(500).json({ error: `No se pudo contactar football-data.org: ${err.message}` });
  }
}
