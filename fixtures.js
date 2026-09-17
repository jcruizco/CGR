// This code runs on the server (never in the user's browser), so the API
// key stays hidden. The frontend calls /api/fixtures instead of calling
// football-data.org directly.

export default async function handler(req, res) {
  const apiKey = process.env.FOOTBALL_DATA_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Falta configurar FOOTBALL_DATA_KEY en las variables de entorno." });
  }

  // Default window: today through 2 days ahead (3 days total), matching
  // what we want to show in the app. Can be overridden with ?dateFrom=&dateTo=
  const today = new Date();
  const in2Days = new Date();
  in2Days.setDate(today.getDate() + 2);
  const toISODate = (d) => d.toISOString().split("T")[0];

  const dateFrom = req.query.dateFrom || toISODate(today);
  const dateTo = req.query.dateTo || toISODate(in2Days);

  // CL = Champions League competition code in football-data.org
  const url = `https://api.football-data.org/v4/competitions/CL/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;

  try {
    const response = await fetch(url, {
      headers: { "X-Auth-Token": apiKey },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `football-data.org respondió con error: ${text}` });
    }

    const data = await response.json();

    // Trim down to just what the dashboard needs
    const matches = (data.matches || []).map((m) => ({
      id: m.id,
      utcDate: m.utcDate,
      status: m.status,
      home: m.homeTeam.name,
      away: m.awayTeam.name,
      homeCrest: m.homeTeam.crest,
      awayCrest: m.awayTeam.crest,
      score: m.score.fullTime,
    }));

    res.status(200).json({ matches });
  } catch (err) {
    res.status(500).json({ error: `No se pudo contactar football-data.org: ${err.message}` });
  }
}
