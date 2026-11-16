import { describe, expect, it } from 'vitest';
import { DAY, HOUR } from '../../../shared/time.ts';
import { applyThumbs, maxresTargets, type ThumbHit } from './keyless.ts';
import { readState, SLOT_DEFS } from './state.ts';

const NOW = Date.parse('2026-11-16T00:15:00Z');
const EAGLE = 'solitude-eagle-express';
const LINK = 'solitude-link-lift-line';
const hit = (cam: string, id: string, etag: string | null, status = 200): ThumbHit => ({
  cam,
  id,
  kind: 'maxres',
  status,
  etag,
});

describe('maxres thumbnails', () => {
  it('2026-11-15: a maxresdefault_live whose ETag is "0" is a static upload, not a live frame', () => {
    const st = readState(null, NOW);
    applyThumbs(st, [hit(EAGLE, 'oWaG8txpW1c', '"0"'), hit(LINK, 'Yx3QmuKfwjY', '"43829"')], NOW);
    expect(st.slots[EAGLE]).toMatchObject({ maxres: false, maxresAt: NOW, thumbKind: 'live' }); // hq stays usable
    expect(st.slots[LINK]).toMatchObject({ maxres: true, maxresAt: NOW });
    applyThumbs(st, [hit(LINK, 'Yx3QmuKfwjY', null, 404)], NOW + HOUR);
    expect(st.slots[LINK]).toMatchObject({ maxres: false, maxresAt: NOW + HOUR });
    applyThumbs(st, [hit(LINK, 'Yx3QmuKfwjY', null, 503)], NOW + 2 * HOUR); // no answer: nothing changes
    expect(st.slots[LINK]).toMatchObject({ maxres: false, maxresAt: NOW + HOUR });
  });

  it('asks never-checked live slots first, then the ones last asked over a day ago (rows from before maxresAt too)', () => {
    const st = readState(null, NOW);
    const live = SLOT_DEFS.filter((d) => st.slots[d.cam]?.videoId).slice(0, 4);
    const [fresh, old, legacy, never] = live.map((d) => st.slots[d.cam]);
    if (!fresh || !old || !legacy || !never) throw new Error('fixture');
    for (const s of [fresh, old, legacy, never]) s.status = 'live';
    Object.assign(fresh, { maxres: true, maxresAt: NOW - HOUR });
    Object.assign(old, { maxres: true, maxresAt: NOW - DAY - HOUR });
    Object.assign(legacy, { maxres: true });
    delete legacy.maxresAt; // a stored `true` that nothing ever re-asked: how Eagle Express kept its promo photo
    const cams = (n: number) => maxresTargets(st, n, NOW).map((t) => t.cam);
    expect(cams(8)).toEqual([live[3]?.cam, live[1]?.cam, live[2]?.cam]);
    expect(cams(1)).toEqual([live[3]?.cam]);
  });
});
