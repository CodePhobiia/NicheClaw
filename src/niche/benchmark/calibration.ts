export type CalibrationOutcome = "pass" | "fail";

export type CalibrationExample = {
  caseId: string;
  expectedOutcome: CalibrationOutcome;
  graderOutcome: CalibrationOutcome;
  smeOutcome?: CalibrationOutcome;
};

export type CalibrationMetrics = {
  precision: number;
  recall: number;
  agreementRate: number;
  smeSampleCount: number;
  requiredSmeSampleCount: number;
  promotionEligible: boolean;
};

export function requiredSmeSampleCount(goldBenchmarkCaseCount: number): number {
  if (goldBenchmarkCaseCount <= 0) {
    return 0;
  }
  if (goldBenchmarkCaseCount < 20) {
    return goldBenchmarkCaseCount;
  }
  return Math.max(20, Math.ceil(goldBenchmarkCaseCount * 0.1));
}

export function computeCalibrationMetrics(params: {
  examples: CalibrationExample[];
  goldBenchmarkCaseCount: number;
}): CalibrationMetrics {
  const examples = params.examples;
  const required = requiredSmeSampleCount(params.goldBenchmarkCaseCount);
  const smeSampleCount = examples.filter((example) => example.smeOutcome !== undefined).length;

  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let exactMatches = 0;

  for (const example of examples) {
    if (example.expectedOutcome === example.graderOutcome) {
      exactMatches += 1;
    }
    if (example.graderOutcome === "fail" && example.expectedOutcome === "fail") {
      truePositive += 1;
    } else if (example.graderOutcome === "fail" && example.expectedOutcome !== "fail") {
      falsePositive += 1;
    } else if (example.graderOutcome !== "fail" && example.expectedOutcome === "fail") {
      falseNegative += 1;
    }
  }

  const precisionDenominator = truePositive + falsePositive;
  const recallDenominator = truePositive + falseNegative;
  const precision =
    precisionDenominator === 0 ? 0 : truePositive / precisionDenominator;
  const recall = recallDenominator === 0 ? 0 : truePositive / recallDenominator;
  const agreementRate = examples.length === 0 ? 0 : exactMatches / examples.length;

  return {
    precision,
    recall,
    agreementRate,
    smeSampleCount,
    requiredSmeSampleCount: required,
    promotionEligible: examples.length > 0 && smeSampleCount >= required,
  };
}
