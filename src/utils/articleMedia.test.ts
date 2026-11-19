import test from 'node:test';
import assert from 'node:assert/strict';
import { ARTICLES_CATALOG, MEDIA_ASSETS } from '../data/editorialData.ts';
import {
  formatMediaDuration,
  getImageMedia,
  getVideoMedia,
  hasVideoMedia,
  resolveMediaById,
} from './articleMedia.ts';

test('hasVideoMedia detects video articles solely from media asset properties', () => {
  const mclArticle = ARTICLES_CATALOG.find(
    (a) => a.slug === 'mahanadi-coalfields-ipo-proposed-offer-financial-details',
  );
  const egyptArticle = ARTICLES_CATALOG.find(
    (a) => a.slug === 'india-egypt-explore-cooperation-evs-fintech-renewable-energy',
  );
  const nhcArticle = ARTICLES_CATALOG.find(
    (a) => a.slug === 'nhc-foods-q2-fy27-results-total-income-surges-pat-jumps-strategic-acquisition',
  );

  assert.ok(mclArticle, 'MCL article should exist');
  assert.ok(egyptArticle, 'India-Egypt article should exist');
  assert.ok(nhcArticle, 'NHC Foods article should exist');

  assert.equal(hasVideoMedia(mclArticle), true);
  assert.equal(hasVideoMedia(egyptArticle), false);
  assert.equal(hasVideoMedia(nhcArticle), true);

  const mclMedia = getVideoMedia(mclArticle);
  const egyptImage = getImageMedia(egyptArticle);
  const nhcMedia = getVideoMedia(nhcArticle);
  assert.equal(mclMedia?.posterUrl, '/assets/aistudio/mcl_ipo_poster.jpg');
  assert.equal(egyptImage?.publicUrl, '/assets/aistudio/modi-egypt_6ce0cd7d.webp');
  assert.equal(nhcMedia?.posterUrl, '/assets/aistudio/nhc_foods_poster.jpg');
});

test('hasVideoMedia rejects non-video media types and empty URLs', () => {
  assert.equal(hasVideoMedia(undefined), false);
  assert.equal(hasVideoMedia(null), false);
  assert.equal(hasVideoMedia({}), false);
  assert.equal(
    hasVideoMedia({
      media: {
        id: 'img-1',
        fileName: 'chart.png',
        storagePath: 'public/chart.png',
        publicUrl: '/chart.png',
        mediaType: 'image/png',
        title: 'Chart',
        caption: 'Chart',
        sourceNote: 'Test',
      },
    }),
    false,
  );
  assert.equal(
    hasVideoMedia({
      media: {
        id: 'vid-empty',
        fileName: 'empty.mp4',
        storagePath: '',
        publicUrl: '   ',
        mediaType: 'video/mp4',
        title: 'Empty',
        caption: 'Empty',
        sourceNote: 'Test',
      },
    }),
    false,
  );
});

test('resolveMediaById resolves known media assets and ignores unknown IDs', () => {
  const found = resolveMediaById('media-nhc-foods-q2-fy27', MEDIA_ASSETS);
  assert.equal(found?.publicUrl, '/assets/aistudio/nhc_foods_q2_fy27.mp4');
  assert.equal(resolveMediaById('does-not-exist', MEDIA_ASSETS), undefined);
  assert.equal(resolveMediaById(undefined, MEDIA_ASSETS), undefined);
});

test('formatMediaDuration formats seconds and minutes cleanly', () => {
  assert.equal(formatMediaDuration(20), '20s');
  assert.equal(formatMediaDuration(43), '43s');
  assert.equal(formatMediaDuration(75), '1:15');
  assert.equal(formatMediaDuration(0), null);
  assert.equal(formatMediaDuration(undefined), null);
});

test('hasVideoMedia detects video/youtube assets and resolves privacy-enhanced embed poster', () => {
  const ytItem = {
    media: {
      id: 'yt-1',
      fileName: 'yt-dQw4w9WgXcQ',
      storagePath: 'youtube:dQw4w9WgXcQ',
      publicUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      mediaType: 'video/youtube' as const,
      youtubeVideoId: 'dQw4w9WgXcQ',
      title: 'Budget Briefing',
      caption: 'Briefing video',
      sourceNote: 'SakarBazaar',
    },
  };
  assert.equal(hasVideoMedia(ytItem), true);
  const resolved = getVideoMedia(ytItem);
  assert.equal(resolved?.posterUrl, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
});

