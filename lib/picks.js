// Turns raw team stats (win %, goals for/against per game, recent form,
// home or away) into 9 varied bet markets, ranked and split into 3 risk
// tiers of 3. This is a statistical estimate for entertainment/analysis —
// not a guarantee, and not the same as a sportsbook's real odds.

export function statsFromTable(entry) {
  const played = entry.playedGames || 1;
  return {
    winPct: Math.round((entry.won / played) * 100),
    gf: entry.goalsFor / played,
    ga: entry.goalsAgainst / played,
  };
}

// Builds { home: {teamId: stats}, away: {...}, total: {...} } from a
// football-data.org /standings response.
export function buildStatsIndex(standingsData) {
  const home = {}, away = {}, total = {};
  for (const grp of standingsData.standings || []) {
    for (const row of grp.table) {
      const s = statsFromTable(row);
      if (grp.type === "HOME") home[row.team.id] = s;
      else if (grp.type === "AWAY") away[row.team.id] = s;
      else if (grp.type === "TOTAL") total[row.team.id] = s;
    }
  }
  return { home, away, total };
}

export function getTeamVenueStats(statsIndex, teamId, venue) {
  const table = venue === "home" ? statsIndex.home : statsIndex.away;
  if (table && table[teamId]) return table[teamId];
  if (statsIndex.total && statsIndex.total[teamId]) return statsIndex.total[teamId];
  return null;
}

// Computes recent form (last N finished matches, any venue) for a team from
// a flat list of that competition's matches (already fetched — no extra
// API calls). Returns { formPct, formString, playedCount }.
export function computeForm(competitionMatches, teamId, beforeDateISO, limit = 5) {
  const past = (competitionMatches || [])
    .filter(
      (m) =>
        m.status === "FINISHED" &&
        (m.homeTeam.id === teamId || m.awayTeam.id === teamId) &&
        new Date(m.utcDate) < new Date(beforeDateISO)
    )
    .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
    .slice(0, limit);

  let points = 0;
  const letters = [];
  for (const pm of past) {
    const isHome = pm.homeTeam.id === teamId;
    const gf = isHome ? pm.score.fullTime.home : pm.score.fullTime.away;
    const ga = isHome ? pm.score.fullTime.away : pm.score.fullTime.home;
    let letter = "E", pts = 1;
    if (gf > ga) { letter = "G"; pts = 3; }
    else if (gf < ga) { letter = "P"; pts = 0; }
    points += pts;
    letters.push(letter);
  }
  const playedCount = past.length;
  const formPct = playedCount ? Math.round((points / (playedCount * 3)) * 100) : 50;
  return { formPct, formString: letters.join(""), playedCount };
}

function probToAmerican(prob) {
  const p = Math.min(0.92, Math.max(0.08, prob / 100));
  if (p >= 0.5) return -Math.round((p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

function estimateProbs(homeStats, awayStats) {
  const base = (homeStats.winPct + (100 - awayStats.winPct)) / 2;
  const gdAdj = (homeStats.gf - homeStats.ga) - (awayStats.gf - awayStats.ga);
  const formAdjHome = (homeStats.formPct - 50) * 0.15 - (awayStats.formPct - 50) * 0.08;
  const formAdjAway = (awayStats.formPct - 50) * 0.15 - (homeStats.formPct - 50) * 0.08;

  let homeWinProb = Math.min(85, Math.max(10, Math.round(base + gdAdj * 3 + formAdjHome)));
  const baseAway = (awayStats.winPct + (100 - homeStats.winPct)) / 2;
  let awayWinProb = Math.min(80, Math.max(8, Math.round(baseAway - gdAdj * 2 + formAdjAway)));
  let drawProb = 100 - homeWinProb - awayWinProb;
  if (drawProb < 10) {
    const deficit = 10 - drawProb;
    const total = homeWinProb + awayWinProb || 1;
    homeWinProb -= Math.round(deficit * (homeWinProb / total));
    awayWinProb -= Math.round(deficit * (awayWinProb / total));
    drawProb = 100 - homeWinProb - awayWinProb;
  }
  return { homeWinProb, awayWinProb, drawProb };
}

function formPhrase(name, stats) {
  if (!stats.playedCount) return `${name} no tiene partidos recientes registrados en esta ventana.`;
  return `${name} llega con ${stats.formString} en sus últimos ${stats.playedCount} (${stats.formPct}% de rendimiento reciente).`;
}

// Returns { low: [3 markets], medium: [3], high: [3] }, each market has
// { market, prob, odds, reason }. Tiering is by rank (top-3 most likely =
// low risk, bottom-3 least likely = high risk), not fixed odds cutoffs, so
// it's always a clean 3-3-3 split.
export function buildMarkets(homeName, awayName, homeStats, awayStats) {
  const { homeWinProb, awayWinProb, drawProb } = estimateProbs(homeStats, awayStats);
  const favIsHome = homeWinProb >= awayWinProb;
  const favName = favIsHome ? homeName : awayName;
  const dogName = favIsHome ? awayName : homeName;
  const favProb = Math.max(homeWinProb, awayWinProb);
  const dogProb = Math.min(homeWinProb, awayWinProb);
  const favStats = favIsHome ? homeStats : awayStats;
  const dogStats = favIsHome ? awayStats : homeStats;

  const combinedGoals = homeStats.gf + awayStats.gf;
  const bttsProb = Math.min(85, Math.max(20, Math.round(45 + (Math.min(homeStats.gf, awayStats.gf) - Math.max(homeStats.ga, awayStats.ga)) * 15)));
  const over25Prob = Math.min(88, Math.max(15, Math.round((combinedGoals - 2.5) * 25 + 50)));

  const candidates = [
    {
      market: `${favName} gana`,
      prob: favProb,
      reason: `${favName} tiene ${favProb}% de probabilidad estimada según su récord (${favStats.winPct}% de efectividad), balance de gol y forma reciente. ${formPhrase(favName, favStats)}`,
    },
    {
      market: `Doble oportunidad: ${favName} o empate`,
      prob: Math.min(96, favProb + drawProb),
      reason: `Cubre que ${favName} no pierda — la opción más segura del partido, reforzada por su forma reciente (${favStats.formString || "s/d"}).`,
    },
    {
      market: `Doble oportunidad: ${dogName} o empate`,
      prob: Math.min(90, dogProb + drawProb),
      reason: `${dogName} no es favorito, pero evitar la derrota es más alcanzable que ganar directo. ${formPhrase(dogName, dogStats)}`,
    },
    {
      market: "Empate",
      prob: drawProb,
      reason: `El balance entre ambos equipos —incluida su forma reciente (${homeStats.formString || "s/d"} vs ${awayStats.formString || "s/d"})— deja margen real para un empate.`,
    },
    {
      market: over25Prob >= 50 ? "Más de 2.5 goles" : "Menos de 2.5 goles",
      prob: Math.max(over25Prob, 100 - over25Prob),
      reason: `Entre los dos promedian ${combinedGoals.toFixed(1)} goles por partido (${homeName}: ${homeStats.gf.toFixed(1)}, ${awayName}: ${awayStats.gf.toFixed(1)}).`,
    },
    {
      market: bttsProb >= 50 ? "Ambos anotan: Sí" : "Ambos anotan: No",
      prob: Math.max(bttsProb, 100 - bttsProb),
      reason: bttsProb >= 50
        ? `Ninguna de las dos defensas ha sido lo bastante sólida para mantener su portería en cero seguido (${homeStats.ga.toFixed(1)} y ${awayStats.ga.toFixed(1)} goles recibidos por partido).`
        : `Al menos una de las dos defensas ha sido sólida (mínimo ${Math.min(homeStats.ga, awayStats.ga).toFixed(1)} goles recibidos por partido), bajando la probabilidad de que ambos anoten.`,
    },
    {
      market: `${favName} gana por 2+ goles (hándicap -1.5)`,
      prob: Math.max(10, Math.round(favProb * 0.5)),
      reason: `${favName} promedia ${favStats.gf.toFixed(1)} goles a favor por partido y llega con ${favStats.formString || "forma s/d"}, suficiente para ganar con margen.`,
    },
    {
      market: `${dogName} anota en el partido`,
      prob: Math.min(85, Math.max(25, Math.round(50 + (dogStats.gf - favStats.ga) * 20))),
      reason: `${dogName} promedia ${dogStats.gf.toFixed(1)} goles a favor, frente a una defensa que recibe ${favStats.ga.toFixed(1)} por partido.`,
    },
    {
      market: `${dogName} gana (sorpresa)`,
      prob: dogProb,
      reason: `${dogName} parte como no favorito (${dogProb}% estimado), con forma reciente de ${dogStats.formString || "s/d"} — el fútbol da sorpresas.`,
    },
  ];

  const withOdds = candidates.map((m) => ({ ...m, odds: probToAmerican(m.prob) }));
  const ranked = [...withOdds].sort((a, b) => b.prob - a.prob);

  return {
    low: ranked.slice(0, 3),
    medium: ranked.slice(3, 6),
    high: ranked.slice(6, 9),
  };
}
