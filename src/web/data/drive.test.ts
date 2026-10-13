import { afterEach, describe, expect, it, vi } from 'vitest';
import { customDrive, decodeDrive, driveStatus, syncDrive } from './drive.ts';
import { setBase } from './settings.ts';

const API = {
  origin: { lat: 40.761, lon: -111.891 },
  results: {
    alta: { min: 48, mi: 31.2 },
    brighton: { min: 46, mi: 31, via: 'bcc-mouth' },
    'deer-valley': { min: 41, mi: 34.5, warning: 'route uses seasonally closed Guardsman Pass' },
    'park-city': { min: 1, mi: 1 },
    snowbird: { min: '45', mi: 29.9 },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('decodeDrive', () => {
  it('keys an API answer by its origin and keeps only well-formed legs of known resorts', () => {
    expect(decodeDrive(API)).toEqual({
      key: '40.761,-111.891',
      results: {
        alta: { min: 48, mi: 31.2 },
        brighton: { min: 46, mi: 31, via: 'bcc-mouth' },
        'deer-valley': { min: 41, mi: 34.5, warning: 'route uses seasonally closed Guardsman Pass' },
      },
    });
  });

  it('round-trips a stored value and rejects another point, no legs or junk', () => {
    const stored = decodeDrive(API);
    expect(decodeDrive(JSON.parse(JSON.stringify(stored)), '40.761,-111.891')).toEqual(stored);
    expect(decodeDrive(API, '40.62,-111.81')).toBeNull();
    expect(decodeDrive({ ...API, results: {} })).toBeNull();
    expect(decodeDrive('nope')).toBeNull();
  });
});

describe('syncDrive', () => {
  it('going back to an earlier point in one page view shows its answer again, without a new request', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('X-Requested-With')).toBe('utahsnow');
      const q = new URL(url, 'https://x').searchParams;
      return Response.json({ ...API, origin: { lat: Number(q.get('lat')), lon: Number(q.get('lon')) } });
    });
    vi.stubGlobal('fetch', fetch);
    const visit = async (lat: number) => {
      setBase({ custom: { lat, lon: -111.891, label: 'Hotel' } });
      await syncDrive();
    };
    await visit(40.761);
    await visit(40.62);
    await visit(40.761);
    expect(customDrive.value?.key).toBe('40.761,-111.891');
    expect(driveStatus.value).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
