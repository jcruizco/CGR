// Turns raw team stats (win %, goals for/against per game, home or away)
// into 9 varied bet markets, ranked and split into 3 risk tiers of 3.
// This is a statistical estimate for entertainment/analysis — not a
// guarantee, and not the same as a sportsbook's real odds.

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

function probToAmerican(prob) {
  const p = Math.min(0.92, Math.max(0.08, prob / 100));
  if (p >= 0.5) return -Math.round((p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

function estimateProbs(homeStats, awayStats) {
  const base = (homeStats.winPct + (100 - awayStats.winPct)) / 2;
  const gdAdj = (homeStats.gf - homeStats.ga) - (awayStats.gf - awayStats.ga);
  let homeWinProb = Math.min(85, Math.max(10, Math.round(base + gdAdj * 3)));
  const baseAway = (awayStats.winPct + (100 - homeStats.winPct)) / 2;
  let awayWinProb = Math.min(80, Math.max(8, Math.round(baseAway - gdAdj * 2)));
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
      reason: `${favName} tiene ${favProb}% de probabilidad estimada según su récord y balance de gol.`,
    },
    {
      market: `Doble oportunidad: ${favName} o empate`,
      prob: Math.min(96, favProb + drawProb),
      reason: `Cubre que ${favName} no pierda — la opción más segura del partido.`,
    },
    {
      market: `Doble oportunidad: ${dogName} o empate`,
      prob: Math.min(90, dogProb + drawProb),
      reason: `${dogName} no es favorito, pero evitar la derrota es más alcanzable que ganar directo.`,
    },
    {
      market: "Empate",
      prob: drawProb,
      reason: `El balance entre ambos equipos deja margen real para un empate.`,
    },
    {
      market: over25Prob >= 50 ? "Más de 2.5 goles" : "Menos de 2.5 goles",
      prob: Math.max(over25Prob, 100 - over25Prob),
      reason: `Entre los dos promedian ${combinedGoals.toFixed(1)} goles por partido.`,
    },
    {
      market: bttsProb >= 50 ? "Ambos anotan: Sí" : "Ambos anotan: No",
      prob: Math.max(bttsProb, 100 - bttsProb),
      reason: bttsProb >= 50
        ? `Ninguna de las dos defensas ha sido lo bastante sólida para mantener su portería en cero seguido.`
        : `Al menos una de las dos defensas ha sido sólida, bajando la probabilidad de que ambos anoten.`,
    },
    {
      market: `${favName} gana por 2+ goles (hándicap -1.5)`,
      prob: Math.max(10, Math.round(favProb * 0.5)),
      reason: `${favName} no solo gana seguido, promedia ${favStats.gf.toFixed(1)} goles a favor por partido, suficiente para ganar con margen.`,
    },
    {
      market: `${dogName} anota en el partido`,
      prob: Math.min(85, Math.max(25, Math.round(50 + (dogStats.gf - favStats.ga) * 20))),
      reason: `${dogName} promedia ${dogStats.gf.toFixed(1)} goles a favor, frente a una defensa que recibe ${favStats.ga.toFixed(1)} por partido.`,
    },
    {
      market: `${dogName} gana (sorpresa)`,
      prob: dogProb,
      reason: `${dogName} parte como no favorito — su probabilidad estimada es de apenas ${dogProb}%, pero el fútbol da sorpresas.`,
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
