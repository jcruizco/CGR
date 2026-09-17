import { useEffect, useState } from "react";

const COLORS = {
  pitch: "#0F3D2E",
  chalk: "#F6F4EC",
  ink: "#1A1F1C",
  slate: "#5B6660",
};

const LEAGUE_ORDER = ["Champions League", "Premier League", "La Liga", "Bundesliga", "Serie A"];

function dateKey(utcDate) {
  return new Date(utcDate).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
}

function dateHeading(utcDate) {
  return new Date(utcDate).toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function Home() {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState(null);
  const [apiErrors, setApiErrors] = useState(null);

  useEffect(() => {
    fetch("/api/fixtures")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setMatches(data.matches);
          setApiErrors(data.errors || null);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  // Group by date first, then by league within each date
  const byDate = {};
  if (matches) {
    for (const m of matches) {
      const key = dateKey(m.utcDate);
      if (!byDate[key]) byDate[key] = { heading: dateHeading(m.utcDate), leagues: {} };
      if (!byDate[key].leagues[m.competition]) byDate[key].leagues[m.competition] = [];
      byDate[key].leagues[m.competition].push(m);
    }
  }
  // Sort date groups chronologically
  const orderedDateKeys = matches
    ? Object.keys(byDate).sort((a, b) => new Date(byDate[a].leagues[Object.keys(byDate[a].leagues)[0]][0].utcDate) - new Date(byDate[b].leagues[Object.keys(byDate[b].leagues)[0]][0].utcDate))
    : [];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.chalk, color: COLORS.ink, fontFamily: "-apple-system, sans-serif", padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ borderBottom: `3px solid ${COLORS.pitch}`, paddingBottom: 12, marginBottom: 24 }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 30, color: COLORS.pitch, margin: 0 }}>CGR</h1>
          <span style={{ color: COLORS.slate, fontSize: 13 }}>Certified Gameday Romantic — datos en vivo de football-data.org</span>
        </div>

        {error && (
          <div style={{ color: "#A8402F", fontSize: 14 }}>
            Error al cargar partidos: {error}
          </div>
        )}

        {apiErrors && (
          <div style={{ color: "#A8402F", fontSize: 12, marginBottom: 16 }}>
            {apiErrors.map((e, i) => (<div key={i}>⚠ {e}</div>))}
          </div>
        )}

        {!error && !matches && <p style={{ color: COLORS.slate }}>Cargando partidos…</p>}

        {matches && matches.length === 0 && (
          <p style={{ color: COLORS.slate }}>No hay partidos en los próximos 3 días en ninguna de las ligas conectadas.</p>
        )}

        {orderedDateKeys.map((dk) => {
          const dayData = byDate[dk];
          return (
            <div key={dk} style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "Georgia, serif", fontSize: 21, color: COLORS.pitch, borderBottom: `2px solid ${COLORS.pitch}`, paddingBottom: 6, marginBottom: 16, textTransform: "capitalize" }}>
                {dayData.heading}
              </h2>
              {LEAGUE_ORDER.filter((l) => dayData.leagues[l]).map((league) => (
                <div key={league} style={{ marginBottom: 18 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.slate, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                    {league}
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dayData.leagues[league].map((m) => (
                      <div key={m.id} style={{ border: "1px solid #DEDACB", borderRadius: 4, background: "#FFF", padding: "10px 14px" }}>
                        <div style={{ fontSize: 11.5, color: COLORS.slate, marginBottom: 3 }}>
                          {new Date(m.utcDate).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" })} CDMX
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                          {m.home} vs {m.away}
                        </div>
                        {m.status === "FINISHED" && (
                          <div style={{ fontSize: 13, color: COLORS.slate }}>
                            Resultado: {m.score.home} - {m.score.away}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
