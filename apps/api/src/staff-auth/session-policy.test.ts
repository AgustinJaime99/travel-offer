import { describe, expect, it } from 'vitest';
import {
  isSessionActive,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  shouldTouchSession,
} from './session-policy.js';

const start = new Date('2026-10-02T10:00:00Z');
const at = (ms: number) => new Date(start.getTime() + ms);
const fresh = { lastSeenAt: start, expiresAt: at(SESSION_ABSOLUTE_TIMEOUT_MS) };

describe('session policy', () => {
  it('is active right after creation', () => {
    expect(isSessionActive(fresh, start)).toBe(true);
  });

  it('expires after 2 hours idle', () => {
    expect(isSessionActive(fresh, at(SESSION_IDLE_TIMEOUT_MS - 1))).toBe(true);
    expect(isSessionActive(fresh, at(SESSION_IDLE_TIMEOUT_MS))).toBe(false);
  });

  it('expires 12 hours after creation even when used continuously', () => {
    const recentlySeen = { ...fresh, lastSeenAt: at(SESSION_ABSOLUTE_TIMEOUT_MS - 1000) };
    expect(isSessionActive(recentlySeen, at(SESSION_ABSOLUTE_TIMEOUT_MS - 1))).toBe(true);
    expect(isSessionActive(recentlySeen, at(SESSION_ABSOLUTE_TIMEOUT_MS))).toBe(false);
  });

  it('touches lastSeenAt at most once a minute', () => {
    expect(shouldTouchSession(fresh, at(59_999))).toBe(false);
    expect(shouldTouchSession(fresh, at(60_000))).toBe(true);
  });
});
