import { useEffect, useState } from "react";

const COLORS = {
  pitch: "#0F3D2E",
  chalk: "#F6F4EC",
  ink: "#1A1F1C",
  slate: "#5B6660",
  gold: "#C7A24C",
  red: "#A8402F",
};

const SOCCER_LEAGUE_ORDER = ["Champions League", "Premier League", "La Liga", "Bundesliga", "Serie A"];

const TIER_META = {
  low: { label: "Riesgo bajo · parlay", color: COLORS.pitch },
  medium: { label: "Riesgo medio", color: COLORS.gold },
  high: { label: "Riesgo alto", color: COLORS.red },
};

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
function formatOdds(o) {
  return o > 0 ? `+${o}` : `${o}`;
}

function PickRow({ pick }) {
  return (
    <div style={{ padding: "6px 0", borderTop: "1px solid #EEE9D9" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span style={{ fontWeight: 700 }}>{pick.market}</span>
        <span style={{ color: COLORS.slate }}>{formatOdds(pick.odds)}</span>
      </div>
      <p style={{ fontSize: 11.5, color: COLORS.slate, margin: "2px 0 0", lineHeight: 1.35 }}>{pick.reason}</p>
    </div>
  );
}

function MatchCard({ m }) {
  return (
    <div style={{ border: "1px solid #DEDACB", borderRadius: 4, background: "#FFF", padding: "12px 16px", marginBottom: 8 }}>
      <div style={{ fontSize: 11.5, color: COLORS.slate, marginBottom: 3 }}>
        {new Date(m.utcDate).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" })} CDMX
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
        {m.home} vs {m.away}
      </div>
      {m.score && m.score.home != null && (
        <div style={{ fontSize: 13, color: COLORS.slate, marginBottom: 8 }}>Marcador: {m.score.home} - {m.score.away}</div>
      )}
      {m.marketsError && <p style={{ fontSize: 12, color: COLORS.slate }}>{m.marketsError}</p>}
      {m.markets && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {["low", "medium", "high"].map((tier) => (
            <div key={tier} style={{ borderLeft: `3px solid ${TIER_META[tier].color}`, paddingLeft: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: TIER_META[tier].color, marginBottom: 2 }}>
                {TIER_META[tier].label}
              </div>
              {m.markets[tier].map((p, i) => (<PickRow key={i} pick={p} />))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByDateThenLeague(matches) {
  const byDate = {};
  for (const m of matches) {
    const key = dateKey(m.utcDate);
    if (!byDate[key]) byDate[key] = { heading: dateHeading(m.utcDate), leagues: {} };
    if (!byDate[key].leagues[m.competition]) byDate[key].leagues[m.competition] = [];
    byDate[key].leagues[m.competition].push(m);
  }
  const orderedKeys = Object.keys(byDate).sort((a, b) => {
    const aFirst = byDate[a].leagues[Object.keys(byDate[a].leagues)[0]][0].utcDate;
    const bFirst = byDate[b].leagues[Object.keys(byDate[b].leagues)[0]][0].utcDate;
    return new Date(aFirst) - new Date(bFirst);
  });
  return { byDate, orderedKeys };
}

function MatchdaySection({ matches, leagueOrder }) {
  const { byDate, orderedKeys } = groupByDateThenLeague(matches);
  return (
    <>
      {orderedKeys.map((dk) => {
        const dayData = byDate[dk];
        const leaguesPresent = leagueOrder ? leagueOrder.filter((l) => dayData.leagues[l]) : Object.keys(dayData.leagues);
        return (
          <div key={dk} style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 21, color: COLORS.pitch, borderBottom: `2px solid ${COLORS.pitch}`, paddingBottom: 6, marginBottom: 16, textTransform: "capitalize" }}>
              {dayData.heading}
            </h2>
            {leaguesPresent.map((league) => (
              <div key={league} style={{ marginBottom: 18 }}>
                {leagueOrder && (
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.slate, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                    {league}
                  </h3>
                )}
                {dayData.leagues[league].map((m) => (<MatchCard key={m.id} m={m} />))}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

export default function Home() {
  const [sport, setSport] = useState("soccer");
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState(null);
  const [apiErrors, setApiErrors] = useState(null);

  useEffect(() => {
    setMatches(null);
    setError(null);
    setApiErrors(null);
    const endpoint = sport === "soccer" ? "/api/matchday" : "/api/nfl";
    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setMatches(data.matches);
          setApiErrors(data.errors || null);
        }
      })
      .catch((e) => setError(e.message));
  }, [sport]);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.chalk, color: COLORS.ink, fontFamily: "-apple-system, sans-serif", padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ borderBottom: `3px solid ${COLORS.pitch}`, paddingBottom: 12, marginBottom: 20 }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 30, color: COLORS.pitch, margin: 0 }}>CGR</h1>
          <span style={{ color: COLORS.slate, fontSize: 13 }}>Certified Gameday Romantic — datos y picks en vivo</span>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[["soccer", "Fútbol"], ["nfl", "NFL"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSport(key)}
              style={{
                padding: "6px 16px",
                borderRadius: 999,
                border: `1px solid ${COLORS.pitch}`,
                background: sport === key ? COLORS.pitch : "transparent",
                color: sport === key ? COLORS.chalk : COLORS.pitch,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div style={{ color: COLORS.red, fontSize: 14 }}>Error al cargar: {error}</div>}
        {apiErrors && (
          <div style={{ color: COLORS.red, fontSize: 12, marginBottom: 16 }}>
            {apiErrors.map((e, i) => (<div key={i}>⚠ {e}</div>))}
          </div>
        )}
        {!error && !matches && <p style={{ color: COLORS.slate }}>Cargando partidos y calculando picks…</p>}
        {matches && matches.length === 0 && <p style={{ color: COLORS.slate }}>No hay partidos en la ventana de días consultada.</p>}

        {matches && matches.length > 0 && (
          <MatchdaySection matches={matches} leagueOrder={sport === "soccer" ? SOCCER_LEAGUE_ORDER : null} />
        )}
      </div>
    </div>
  );
}
