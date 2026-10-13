import { describe, expect, it } from 'vitest';
import { localDate, localHM } from '../../../shared/time.ts';
import guardsmanJson from '../fixtures/roads/20261012-guardsman.json?raw';
import liveJson from '../fixtures/roads/20261012-live.json?raw';
import { classifyPost, postText } from './classify.ts';
import { canyonOf, keyedPages, parsePage } from './signs.ts';

const CC = 'https://cottonwoodcanyons.udot.utah.gov';
const OV = 'https://ogdenvalley.udot.utah.gov';
const guardsman = JSON.parse(guardsmanJson) as { id: number }[];
const live = JSON.parse(liveJson) as { wp: Record<string, unknown[]> };
const post = (html: string, dateGmt = '2026-02-19T05:05:00', id = 1) => ({
  id,
  date_gmt: dateGmt,
  link: `${CC}/p/${id}`,
  content: { rendered: html },
});
const facts = (html: string, dateGmt?: string, site = CC) => {
  const f = classifyPost(post(html, dateGmt), site);
  if (!f) throw new Error('post did not classify');
  return f;
};
const byId = (id: number) => {
  const f = classifyPost(
    guardsman.find((p) => p.id === id),
    CC,
  );
  if (!f) throw new Error(`no post ${id}`);
  return f;
};

describe('postText', () => {
  it('keeps img alt text, breaks on block ends and decodes entities', () => {
    const t = postText(
      '<p><img src="x.png" alt="🚨" class="wp-smiley" /> Traction Law IN EFFECT: SR-190 &amp; SR-210&nbsp;</p><p>B<br>C</p>',
    );
    expect(t).toBe('🚨 Traction Law IN EFFECT: SR-190 & SR-210\nB\nC');
  });
});

describe('classifyPost: spec sentences (§5.6)', () => {
  it('Alta 2/18: will close at 12:30am -> closure-scheduled with closesAt, eto and reason', () => {
    const f = facts('<p>Highway 210 will close at 12:30am for avalanche mitigation. Estimated opening at 8:30am.</p>');
    expect(f.state).toBe('closure-scheduled');
    expect(f.corridors).toEqual(['lcc']);
    expect(f.closesAt && localDate(f.closesAt)).toBe('2026-02-19'); // posted 22:05 MST on 2/18: the next day
    expect(f.closesAt && localHM(f.closesAt)).toBe('00:30');
    expect(f.eto).toBe('8:30AM');
    expect(f.reason).toBe('avalanche');
  });

  it('00:40:16Z uphill restriction alert -> uphill-restricted, eto UNKNOWN, reason weather', () => {
    const f = byId(13255);
    expect(f.state).toBe('uphill-restricted');
    expect(f.eto).toBe('UNKNOWN');
    expect(f.reason).toBe('weather');
    expect(f.corridors).toEqual(['bcc']);
  });

  it('07:50:41Z "SR-190 OPEN: Both directions" -> open, beats the Road Closure Update heading', () => {
    const f = byId(13267);
    expect(f.state).toBe('open');
    expect(f.headline).toBe('SR-190 OPEN: Both directions.');
  });

  it('16:32:54Z Guardsman-only closure -> info for BCC with guardsman text; "uphills" is not UPHILL', () => {
    const f = byId(13271);
    expect(f.state).toBeNull();
    expect(f.corridors).toEqual(['bcc']);
    expect(f.closesAt).toBeNull(); // the 9:30pm closure sits in a Guardsman sentence
    expect(f.guardsman).toMatch(/^Guardsman Pass: .*temporarily CLOSED tonight \(10\/12\) at 9:30pm/);
  });

  it('traction, crash and parking sentences from the winter feed', () => {
    const t = facts('<p>👋SR-190 ROAD CONDITIONS</p><p>Upper: snow covered</p><p>🚨Traction devices are REQUIRED</p>');
    expect([t.state, t.traction, t.corridors]).toEqual(['traction', true, ['bcc']]);
    const crash = facts(
      '<p>⚠️ Crash Alert ⚠️</p><p>SR-190: Multiple vehicle slide offs – slick road conditions.</p><p>EXPECT: Travel delays/stopped traffic in both directions</p>',
    );
    expect([crash.state, crash.delay, crash.reason]).toEqual(['delays', true, 'crash']);
    expect(facts('<p>Parking in Alta is now FULL</p>').parkingFull).toEqual(['alta']);
    expect(facts('<p>Parking at Snowbird in free and paid lots is now FULL.</p>').parkingFull).toEqual(['snowbird']);
    expect(facts('<p>SR-190 travelers: Brighton Resort parking lot is FULL</p>').parkingFull).toEqual(['brighton']);
  });

  it('interlodge wins; a post that matches no rule is info', () => {
    expect(facts('<p>Town of Alta: INTERLODGE in effect until further notice. SR-210 closed.</p>').state).toBe(
      'interlodge',
    );
    const info = facts('<p>SR-210 FORECAST: snow through the day, 2-4" of road snow.</p>');
    expect([info.state, info.headline, info.corridors]).toEqual([null, null, ['lcc']]);
  });

  it('"Traction Law LIFTED" is an open post that ends traction (O4 extension)', () => {
    const f = facts('<p>Traction Law LIFTED for both Big &amp; Little Cottonwood Canyons (SR-190, SR-210)</p>');
    expect([f.state, f.lifted, f.traction, f.corridors]).toEqual(['open', true, false, ['lcc', 'bcc']]);
  });

  it('I-84 Weber Canyon bridge post -> standing advisory, no state, until about +60 days', () => {
    const raw = live.wp[OV]?.find((p) => (p as { id: number }).id === 12460);
    const f = classifyPost(raw, OV);
    expect(f?.state).toBeNull();
    expect(f?.corridors).toEqual(['snowbasin']);
    expect(f?.advisory?.route).toBe('I-84');
    expect(f?.advisory?.text).toMatch(/^Construction for Weber Canyon Bridge replacement/);
    expect(f?.advisory && localDate(f.advisory.until)).toBe('2026-12-08'); // 'late Spring' beats 'through Oct. 15'
  });

  it('rejects malformed posts', () => {
    expect(classifyPost({ id: 1, content: { rendered: 'x' } }, CC)).toBeNull();
    expect(classifyPost('nope', CC)).toBeNull();
  });
});

describe('signs', () => {
  it("parses 'BCC TOP 27 MIN<br>LCC TOP 24 MIN' and keys canyons by text", () => {
    const p = parsePage('BCC TOP 27 MIN<br>LCC TOP 24 MIN');
    expect(p.travel).toEqual([
      { dest: 'BCC TOP', min: 27 },
      { dest: 'LCC TOP', min: 24 },
    ]);
    expect(p.travel.map((t) => canyonOf(t.dest))).toEqual(['bcc', 'lcc']);
    expect(parsePage('BIG  COTTONWOOD<br/>CANYON  TOP<br/>24min').travel).toEqual([
      { dest: 'BIG COTTONWOOD CANYON TOP', min: 24 },
    ]);
  });

  it('prepends the header, ignores speed limits and keeps other text as advisory', () => {
    const p = parsePage('TIME TO<br/>PARK CITY&nbsp;15min<br/>I-84&nbsp;39min');
    expect(p.travel).toEqual([
      { dest: 'TIME TO PARK CITY', min: 15 },
      { dest: 'TIME TO I-84', min: 39 },
    ]);
    expect(parsePage('SPEED LIMIT<br/>45<br/>CHAINS REQUIRED').advisory).toEqual(['SPEED LIMIT', 'CHAINS REQUIRED']);
    expect(keyedPages('<MSG>A<BR/>B</MSG><MSG>C</MSG>')).toEqual(['A<BR/>B', 'C']);
  });
});
