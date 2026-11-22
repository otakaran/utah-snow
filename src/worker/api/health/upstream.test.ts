import { describe, expect, it } from 'vitest';
import { UPSTREAM_GRACE_MIN } from '../../../../config/schedule.ts';
import { MIN } from '../../../shared/time.ts';
import { inUpstreamGrace, isNetworkError } from './upstream.ts';

describe('isNetworkError', () => {
  it('accepts timeouts, connection failures, HTTP 5xx and 429', () => {
    for (const e of [
      'TimeoutError: The operation was aborted due to timeout',
      'AbortError: The operation was aborted',
      'TypeError: fetch failed',
      'Network connection lost.',
      'getaddrinfo ENOTFOUND api.example.com',
      'HttpError: HTTP 503 https://api.example.com/x',
      'HttpError: HTTP 429 https://api.example.com/x',
      'alta: HTTP 503 (redirects are not followed)',
      'nws-grid: HTTP 502 https://api.weather.gov/x',
      'HTTP 500 https://api.example.com/x',
    ]) {
      expect([e, isNetworkError(e)]).toEqual([e, true]);
    }
  });

  it('rejects parse, block, 4xx, deferral and unknown errors', () => {
    for (const e of [
      null,
      'ValidationError: snowbird: no lifts (timeout? DNS?)',
      'BlockedError: blocked https://api.example.com/x',
      'HttpError: HTTP 404 https://api.example.com/x',
      'HttpError: HTTP 403 https://api.example.com/x',
      'alta: HTTP 301 (redirects are not followed)',
      'ValidationError: alta: HTTP 503 in the body text',
      'deferred',
      'SyntaxError: Unexpected token < in JSON',
      'something odd',
    ]) {
      expect([e, isNetworkError(e)]).toEqual([e, false]);
    }
  });
});

describe('inUpstreamGrace', () => {
  const now = 1_800_000_000_000;
  const timeout = 'TimeoutError: The operation was aborted due to timeout';
  it('holds only for an error row with a success inside the grace window', () => {
    expect(inUpstreamGrace('error', timeout, now - UPSTREAM_GRACE_MIN * MIN, now)).toBe(true);
    expect(inUpstreamGrace('error', timeout, now - (UPSTREAM_GRACE_MIN + 1) * MIN, now)).toBe(false);
    expect(inUpstreamGrace('error', timeout, null, now)).toBe(false);
    expect(inUpstreamGrace('blocked', timeout, now - MIN, now)).toBe(false);
  });
});
