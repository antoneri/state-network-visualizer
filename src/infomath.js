export function plogp(p) {
  return p > 0 ? p * Math.log2(p) : 0;
}

export function entropy(X) {
  let H = 0;
  for (let x of X) {
    H -= plogp(x);
  }
  return H;
}

export function entropyRate(weights) {
  let totWeight = 0;

  const H = weights.reduce((H, w) => {
    const outWeight = w.reduce((a, b) => a + b, 0);
    totWeight += outWeight;
    const isNormalized = Math.abs(outWeight - 1) < 1e-6;
    const normalizedWeights = !isNormalized ? w.map(weight => weight / outWeight) : w;
    return H + entropy(normalizedWeights) * outWeight;
  }, 0);

  return H / totWeight;
}
