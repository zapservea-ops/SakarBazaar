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
  assertDocumentVersionUnchanged,
  canRetryPermanentDeletion,
  ConflictError,
  computeExpiresAtMs,
  evaluateDeletionApproval,
  extendDurationFromNowOrExpiry,
  extractReadableErrorMessage,
  extractTimestampMillis,
  formatRemainingDuration,
  isArticleExpired,
  isArticleExpiringSoon,
  isArticlePubliclyVisible,
  resolveDurationHours,
  sanitizeArticleSlug,
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
import {
  BACKUP_AUDIT_LOG_EXPORT_LIMIT,
  BACKUP_COLLECTION_SCOPE,
  buildInitialBackupRestoreReport,
  buildSakarBazaarBackupBundle,
  NON_ATOMIC_RESTORE_WARNING,
  prepareRestoredArticlePayload,
  prepareRestoredIpoPayload,
  prepareRestoredMediaBlobPayload,
  prepareRestoredMediaPayload,
  prepareRestoredPaidCampaignPayload,
  validateBackupBundle,
} from './backupRestore.ts';
import { resolveGeminiBriefStatus } from '../../server/editorial/aiConfig.ts';
import {
  assertReviewPendingResolution,
  calculateIpoStatusFromDates,
  detectIpoFieldDiffs,
  findMatchingManagedIpo,
  formatOfficialIpoField,
  hasDuplicateIpoReview,
  mapManagedIpoToPublicRow,
  normalizeIpoCompanyKey,
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
    legacyOverrides: {
      suppressedArticleIds: ['old-static-1'],
      suppressedSlugs: ['old-static-1-slug'],
      updatedByUid: 'uid1',
    },
  });

  // Include bundled static media metadata alongside uploaded photo
  bundle.data.media.push({
    id: 'med-static-hero',
    fileName: 'hero.png',
    storagePath: 'public/assets/hero.png',
    mediaType: 'image/png',
    uploadedByUid: 'uid1',
  });

  assert.equal(bundle.notes.includesPhotographs, true);
  assert.equal(bundle.notes.excludesYouTubeVideoFiles, true);
  assert.deepEqual(bundle.data.legacyOverrides?.suppressedArticleIds, ['old-static-1']);
  const report = validateBackupBundle(bundle);
  assert.equal(report.valid, true);
  assert.equal(report.warnings.length, 0);
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
  assert.equal(diffs.length, 3);
  assert.equal(diffs[0].field, 'priceBand');
  assert.equal(diffs[1].field, 'openingDate');
  assert.equal(diffs[2].field, 'officialDocument');
});

test('Slug sanitization for Hindi-only titles, max-length validation, and Firestore JSON error unwrapping', () => {
  const hiSlug = sanitizeArticleSlug('आरबीआई ने रेपो दर स्थिर रखी');
  assert.match(hiSlug, /^[a-z0-9-]+$/);
  assert.equal(hiSlug.length >= 3, true);
  assert.equal(sanitizeArticleSlug('RBI Keeps Repo Rate Unchanged!'), 'rbi-keeps-repo-rate-unchanged');

  const overlongHeadline = validateArticlePublishInput({
    enHeadline: 'A'.repeat(261),
    enBody: 'Detailed English article body exceeding twenty characters.',
    hiHeadline: 'हिन्दी शीर्षक यहाँ है',
    hiBody: 'यह एक पूर्ण हिन्दी समाचार लेख है जो बीस से अधिक अक्षरों का है।',
    durationPreset: '15d',
  });
  assert.equal(overlongHeadline.valid, false);
  assert.match(overlongHeadline.errors.join(' '), /260/);

  const readable = extractReadableErrorMessage(
    new Error(JSON.stringify({ error: 'Missing or insufficient permissions.', path: 'articles/abc' })),
  );
  assert.equal(readable, 'Missing or insufficient permissions. (articles/abc)');
});

test('SEBI IPO matching, duplicate review suppression, and filingDate separation', () => {
  assert.equal(normalizeIpoCompanyKey('Acme India Limited'), 'acme india');
  assert.equal(normalizeIpoCompanyKey('Acme India Ltd.'), 'acme india');

  const existing = [{ id: 'acme-india-limited', companyName: 'Acme India Limited' }];
  assert.equal(findMatchingManagedIpo(existing, 'ACME INDIA LTD')?.id, 'acme-india-limited');

  const pendingReviews = [
    {
      companyName: 'Acme India Limited',
      reviewStatus: 'Needs Review' as const,
      diffs: [{ field: 'priceBand', label: 'Price Band', previousValue: 'Not announced', detectedValue: '₹100–₹110' }],
    },
  ];
  assert.equal(
    hasDuplicateIpoReview(pendingReviews, 'Acme India Ltd', [
      { field: 'priceBand', label: 'Price Band', previousValue: 'Not announced', detectedValue: '₹100–₹110' },
    ]),
    true,
  );

  // Filing date must not be mapped into openDate or trigger Open status
  const mapped = mapManagedIpoToPublicRow({
    id: 'sebi-test-ipo',
    companyName: 'Test Fintech Limited',
    slug: 'test-fintech-limited',
    segment: 'Mainboard',
    status: 'Upcoming',
    filingDate: '2026-11-18',
    verificationStatus: 'verified',
    updatedByUid: 'uid1',
  });
  assert.equal(mapped.filingDate, '2026-11-18');
  assert.equal(mapped.openDate, null);
  assert.equal(mapped.status, 'Upcoming');
});

test('Restore payload builders preserve immutable createdAt/creator UIDs on existing docs and strip unknown fields', () => {
  const dirtyArticle = {
    id: 'art-existing',
    title: 'Restored Headline',
    slug: 'restored-headline',
    category: 'Markets',
    author: 'Desk',
    status: 'Published',
    verificationStatus: 'verified',
    language: 'bilingual',
    createdByUid: 'original-uid',
    createdAt: { seconds: 1700000000, nanoseconds: 0 },
    updatedAt: { seconds: 1700000100, nanoseconds: 0 },
    unexpectedExtraField: 'must-be-stripped',
  } as unknown as StoredArticleDoc;

  const updateArt = prepareRestoredArticlePayload(dirtyArticle, 'restorer-uid', true);
  assert.equal('createdByUid' in updateArt, false);
  assert.equal('createdAt' in updateArt, false);
  assert.equal('updatedAt' in updateArt, false);
  assert.equal('id' in updateArt, false);
  assert.equal('unexpectedExtraField' in updateArt, false);
  assert.equal(updateArt.updatedByUid, 'restorer-uid');

  const createArt = prepareRestoredArticlePayload(dirtyArticle, 'restorer-uid', false);
  assert.equal(createArt.createdByUid, 'restorer-uid');
  assert.equal(createArt.updatedByUid, 'restorer-uid');

  const mediaUpdate = prepareRestoredMediaPayload(
    {
      id: 'med-1',
      fileName: 'photo.jpg',
      mediaType: 'image/jpeg',
      uploadedByUid: 'orig-uploader',
      extraProp: 123,
    } as never,
    'restorer-uid',
    true,
  );
  assert.equal('uploadedByUid' in mediaUpdate, false);
  assert.equal('extraProp' in mediaUpdate, false);

  const blobUpdate = prepareRestoredMediaBlobPayload(
    {
      id: 'med-1',
      mediaId: 'med-1',
      mimeType: 'image/jpeg',
      sizeBytes: 100,
      dataUrl: 'data:image/jpeg;base64,AAA',
      isPublic: true,
      uploadedByUid: 'orig-uploader',
    },
    'med-1',
    'restorer-uid',
    true,
  );
  assert.equal('uploadedByUid' in blobUpdate, false);
  assert.equal(blobUpdate.mediaId, 'med-1');

  const campaignUpdate = prepareRestoredPaidCampaignPayload(
    {
      id: 'camp-1',
      clientName: 'Acme Corp',
      internalStatus: 'Active',
      disclosureEnabled: true,
      createdByUid: 'orig-uid',
      bogusField: true,
    } as never,
    'restorer-uid',
    true,
  );
  assert.equal('createdByUid' in campaignUpdate, false);
  assert.equal('bogusField' in campaignUpdate, false);

  const ipoPayload = prepareRestoredIpoPayload(
    {
      id: 'ipo-1',
      companyName: 'Acme India Limited',
      slug: 'acme-india-limited',
      segment: 'Mainboard',
      status: 'Upcoming',
      verificationStatus: 'verified',
      updatedByUid: 'old-uid',
      unknownIpoProp: 'drop-me',
    } as never,
    'restorer-uid',
  );
  assert.equal(ipoPayload.updatedByUid, 'restorer-uid');
  assert.equal('unknownIpoProp' in ipoPayload, false);

  // Detaching media from a published article flips orphaned media back to private
  const futureExp = Date.now() + 86_400_000;
  const beforeDetach = computeMediaVisibilityFromArticles(
    'img-detached',
    [{ id: 'art-1', mediaId: 'img-detached', status: 'Published', expiresAtMs: futureExp }],
  );
  assert.equal(beforeDetach.isPublic, true);

  const afterDetach = computeMediaVisibilityFromArticles(
    'img-detached',
    [{ id: 'art-1', mediaId: '', status: 'Published', expiresAtMs: futureExp }],
  );
  assert.equal(afterDetach.isPublic, false);
  assert.equal(afterDetach.associatedArticleIds.length, 0);

  // Cross-operator restore of deleted media, mediaPayload, and paidCampaign assigns restorer-uid on create
  const createMedia = prepareRestoredMediaPayload(
    {
      id: 'med-cross',
      fileName: 'cross.jpg',
      mediaType: 'image/jpeg',
      uploadedByUid: 'publisher-uid',
    } as never,
    'owner-uid',
    false,
  );
  assert.equal(createMedia.uploadedByUid, 'owner-uid');

  const createBlob = prepareRestoredMediaBlobPayload(
    {
      id: 'med-cross',
      mediaId: 'med-cross',
      mimeType: 'image/jpeg',
      sizeBytes: 100,
      dataUrl: 'data:image/jpeg;base64,AAA',
      isPublic: false,
      uploadedByUid: 'publisher-uid',
    },
    'med-cross',
    'owner-uid',
    false,
  );
  assert.equal(createBlob.uploadedByUid, 'owner-uid');

  const createCamp = prepareRestoredPaidCampaignPayload(
    {
      id: 'camp-cross',
      clientName: 'Acme Corp',
      internalStatus: 'Active',
      disclosureEnabled: true,
      createdByUid: 'publisher-uid',
    } as never,
    'owner-uid',
    false,
  );
  assert.equal(createCamp.createdByUid, 'owner-uid');
});

test('Optimistic concurrency conflict guards and atomic IPO review resolution guard', () => {
  const baseMs = 1_760_000_000_000;
  assert.equal(extractTimestampMillis(baseMs), baseMs);
  assert.equal(extractTimestampMillis({ seconds: 1760000000, nanoseconds: 250_000_000 }), 1_760_000_000_250);
  assert.equal(extractTimestampMillis({ toMillis: () => baseMs + 500 }), baseMs + 500);
  assert.equal(extractTimestampMillis(null), null);

  // Same-second serverTimestamp jitter (<= 1000ms) passes cleanly
  assert.doesNotThrow(() =>
    assertDocumentVersionUnchanged({
      entityLabel: 'article',
      expectedUpdatedAtMs: baseMs,
      currentUpdatedAt: { seconds: 1760000000, nanoseconds: 900_000_000 },
    }),
  );

  // No baseline timestamp skips check cleanly (new/legacy records)
  assert.doesNotThrow(() =>
    assertDocumentVersionUnchanged({
      entityLabel: 'article',
      expectedUpdatedAtMs: undefined,
      currentUpdatedAt: { seconds: 1760000010, nanoseconds: 0 },
    }),
  );

  // Newer authoritative timestamp > 1000ms throws ConflictError preserving edits
  assert.throws(
    () =>
      assertDocumentVersionUnchanged({
        entityLabel: 'IPO dossier',
        expectedUpdatedAtMs: baseMs,
        currentUpdatedAt: baseMs + 5_000,
      }),
    (err: unknown) => err instanceof ConflictError && err.code === 'VERSION_CONFLICT',
  );

  // IPO review atomic guard allows only Needs Review
  assert.doesNotThrow(() => assertReviewPendingResolution('Needs Review', 'Acme India Ltd'));
  assert.throws(
    () => assertReviewPendingResolution('Approved', 'Acme India Ltd'),
    /already been resolved \(Approved\)/,
  );
  assert.throws(
    () => assertReviewPendingResolution('Rejected', 'Acme India Ltd'),
    /already been resolved \(Rejected\)/,
  );
});

test('Gemini AI brief kill-switch defaults off cleanly and categorized backup scope/report are deterministic', () => {
  // Default / disabled states never enable Gemini calls
  const defaultOff = resolveGeminiBriefStatus({});
  assert.equal(defaultOff.enabled, false);
  assert.equal(defaultOff.killSwitchActive, true);
  assert.equal(defaultOff.hasApiKey, false);

  const explicitFalse = resolveGeminiBriefStatus({ ENABLE_GEMINI_AI_BRIEF: 'false', GEMINI_API_KEY: 'test-key' });
  assert.equal(explicitFalse.enabled, false);
  assert.equal(explicitFalse.killSwitchActive, true);

  const trueNoKey = resolveGeminiBriefStatus({ ENABLE_GEMINI_AI_BRIEF: 'true', GEMINI_API_KEY: '' });
  assert.equal(trueNoKey.enabled, false);
  assert.equal(trueNoKey.killSwitchActive, false);
  assert.equal(trueNoKey.hasApiKey, false);

  const fullyEnabled = resolveGeminiBriefStatus({ ENABLE_GEMINI_AI_BRIEF: 'true', GEMINI_API_KEY: 'test-key' });
  assert.equal(fullyEnabled.enabled, true);
  assert.equal(fullyEnabled.killSwitchActive, false);

  // Backup collection scope categorizes content vs operational vs security-sensitive
  assert.equal(BACKUP_AUDIT_LOG_EXPORT_LIMIT, 200);
  const byKey = new Map(BACKUP_COLLECTION_SCOPE.map((c) => [c.key, c]));
  assert.equal(byKey.get('articles')?.category, 'content');
  assert.equal(byKey.get('articles')?.restored, true);
  assert.equal(byKey.get('auditLogs')?.category, 'operational');
  assert.equal(byKey.get('auditLogs')?.restored, false);
  assert.equal(byKey.get('authorizedEmails')?.category, 'security_sensitive');
  assert.equal(byKey.get('authorizedEmails')?.restored, false);
  assert.equal(byKey.get('systemSettings')?.category, 'security_sensitive');
  assert.equal(byKey.get('systemSettings')?.restored, false);

  const bundle = buildSakarBazaarBackupBundle({
    exportedByUid: 'owner-1',
    exportedByEmail: BOOTSTRAPPED_OWNER_EMAIL,
    articles: [],
    media: [],
    mediaPayloads: [],
    paidCampaigns: [],
    ipos: [],
    ipoSourceReviews: [],
    auditLogs: [],
    authorizedEmails: [{ id: 'a@b.com', email: 'a@b.com', displayName: 'A', role: 'publisher', active: true, addedByUid: 'owner-1' }],
    systemSettings: [],
  });
  const initReport = buildInitialBackupRestoreReport(bundle, '2026-11-18T12:00:00.000Z');
  assert.equal(initReport.nonAtomicWarning, NON_ATOMIC_RESTORE_WARNING);
  assert.equal(initReport.skippedCollections.find((s) => s.collection === 'authorizedEmails')?.countInBackup, 1);
  assert.equal(initReport.skippedCollections.length, 4);
});




