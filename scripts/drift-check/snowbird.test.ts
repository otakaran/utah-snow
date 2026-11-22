import { describe, expect, it } from 'vitest';
import { pageDataOf } from './snowbird.ts';

const PD = 'https://www.snowbird.com/page-data/the-mountain/webcams/view-all-webcams';

describe('pageDataOf', () => {
  it('drops the anchor from the page-data URL and keeps it in the slug', () => {
    expect(pageDataOf('/the-mountain/webcams/view-all-webcams/webcam-modal#snowstake')).toEqual({
      pageDataUrl: `${PD}/webcam-modal/page-data.json`,
      slug: 'webcam-modal#snowstake',
    });
  });

  it('reads a full pageUrl with a trailing slash like its buttonLink', () => {
    const link = '/the-mountain/webcams/view-all-webcams/hidden-peak-360-webcam';
    expect(pageDataOf(`https://www.snowbird.com${link}/`)).toEqual(pageDataOf(link));
    expect(pageDataOf(link).slug).toBe('hidden-peak-360-webcam');
  });
});
