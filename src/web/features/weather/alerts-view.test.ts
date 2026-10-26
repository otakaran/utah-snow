import { describe, expect, it } from 'vitest';
import type { NwsAlert } from '../../../shared/types.ts';
import { alertsView, alertTone, alertWord, whenText, zoneResorts } from './alerts-view.ts';

const NOW = Date.parse('2027-01-05T20:00:00Z'); // Tue 1:00 PM MST

const alert = (over: Partial<NwsAlert>): NwsAlert => ({
  event: 'Winter Storm Warning',
  severity: 'Moderate',
  headline: 'Heavy snow expected.',
  onset: null,
  ends: null,
  zones: ['UTZ111'],
  ...over,
});

describe('zoneResorts', () => {
  it('maps UGC zones to resorts through their NWS points, canonical order, each once', () => {
    expect(zoneResorts(['UTZ111'])).toEqual(['alta', 'snowbird', 'brighton', 'solitude', 'deer-valley']);
    expect(zoneResorts(['UTZ108', 'UTZ111'])).toContain('deer-valley');
    expect(zoneResorts(['UTZ108'])).toEqual(['deer-valley']); // its base point
    expect(zoneResorts(['UTZ110'])).toEqual(['snowbasin']);
    expect(zoneResorts(['UTZ105'])).toEqual([]); // valley only
  });
});

describe('tone and word', () => {
  it('follows severity for the tone and the event name for the word', () => {
    expect([alertTone('Extreme'), alertTone('Severe'), alertTone('Moderate'), alertTone('Minor')]).toEqual([
      'bad',
      'bad',
      'warn',
      'off',
    ]);
    expect(alertWord('Winter Storm Warning', 'Severe')).toBe('Warning');
    expect(alertWord('Wind Advisory', 'Moderate')).toBe('Advisory');
    expect(alertWord('Avalanche Watch', 'Severe')).toBe('Watch');
    expect(alertWord('Special Weather Statement', 'Minor')).toBe('Statement');
    expect(alertWord('Snow Squall', 'Severe')).toBe('Severe');
  });
});

describe('whenText', () => {
  it('reads Denver clock times relative to today', () => {
    expect(whenText('2027-01-06T01:00:00Z', NOW)).toBe('6:00 PM');
    expect(whenText('2027-01-06T13:00:00Z', NOW)).toBe('6:00 AM tomorrow');
    expect(whenText('2027-01-08T01:00:00Z', NOW)).toBe('Thu 6:00 PM');
    expect(whenText('2027-01-20T01:00:00Z', NOW)).toBe('Jan 19 6:00 PM');
  });
});

describe('alertsView', () => {
  it('keeps active alerts, worst first, with their span and resort tags', () => {
    const views = alertsView(
      [
        alert({ event: 'Wind Advisory', zones: ['UTZ105'], ends: '2027-01-06T01:00:00Z' }),
        alert({
          severity: 'Severe',
          onset: '2027-01-07T01:00:00Z',
          ends: '2027-01-08T01:00:00Z',
          zones: ['UTZ110', 'UTZ111'],
        }),
        alert({ event: 'Avalanche Warning', ends: '2027-01-05T19:00:00Z' }), // ended an hour ago
      ],
      NOW,
    );
    expect(views.map((v) => [v.tone, v.word, v.event])).toEqual([
      ['bad', 'Warning', 'Winter Storm Warning'],
      ['warn', 'Advisory', 'Wind Advisory'],
    ]);
    expect(views[0]?.when).toBe('from 6:00 PM tomorrow until Thu 6:00 PM');
    expect(views[0]?.tags).toEqual(['Alta', 'Snowbird', 'Brighton', 'Solitude', 'Deer Valley', 'Snowbasin']);
    expect(views[1]?.when).toBe('until 6:00 PM');
    expect(views[1]?.tags).toEqual(['UTZ105']);
  });

  it('copes with placeholders and alerts without times', () => {
    expect(alertsView({}, NOW)).toEqual([]);
    expect(alertsView([{ event: 1 }, null], NOW)).toEqual([]);
    expect(alertsView([alert({})], NOW)[0]?.when).toBe('');
  });
});
