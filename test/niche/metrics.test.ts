import { describe, expect, it, beforeEach } from "vitest";
import {
  incrementNicheMetric,
  getNicheMetrics,
  resetNicheMetrics,
  getNicheMetricsStartTime,
} from "../../src/niche/metrics.js";

describe("niche metrics", () => {
  beforeEach(() => {
    resetNicheMetrics();
  });

  it("starts with empty metrics", () => {
    expect(getNicheMetrics()).toEqual({});
  });

  it("increments a metric by 1 by default", () => {
    incrementNicheMetric("promotions_total");
    expect(getNicheMetrics()).toEqual({ promotions_total: 1 });
  });

  it("increments a metric by a custom delta", () => {
    incrementNicheMetric("traces_total", 5);
    expect(getNicheMetrics()).toEqual({ traces_total: 5 });
  });

  it("accumulates multiple increments", () => {
    incrementNicheMetric("rollbacks_total");
    incrementNicheMetric("rollbacks_total");
    incrementNicheMetric("rollbacks_total", 3);
    expect(getNicheMetrics()).toEqual({ rollbacks_total: 5 });
  });

  it("tracks multiple metrics independently", () => {
    incrementNicheMetric("promotions_total");
    incrementNicheMetric("benchmarks_total", 2);
    expect(getNicheMetrics()).toEqual({
      promotions_total: 1,
      benchmarks_total: 2,
    });
  });

  it("resets all metrics", () => {
    incrementNicheMetric("promotions_total");
    incrementNicheMetric("rollbacks_total");
    resetNicheMetrics();
    expect(getNicheMetrics()).toEqual({});
  });

  it("returns a start time", () => {
    const startTime = getNicheMetricsStartTime();
    expect(startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
