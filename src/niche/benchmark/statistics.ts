export type BootstrapOptions = {
  iterations?: number;
  confidenceLevel?: number;
  seed?: number;
};

export type BootstrapConfidenceInterval = {
  low: number;
  high: number;
};

function clampProbability(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function interpolateSorted(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }
  if (values.length === 1) {
    return values[0] ?? 0;
  }
  const bounded = clampProbability(percentile);
  const index = bounded * (values.length - 1);
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lowerValue = values[lowerIndex] ?? 0;
  const upperValue = values[upperIndex] ?? lowerValue;
  if (lowerIndex === upperIndex) {
    return lowerValue;
  }
  return lowerValue + (upperValue - lowerValue) * (index - lowerIndex);
}

export function computePairedDeltas(
  pairs: Array<{ baseline: number; candidate: number }>,
): number[] {
  return pairs.map((pair) => pair.candidate - pair.baseline);
}

export function computeMean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeMedian(values: number[]): number {
  return computePercentile(values, 0.5);
}

export function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((left, right) => left - right);
  return interpolateSorted(sorted, percentile);
}

export function bootstrapConfidenceInterval(
  deltas: number[],
  options: BootstrapOptions = {},
): BootstrapConfidenceInterval {
  if (deltas.length === 0) {
    return { low: 0, high: 0 };
  }

  const iterations = options.iterations ?? 1000;
  const confidenceLevel = options.confidenceLevel ?? 0.95;
  const random = createMulberry32(options.seed ?? 1);
  const means: number[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const sample: number[] = [];
    for (let sampleIndex = 0; sampleIndex < deltas.length; sampleIndex += 1) {
      const pick = Math.floor(random() * deltas.length);
      sample.push(deltas[pick] ?? 0);
    }
    means.push(computeMean(sample));
  }

  means.sort((left, right) => left - right);
  const alpha = (1 - confidenceLevel) / 2;
  return {
    low: interpolateSorted(means, alpha),
    high: interpolateSorted(means, 1 - alpha),
  };
}

export function buildPairedDeltaSummary(
  deltas: number[],
  options: BootstrapOptions = {},
): {
  meanDelta: number;
  medianDelta: number;
  p10Delta: number;
  p90Delta: number;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
} {
  const interval = bootstrapConfidenceInterval(deltas, options);
  return {
    meanDelta: computeMean(deltas),
    medianDelta: computeMedian(deltas),
    p10Delta: computePercentile(deltas, 0.1),
    p90Delta: computePercentile(deltas, 0.9),
    confidenceIntervalLow: interval.low,
    confidenceIntervalHigh: interval.high,
  };
}
