import { describe, expect, it } from 'vitest';
import { NO_COORDS, parseMapsLink, SHORT_LINK_HINT } from './parse-maps-link.ts';

describe('parseMapsLink', () => {
  it('prefers the place pin (!3d!4d) over the map center (@lat,lon)', () => {
    const place =
      'https://www.google.com/maps/place/Hotel/@40.7601,-111.8952,15z/data=!3m1!4b1!4m9!3m8!1s0x0:0x1!8m2!3d40.76084!4d-111.89104';
    expect(parseMapsLink(place)).toEqual({ lat: 40.76084, lon: -111.89104 });
    expect(parseMapsLink(' https://www.google.com/maps/@40.6197,-111.8105,14z ')).toEqual({
      lat: 40.6197,
      lon: -111.8105,
    });
  });

  it('reads ?q= and ll= queries, URL-encoded commas included', () => {
    expect(parseMapsLink('https://maps.google.com/?q=40.5650,-111.8389')).toEqual({ lat: 40.565, lon: -111.8389 });
    expect(parseMapsLink('https://maps.google.com/maps?z=12&ll=40.6461%2C-111.498')).toEqual({
      lat: 40.6461,
      lon: -111.498,
    });
  });

  it('asks for the full URL on short links and reports links without coordinates', () => {
    expect(parseMapsLink('https://maps.app.goo.gl/AbCdEf123')).toEqual({ error: SHORT_LINK_HINT });
    expect(parseMapsLink('https://www.google.com/maps/place/Alta+Lodge')).toEqual({ error: NO_COORDS });
    expect(parseMapsLink('')).toEqual({ error: NO_COORDS });
  });
});
