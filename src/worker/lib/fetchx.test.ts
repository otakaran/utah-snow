import { describe, expect, it } from 'vitest';
import { BlockedError, createFetchx } from './fetchx.ts';

const FEED = 'https://mtnpowder.com/feed?resortId=65';
const fx = (res: () => Response) => createFetchx({ fetchImpl: async () => res() });

describe('fetchx block detection', () => {
  it('passes a 200 whose only Imperva traces are its cookies and CDN headers', async () => {
    const headers = new Headers([
      ['content-type', 'application/json'],
      ['set-cookie', 'incap_ses_1234_2271506=abc; path=/; Domain=.mtnpowder.com'],
      ['set-cookie', 'visid_incap_2271506=def; expires=Wed, 13 Oct 2027 01:55:00 GMT'],
      ['x-cdn', 'Incapsula'],
      ['x-iinfo', '7-1234-0 0CNN RT(1760320555)'],
    ]);
    const res = await fx(() => new Response('{"Name":"Solitude"}', { headers }))(FEED);
    expect(res).toMatchObject({ status: 200, blocked: false, data: '{"Name":"Solitude"}' });
  });

  it('throws BlockedError on Imperva challenge and block pages', async () => {
    const challenge = '<html><head><META NAME="ROBOTS"></head><iframe src="/_Incapsula_Resource?x=1"></iframe></html>';
    await expect(fx(() => new Response(challenge))(FEED)).rejects.toBeInstanceOf(BlockedError);
    const block = 'Request unsuccessful. Incapsula incident ID: 1';
    await expect(fx(() => new Response(block, { status: 403 }))(FEED)).rejects.toBeInstanceOf(BlockedError);
    const cf = () => new Response('<title>Just a moment...</title>', { status: 403, headers: { 'cf-mitigated': '1' } });
    expect(await fx(cf)(FEED, { allowBlocked: true, allowStatus: true })).toMatchObject({ status: 403, blocked: true });
  });
});
