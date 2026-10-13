import { describe, expect, it } from 'vitest';
import { decodeDrive } from './drive.ts';

const AT = '2026-12-27T13:00:00.000Z';
const API = {
  origin: { lat: 40.761, lon: -111.891 },
  results: {
    alta: { min: 48, mi: 31.2 },
    brighton: { min: 46, mi: 31, via: 'bcc-mouth' },
    'deer-valley': { min: 41, mi: 34.5, warning: 'route uses seasonally closed Guardsman Pass' },
    'park-city': { min: 1, mi: 1 },
    snowbird: { min: '45', mi: 29.9 },
  },
  computedAt: AT,
};

describe('decodeDrive', () => {
  it('keys an API answer by its origin and keeps only well-formed legs of known resorts', () => {
    expect(decodeDrive(API)).toEqual({
      key: '40.761,-111.891',
      results: {
        alta: { min: 48, mi: 31.2 },
        brighton: { min: 46, mi: 31, via: 'bcc-mouth' },
        'deer-valley': { min: 41, mi: 34.5, warning: 'route uses seasonally closed Guardsman Pass' },
      },
      computedAt: AT,
    });
  });

  it('round-trips a stored value and rejects another point, no legs or junk', () => {
    const stored = decodeDrive(API);
    expect(decodeDrive(JSON.parse(JSON.stringify(stored)), '40.761,-111.891')).toEqual(stored);
    expect(decodeDrive(API, '40.62,-111.81')).toBeNull();
    expect(decodeDrive({ ...API, results: {} })).toBeNull();
    expect(decodeDrive({ ...API, computedAt: 1 })).toBeNull();
    expect(decodeDrive('nope')).toBeNull();
  });
});
