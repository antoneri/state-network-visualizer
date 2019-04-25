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

export function entropyRate({ states, links }) {
  const H = states.reduce((H, state) => {
    const weights = state.links.map(link => link.weight);
    const outWeight = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map(weight => weight / outWeight);
    return H + entropy(normalizedWeights) * outWeight;
  }, 0);

  const totWeight = links
    .map(link => link.weight)
    .reduce((a, b) => a + b, 0);
  return H / totWeight;
}
