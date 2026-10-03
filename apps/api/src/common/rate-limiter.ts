export interface RateLimitRule {
  key: string;
  limit: number;
  windowMs: number;
}

const MAX_TRACKED_KEYS = 50_000;

/**
 * Fixed-window request counter for public endpoints (ADR-09). In-memory: valid for a single API
 * instance; horizontal scaling needs a shared store. Each key expires with its own window, so
 * pruning on behalf of a short-window rule never resets a longer one. When the map is full of live
 * keys (a flood of distinct IPs or contacts), new keys are refused: it fails closed rather than
 * growing without bound or forgetting counters early.
 */
export class RateLimiter {
  private readonly windows = new Map<
    string,
    { count: number; startedAt: number; windowMs: number }
  >();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxTrackedKeys = MAX_TRACKED_KEYS,
  ) {}

  /** Counts one request against every rule, only if none of them is exhausted. */
  tryConsume(rules: readonly RateLimitRule[]): boolean {
    if (rules.some((rule) => this.count(rule) >= rule.limit)) return false;
    const newKeys = rules.filter((rule) => this.count(rule) === 0).length;
    if (this.windows.size + newKeys > this.maxTrackedKeys) {
      this.pruneExpired();
      if (this.windows.size + newKeys > this.maxTrackedKeys) return false;
    }
    for (const rule of rules) {
      const current = this.count(rule);
      const startedAt = current === 0 ? this.now() : this.windows.get(rule.key)!.startedAt;
      this.windows.set(rule.key, { count: current + 1, startedAt, windowMs: rule.windowMs });
    }
    return true;
  }

  private count(rule: RateLimitRule): number {
    const window = this.windows.get(rule.key);
    if (!window || this.now() - window.startedAt >= rule.windowMs) return 0;
    return window.count;
  }

  private pruneExpired(): void {
    for (const [key, window] of this.windows) {
      if (this.now() - window.startedAt >= window.windowMs) this.windows.delete(key);
    }
  }
}
