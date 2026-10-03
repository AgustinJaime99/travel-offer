export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;

export interface LoginAttemptContext {
  email: string;
  ip: string;
}

interface Rule {
  limit: number;
  key: (context: LoginAttemptContext) => string;
  /** Whether a successful login clears this counter. */
  resetOnSuccess: boolean;
}

/**
 * Counts failed password checks in a fixed 15-minute window per key. The email-only rule protects an
 * account even when X-Forwarded-For is spoofed; the IP-only rule slows credential stuffing.
 * In-memory: valid for a single API instance (ADR-09).
 */
const RULES: readonly Rule[] = [
  { limit: 5, key: ({ email, ip }) => `email-ip:${email}|${ip}`, resetOnSuccess: true },
  { limit: 20, key: ({ email }) => `email:${email}`, resetOnSuccess: false },
  { limit: 50, key: ({ ip }) => `ip:${ip}`, resetOnSuccess: false },
];

/** Beyond this many live keys (a flood of distinct emails/IPs) new attempts are refused: fail closed. */
const MAX_TRACKED_KEYS = 100_000;

export class LoginAttemptLimiter {
  private readonly failures = new Map<string, { count: number; windowStartedAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Starts a password check: false when a limit is reached. Otherwise the attempt is counted as a
   * failure right away, synchronously, so concurrent requests cannot all pass before the slow hash
   * verification records them; `succeeded` gives it back.
   */
  tryBegin(context: LoginAttemptContext): boolean {
    if (RULES.some((rule) => this.currentCount(rule.key(context)) >= rule.limit)) return false;
    if (this.failures.size >= MAX_TRACKED_KEYS) {
      this.pruneExpired();
      if (this.failures.size >= MAX_TRACKED_KEYS) return false;
    }
    for (const rule of RULES) {
      const key = rule.key(context);
      const count = this.currentCount(key);
      const windowStartedAt =
        count === 0 ? this.now() : (this.failures.get(key)?.windowStartedAt ?? this.now());
      this.failures.set(key, { count: count + 1, windowStartedAt });
    }
    return true;
  }

  /** The password was right: clears the email+IP counter and refunds the attempt elsewhere. */
  succeeded(context: LoginAttemptContext): void {
    for (const rule of RULES) {
      const key = rule.key(context);
      const entry = this.failures.get(key);
      if (!entry) continue;
      if (rule.resetOnSuccess || entry.count <= 1) this.failures.delete(key);
      else entry.count -= 1;
    }
  }

  private currentCount(key: string): number {
    const entry = this.failures.get(key);
    if (!entry || this.now() - entry.windowStartedAt >= LOGIN_FAILURE_WINDOW_MS) return 0;
    return entry.count;
  }

  private pruneExpired(): void {
    for (const [key, entry] of this.failures) {
      if (this.now() - entry.windowStartedAt >= LOGIN_FAILURE_WINDOW_MS) this.failures.delete(key);
    }
  }
}
