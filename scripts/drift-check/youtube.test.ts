import { describe, expect, it } from 'vitest';
import type { YtSlot } from '../../config/youtube.ts';
import { pageHandles, seedMismatch } from './youtube.ts';

const A = 'cgVMhgI2Dht1tLyFW28p4r4uoCgka4wGNgL3npJ0';
const B = '85gYTybAhS5pjj2NpJ6n93R4VQwgn6aLdHWhpFDx';

describe('pageHandles', () => {
  it('reads embed URLs and click-to-play data-stream-id buttons, deduplicated', () => {
    const html = `<iframe src="https://camstreamer.com/embed/${A}"></iframe>
      <button data-stream-id="${B}">Play</button><button data-stream-id="${A}">Play</button>`;
    expect(pageHandles(html)).toEqual([A, B]);
  });
});

describe('seedMismatch', () => {
  const slots: YtSlot[] = [
    { cam: 'honeycomb-canyon', re: /honeycomb/i, seed: 'moonbeamPk1' },
    { cam: 'moonbeam-parking', re: /moonbeam.*park/i, seed: 'honeycomb01' },
    { cam: 'moonbeam-lift', re: /moonbeam/i, seed: 'moonbeamLft' },
  ];

  it('flags a seed whose title belongs to another slot', () => {
    expect(seedMismatch(slots, 'honeycomb01', 'Honeycomb Canyon')).toBe(
      '`honeycomb01` is seeded on moonbeam-parking but its title "Honeycomb Canyon" matches honeycomb-canyon',
    );
  });

  it('accepts a seed on its first-matching slot and gives no verdict on an unknown title', () => {
    expect(seedMismatch(slots, 'moonbeamLft', 'Moonbeam Lift Line')).toBeNull();
    expect(seedMismatch(slots, 'honeycomb01', 'Sunset over the Wasatch')).toBeNull();
    expect(seedMismatch(slots, 'honeycomb01', null)).toBeNull();
  });
});
