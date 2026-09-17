// NFL version of the picks engine. Same idea as soccer's picks.js — turn
// team stats into 9 varied markets split into 3 risk tiers of 3 — but
// named the way Mexican sportsbooks (e.g. Playdoit) label them: Ganador
// del partido (moneyline), Hándicap (spread), Total de puntos (over/under).

function probToAmerican(prob) {
  const p = Math.min(0.92, Math.max(0.08, prob / 100));
  if (p >= 0.5) return -Math.round((p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

// stats: { winPct, pf (points for/game), pa (points against/game) }
function estimateProbs(homeStats, awayStats) {
  const base = (homeStats.winPct - awayStats.winPct) / 2 + 50;
  const marginAdj = (homeStats.pf - homeStats.pa) - (awayStats.pf - awayStats.pa);
  // small home-field edge, typical in NFL
  let homeWinProb = Math.min(88, Math.max(10, Math.round(base + marginAdj * 1.2 + 2)));
  let awayWinProb = 100 - homeWinProb;
  return { homeWinProb, awayWinProb };
}

export function buildNflMarkets(homeName, awayName, homeStats, awayStats) {
  const { homeWinProb, awayWinProb } = estimateProbs(homeStats, awayStats);
  const favIsHome = homeWinProb >= awayWinProb;
  const favName = favIsHome ? homeName : awayName;
  const dogName = favIsHome ? awayName : homeName;
  const favProb = Math.max(homeWinProb, awayWinProb);
  const dogProb = Math.min(homeWinProb, awayWinProb);
  const favStats = favIsHome ? homeStats : awayStats;
  const dogStats = favIsHome ? awayStats : homeStats;

  const expectedMargin = Math.max(1, Math.round(((favProb - 50) / 50) * 17));

  // Expected total = each team's scoring average blended with what the
  // OTHER team's defense typically allows — not just adding both offenses.
  const homeExpected = (homeStats.pf + awayStats.pa) / 2;
  const awayExpected = (awayStats.pf + homeStats.pa) / 2;
  const projectedTotal = homeExpected + awayExpected;
  // Set the line a few points under our own projection so "Más de" has a
  // real (if modest) edge, the way a value bet should — not a coin flip
  // at our own number.
  const totalLine = Math.max(20, Math.round((projectedTotal - 3) * 2) / 2);
  const overProb = Math.min(78, Math.max(35, Math.round(50 + (projectedTotal - totalLine) * 4)));

  const candidates = [
    {
      market: `${favName} - Ganador del partido`,
      prob: favProb,
      reason: `${favName} tiene ${favProb}% de probabilidad estimada, con récord de ${favStats.winPct}% de victorias y diferencial de ${(favStats.pf - favStats.pa).toFixed(1)} pts/juego.`,
    },
    {
      market: `${favName} -${expectedMargin} (Hándicap)`,
      prob: Math.max(20, favProb - 12),
      reason: `Con un margen esperado de ~${expectedMargin} puntos según su diferencial de anotación, cubrir un hándicap de -${expectedMargin} es más ajustado que solo ganar.`,
    },
    {
      market: `${dogName} +${expectedMargin} (Hándicap)`,
      prob: Math.min(85, 100 - (favProb - 12)),
      reason: `${dogName} no necesita ganar, solo mantenerse dentro de ${expectedMargin} puntos — un colchón real dado su nivel.`,
    },
    {
      market: `Total de puntos: Más de ${totalLine}`,
      prob: overProb,
      reason: `Proyectamos ~${projectedTotal.toFixed(1)} puntos combinados (ataque de cada equipo vs. la defensa que enfrenta), por encima de la línea de ${totalLine}.`,
    },
    {
      market: `${favName} -9.5 (Hándicap alto)`,
      prob: Math.max(12, Math.round(favProb * 0.45)),
      reason: `${favName} promedia ${favStats.pf.toFixed(1)} puntos a favor por juego, con margen para un partido decisivo.`,
    },
    {
      market: `Diferencia final de 7 puntos o menos (juego cerrado)`,
      prob: Math.max(25, 60 - Math.abs(favProb - 50)),
      reason: `Entre menor la diferencia de nivel entre ambos equipos, más probable que el marcador quede apretado.`,
    },
    {
      market: `${dogName} anota 20+ puntos`,
      prob: Math.min(80, Math.max(20, Math.round(50 + (dogStats.pf - favStats.pa) * 3))),
      reason: `${dogName} promedia ${dogStats.pf.toFixed(1)} puntos por juego contra una defensa que permite ${favStats.pa.toFixed(1)}.`,
    },
    {
      market: `${dogName} +${expectedMargin + 3} (Hándicap amplio)`,
      prob: Math.min(88, dogProb + 25),
      reason: `${dogName} no es favorito, pero un colchón más amplio de puntos suele cubrirse aunque pierda el partido.`,
    },
    {
      market: `${dogName} - Ganador del partido (sorpresa)`,
      prob: dogProb,
      reason: `${dogName} parte como no favorito — probabilidad estimada de apenas ${dogProb}%, pero en la NFL cualquier domingo pasa de todo.`,
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
