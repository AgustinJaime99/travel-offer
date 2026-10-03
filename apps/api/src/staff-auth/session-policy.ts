// Approved in Phase 0 (ARCHITECTURE.md, staff sessions).
export const SESSION_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
/** lastSeenAt is refreshed at most this often, to avoid a write on every request. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

export interface SessionTimes {
  lastSeenAt: Date;
  expiresAt: Date;
}

export function isSessionActive(session: SessionTimes, now: Date): boolean {
  return (
    now.getTime() < session.expiresAt.getTime() &&
    now.getTime() - session.lastSeenAt.getTime() < SESSION_IDLE_TIMEOUT_MS
  );
}

export function shouldTouchSession(session: SessionTimes, now: Date): boolean {
  return now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}
