// NFL version of the picks engine. Same idea as soccer's picks.js — turn
// team stats into 9 varied markets split into 3 risk tiers of 3 — but with
// markets that make sense for American football (spread, totals, blowout,
// upset) instead of soccer markets like BTTS.

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
  const combinedTotal = homeStats.pf + awayStats.pf + (homeStats.pa + awayStats.pa) / 2;

  const candidates = [
    {
      market: `${favName} gana (moneyline)`,
      prob: favProb,
      reason: `${favName} tiene ${favProb}% de probabilidad estimada, con récord de ${favStats.winPct}% de victorias y diferencial de ${(favStats.pf - favStats.pa).toFixed(1)} pts/juego.`,
    },
    {
      market: `${favName} cubre el spread (-${expectedMargin})`,
      prob: Math.max(20, favProb - 12),
      reason: `Con un margen esperado de ~${expectedMargin} puntos según su diferencial de anotación, cubrir un spread de -${expectedMargin} es más ajustado que solo ganar.`,
    },
    {
      market: `${dogName} +${expectedMargin} (cubre el spread)`,
      prob: Math.min(85, 100 - (favProb - 12)),
      reason: `${dogName} no necesita ganar, solo mantenerse dentro de ${expectedMargin} puntos — un colchón real dado su nivel.`,
    },
    {
      market: combinedTotal >= 45 ? `Más de ${Math.round(combinedTotal - 1)} puntos totales` : `Menos de ${Math.round(combinedTotal + 1)} puntos totales`,
      prob: 55,
      reason: `Entre ambos promedian cerca de ${combinedTotal.toFixed(0)} puntos combinados por juego (anotados + permitidos).`,
    },
    {
      market: `${favName} gana por 10+ (blowout)`,
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
      market: `${dogName} mantiene el juego cerca (pierde por menos de 7)`,
      prob: Math.min(75, dogProb + 20),
      reason: `${dogName} no es favorito, pero su nivel sugiere que puede competir sin que el marcador se dispare.`,
    },
    {
      market: `${dogName} gana (upset)`,
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
