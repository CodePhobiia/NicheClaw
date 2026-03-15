const counters = new Map<string, number>();
const startTime = new Date().toISOString();

export function incrementNicheMetric(name: string, delta = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + delta);
}

export function getNicheMetrics(): Record<string, number> {
  return Object.fromEntries(counters);
}

export function resetNicheMetrics(): void {
  counters.clear();
}

export function getNicheMetricsStartTime(): string {
  return startTime;
}
