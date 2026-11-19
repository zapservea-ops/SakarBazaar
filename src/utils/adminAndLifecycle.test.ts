import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOTSTRAPPED_OWNER_EMAIL,
  getPermissionsForRole,
  isValidOperatorEmail,
  normalizeAdminRole,
} from './adminPermissions.ts';
import {
  applyManualFeaturedPlacement,
  applyMinorEditPreservingExpiry,
  canRetryPermanentDeletion,
  computeExpiresAtMs,
  evaluateDeletionApproval,
  extendDurationFromNowOrExpiry,
  formatRemainingDuration,
  isArticleExpired,
  isArticleExpiringSoon,
  isArticlePubliclyVisible,
  resolveDurationHours,
  selectHomepageFeaturedArticles,
  validateArticleDraftInput,
  validateArticlePublishInput,
} from './newsLifecycle.ts';
import {
  canSafelyDeleteMediaAsset,
  computeMediaVisibilityFromArticles,
  estimateMediaQuotaUsage,
  parseYouTubeVideoUrl,
  validateCompressedImagePayload,
} from './mediaLibrary.ts';
import { buildSakarBazaarBackupBundle, validateBackupBundle } from './backupRestore.ts';
import {
  calculateIpoStatusFromDates,
  detectIpoFieldDiffs,
  formatOfficialIpoField,
  normalizeToIsoDate,
} from './ipoLifecycle.ts';
import type { ArticleRecord, StoredArticleDoc } from '../types/sakarbazaar.ts';

test('RBAC: Owner and Publisher permissions match specification', () => {
  assert.equal(normalizeAdminRole('editor', BOOTSTRAPPED_OWNER_EMAIL), 'owner');
  assert.equal(normalizeAdminRole('publisher', 'father@example.com'), 'publisher');
  assert.equal(normalizeAdminRole('editor', 'father@example.com'), 'publisher');
  assert.equal(normalizeAdminRole('admin', 'other@example.com'), 'owner');
  assert.equal(normalizeAdminRole(undefined, 'random@example.com'), 'none');

  const ownerPerms = getPermissionsForRole('owner');
  assert.equal(ownerPerms.canAccessAdmin, true);
  assert.equal(ownerPerms.canApprovePermanentDeletion, true);
  assert.equal(ownerPerms.canManagePermissionsAndSecurity, true);
  assert.equal(ownerPerms.canRestoreBackup, true);

  const pubPerms = getPermissionsForRole('publisher');
  assert.equal(pubPerms.canAccessAdmin, true);
  assert.equal(pubPerms.canPublishNews, true);
  assert.equal(pubPerms.canApprovePermanentDeletion, true);
  assert.equal(pubPerms.canExecutePermanentDeletion, true);
  assert.equal(pubPerms.canExportBackup, true);
  assert.equal(pubPerms.canManageIposAndReviews, true);
  assert.equal(pubPerms.canManagePermissionsAndSecurity, false);
  assert.equal(pubPerms.canRestoreBackup, false);

  const nonePerms = getPermissionsForRole('none');
  assert.equal(nonePerms.canAccessAdmin, false);
  assert.equal(nonePerms.canApprovePermanentDeletion, false);

  assert.equal(isValidOperatorEmail('father@gmail.com'), true);
  assert.equal(isValidOperatorEmail('not-an-email'), false);
});

test('Exact elapsed-hour duration, expiry, extension, and minor edit preservation', () => {
  const pubMs = Date.UTC(2026, 10, 18, 10, 30, 0); // 10:30 UTC
  assert.equal(resolveDurationHours('7d'), 168);
  assert.equal(resolveDurationHours('15d'), 360);
  assert.equal(resolveDurationHours('30d'), 720);
  assert.equal(resolveDurationHours('60d'), 1440);
  assert.equal(resolveDurationHours('custom', 36), 36);

  const expMs = computeExpiresAtMs(pubMs, 168);
  // Exact 168 hours later, not calendar-day midnight
  assert.equal(expMs - pubMs, 168 * 3_600_000);
  assert.equal(isArticlePubliclyVisible({ status: 'Published', expiresAtMs: expMs }, expMs - 1), true);
  assert.equal(isArticlePubliclyVisible({ status: 'Published', expiresAtMs: expMs }, expMs), false);
  assert.equal(isArticlePubliclyVisible({ status: 'Awaiting Verification' }, expMs - 1), false);
  assert.equal(isArticlePubliclyVisible({ editorialStatus: 'Awaiting Verification' }, expMs - 1), true);
  assert.equal(isArticleExpired({ status: 'Published', expiresAtMs: expMs }, expMs), true);
  assert.equal(isArticleExpiringSoon({ status: 'Published', expiresAtMs: expMs }, expMs - 12 * 3_600_000, 48), true);

  // Minor edit preserves publishedAtMs and expiresAtMs
  const original = {
    publishedAt: '18 Nov 2026',
    publishedAtMs: pubMs,
    expiresAtMs: expMs,
    durationHours: 168,
    durationPreset: '7d' as const,
    enHeadline: 'Old headline',
  };
  const edited = applyMinorEditPreservingExpiry(original, {
    enHeadline: 'Updated headline',
    expiresAtMs: 999, // even if passed, minor-edit helper keeps original
  });
  assert.equal(edited.enHeadline, 'Updated headline');
  assert.equal(edited.expiresAtMs, expMs);
  assert.equal(edited.publishedAtMs, pubMs);

  // Extending duration adds exact hours from current expiry when active
  const extended = extendDurationFromNowOrExpiry(expMs, 72, pubMs + 10_000);
  assert.equal(extended, expMs + 72 * 3_600_000);
  assert.match(formatRemainingDuration(expMs, expMs - 36 * 3_600_000), /1d 12h left/);
});

test('Bilingual validation allows incomplete drafts, requires EN+HI for publish, keeps sources strictly optional', () => {
  // Incomplete draft allowed without Hindi or source
  const draftOk = validateArticleDraftInput({
    enHeadline: 'Draft headline only',
    enBody: '',
    hiHeadline: '',
    hiBody: '',
    sourceName: '',
    sourceUrl: '',
    durationPreset: '7d',
  });
  assert.equal(draftOk.valid, true);

  // Publish fails if Hindi missing
  const pubMissingHi = validateArticlePublishInput({
    enHeadline: 'English Headline Here',
    enBody: 'Detailed English article body exceeding twenty characters.',
    hiHeadline: '',
    hiBody: '',
    sourceName: '',
    sourceUrl: '',
    durationPreset: '7d',
  });
  assert.equal(pubMissingHi.valid, false);

  // Publish succeeds with EN+HI even when BOTH sourceName and sourceUrl are blank
  const pubNoSource = validateArticlePublishInput({
    enHeadline: 'English Headline Here',
    enBody: 'Detailed English article body exceeding twenty characters.',
    hiHeadline: 'हिन्दी शीर्षक यहाँ है',
    hiBody: 'यह एक पूर्ण हिन्दी समाचार लेख है जो बीस से अधिक अक्षरों का है।',
    sourceName: '',
    sourceUrl: '',
    durationPreset: '15d',
  });
  assert.equal(pubNoSource.valid, true);

  // Invalid non-http URL fails cleanly
  const badUrl = validateArticlePublishInput({
    enHeadline: 'English Headline Here',
    enBody: 'Detailed English article body exceeding twenty characters.',
    hiHeadline: 'हिन्दी शीर्षक यहाँ है',
    hiBody: 'यह एक पूर्ण हिन्दी समाचार लेख है जो बीस से अधिक अक्षरों का है।',
    sourceName: '',
    sourceUrl: 'javascript:alert(1)',
    durationPreset: '15d',
  });
  assert.equal(badUrl.valid, false);
});

test('Manual featured slots enforce 1 main + up to 3 secondary independent of paid/duration', () => {
  const mkDoc = (id: string, placement: 'none' | 'main' | 'secondary', order = 1): StoredArticleDoc => ({
    id,
    title: id,
    slug: id,
    summary: 'Summary text here',
    body: 'Body content exceeding twenty characters here.',
    enHeadline: id,
    enSummary: 'Summary',
    enBody: 'Body content exceeding twenty characters here.',
    hiHeadline: id,
    hiSummary: 'सारांश',
    hiBody: 'यह एक पूर्ण हिन्दी समाचार लेख है जो बीस से अधिक अक्षरों का है।',
    category: 'Markets',
    tags: [],
    keywords: [],
    entities: [],
    author: 'Desk',
    status: 'Published',
    verificationStatus: 'verified',
    sourceName: '',
    language: 'bilingual',
    featuredPlacement: placement,
    featuredOrder: order,
    createdByUid: 'uid1',
  });

  const existing = [
    mkDoc('a1', 'main', 0),
    mkDoc('a2', 'secondary', 1),
    mkDoc('a3', 'secondary', 2),
    mkDoc('a4', 'secondary', 3),
  ];

  // Setting a2 as main demotes a1 cleanly
  const changes = applyManualFeaturedPlacement(existing, 'a2', 'main', 0);
  assert.deepEqual(changes.find((c) => c.id === 'a1')?.featuredPlacement, 'none');
  assert.deepEqual(changes.find((c) => c.id === 'a2')?.featuredPlacement, 'main');

  // Homepage selection honors manual main & secondary while excluding expired
  const expiredMain: ArticleRecord = {
    id: 'exp-1',
    slug: 'exp-1',
    category: 'Markets',
    headline: 'Expired Lead',
    deck: 'Deck',
    author: 'Desk',
    authorRole: 'Desk',
    publishedAt: '01 Nov 2026',
    updatedAt: '01 Nov 2026',
    time: 'Editorial',
    readTime: '2 min',
    ticker: 'MKT',
    sourceName: '',
    sourceNote: '',
    verificationStatus: 'verified',
    editorialStatus: 'Published',
    expiresAtMs: Date.now() - 10_000,
    featuredPlacement: 'main',
    illustration: 'markets-pulse',
    illustrationCaption: 'Cap',
    tags: [],
    keywords: [],
    entities: [],
    aliases: [],
    keyPoints: [],
    sections: [],
    citations: [],
    relatedSlugs: [],
  };
  const activeSec: ArticleRecord = {
    ...expiredMain,
    id: 'act-1',
    slug: 'act-1',
    headline: 'Active Story',
    expiresAtMs: Date.now() + 86_400_000,
    featuredPlacement: 'secondary',
  };
  const selected = selectHomepageFeaturedArticles([expiredMain, activeSec]);
  assert.equal(selected.mainStory?.id, 'act-1');
});

test('Media library: YouTube parsing, compressed image guard, shared-reference deletion guard, private expiry sync', () => {
  assert.equal(parseYouTubeVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.videoId, 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeVideoUrl('https://youtu.be/dQw4w9WgXcQ?si=abc')?.videoId, 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.videoId, 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeVideoUrl('javascript:alert(1)'), null);
  assert.equal(parseYouTubeVideoUrl('https://vimeo.com/12345'), null);

  const okImg = validateCompressedImagePayload('data:image/jpeg;base64,' + 'A'.repeat(200), 'image/jpeg');
  assert.equal(okImg.valid, true);

  const hugeImg = validateCompressedImagePayload('data:image/jpeg;base64,' + 'A'.repeat(650_000), 'image/jpeg');
  assert.equal(hugeImg.valid, false);

  const now = Date.now();
  const docs = [
    { id: 'art-1', mediaId: 'med-shared', status: 'Published' as const, expiresAtMs: now + 100_000, deletionStatus: 'none' as const },
    { id: 'art-2', mediaId: 'med-shared', status: 'Draft' as const, expiresAtMs: null, deletionStatus: 'none' as const },
    { id: 'art-3', mediaId: 'med-single', status: 'Expired' as const, expiresAtMs: now - 10_000, deletionStatus: 'none' as const },
  ];

  // Deleting art-1 cannot delete med-shared because art-2 still references it
  assert.equal(canSafelyDeleteMediaAsset('med-shared', docs, 'art-1').canDelete, false);
  // Deleting art-3 CAN delete med-single
  assert.equal(canSafelyDeleteMediaAsset('med-single', docs, 'art-3').canDelete, true);

  // Visibility of med-shared is public until art-1 expires; med-single is private because art-3 is Expired
  assert.equal(computeMediaVisibilityFromArticles('med-shared', docs, now).isPublic, true);
  assert.equal(computeMediaVisibilityFromArticles('med-single', docs, now).isPublic, false);

  const quota = estimateMediaQuotaUsage([
    { mediaType: 'image/jpeg', sizeBytes: 150_000 },
    { mediaType: 'image/webp', sizeBytes: 120_000 },
    { mediaType: 'video/youtube', sizeBytes: 0 },
  ]);
  assert.equal(quota.photoCount, 2);
  assert.equal(quota.dailyReadQuotaLimit, 50_000);
});

test('Permanent deletion approval by either user + partial failure retry + full backup/restore validation', () => {
  assert.equal(evaluateDeletionApproval('publisher').allowed, true);
  assert.equal(evaluateDeletionApproval('owner').allowed, true);
  assert.equal(evaluateDeletionApproval('none').allowed, false);
  assert.equal(canRetryPermanentDeletion({ deletionStatus: 'partial_failure' }, 'publisher'), true);
  assert.equal(canRetryPermanentDeletion({ deletionStatus: 'partial_failure' }, 'none'), false);

  const bundle = buildSakarBazaarBackupBundle({
    exportedByUid: 'uid1',
    exportedByEmail: BOOTSTRAPPED_OWNER_EMAIL,
    articles: [],
    media: [
      {
        id: 'med-1',
        fileName: 'photo.jpg',
        mediaType: 'image/jpeg',
        sizeBytes: 100,
        uploadedByUid: 'uid1',
      },
    ],
    mediaPayloads: [
      {
        id: 'med-1',
        mediaId: 'med-1',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(120),
        isPublic: false,
        uploadedByUid: 'uid1',
      },
    ],
    paidCampaigns: [],
    ipos: [],
    ipoSourceReviews: [],
    auditLogs: [],
    authorizedEmails: [],
    systemSettings: [],
  });

  assert.equal(bundle.notes.includesPhotographs, true);
  assert.equal(bundle.notes.excludesYouTubeVideoFiles, true);
  const report = validateBackupBundle(bundle);
  assert.equal(report.valid, true);
  assert.equal(report.summary.mediaPayloads, 1);
  assert.equal(validateBackupBundle({ bad: true }).valid, false);
});

test('IPO IST lifecycle calculation & official source diff detection', () => {
  // Never confuse SEBI filing date with opening date; missing fields return "Not announced"
  assert.equal(formatOfficialIpoField(undefined), 'Not announced');
  assert.equal(normalizeToIsoDate('19 Nov 2026'), '2026-11-19');
  assert.equal(normalizeToIsoDate('19 Nov 2026 (unverified)'), null);

  assert.equal(
    calculateIpoStatusFromDates({
      openingDate: '2026-11-22',
      closingDate: '2026-11-26',
      verificationStatus: 'verified',
      todayIst: '2026-11-18',
    }),
    'Upcoming',
  );
  assert.equal(
    calculateIpoStatusFromDates({
      openingDate: '2026-11-18',
      closingDate: '2026-11-20',
      verificationStatus: 'verified',
      todayIst: '2026-11-18',
    }),
    'Open',
  );
  assert.equal(
    calculateIpoStatusFromDates({
      openingDate: '2026-11-13',
      closingDate: '2026-11-17',
      verificationStatus: 'verified',
      todayIst: '2026-11-18',
    }),
    'Closed',
  );
  assert.equal(
    calculateIpoStatusFromDates({
      openingDate: '2026-11-10',
      closingDate: '2026-11-12',
      listingDate: '2026-11-18',
      verificationStatus: 'verified',
      todayIst: '2026-11-18',
    }),
    'Listed',
  );

  const diffs = detectIpoFieldDiffs(
    { companyName: 'Acme India Ltd', segment: 'Mainboard', priceBand: 'Not announced' },
    {
      companyName: 'Acme India Ltd',
      segment: 'Mainboard',
      priceBand: '₹120–₹126',
      openingDate: '2026-11-25',
      sourceName: 'SEBI',
      sourceUrl: 'https://www.sebi.gov.in',
    },
  );
  assert.equal(diffs.length, 2);
  assert.equal(diffs[0].field, 'priceBand');
  assert.equal(diffs[1].field, 'openingDate');
});
