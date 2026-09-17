import { useEffect, useState } from "react";

const COLORS = {
  pitch: "#0F3D2E",
  chalk: "#F6F4EC",
  ink: "#1A1F1C",
  slate: "#5B6660",
};

export default function Home() {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/fixtures")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setMatches(data.matches);
      })
      .catch((e) => setError(e.message));
  }, []);

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

        {!error && !matches && <p style={{ color: COLORS.slate }}>Cargando partidos…</p>}

        {matches && matches.length === 0 && (
          <p style={{ color: COLORS.slate }}>No hay partidos de Champions League en los próximos 3 días.</p>
        )}

        {matches && matches.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {matches.map((m) => (
              <div key={m.id} style={{ border: "1px solid #DEDACB", borderRadius: 4, background: "#FFF", padding: "12px 16px" }}>
                <div style={{ fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>
                  {new Date(m.utcDate).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
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
        )}
      </div>
    </div>
  );
}
