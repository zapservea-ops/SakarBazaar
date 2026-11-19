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
  collectCandidateReferencingArticleIds,
  computeMediaVisibilityFromArticles,
  estimateMediaQuotaUsage,
  mergeMediaAssociatedArticleId,
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
import {
  assertReviewPendingResolution,
  buildUnifiedIpoManagementPreview,
  calculateIpoStatusFromDates,
  classifyBuiltInIpoCatalogRecord,
  detectIpoFieldDiffs,
  findMatchingManagedIpo,
  formatOfficialIpoField,
  hasDuplicateIpoReview,
  inspectIpoLinkedReferences,
  mapManagedIpoToPublicRow,
  normalizeIpoCompanyKey,
  normalizeToIsoDate,
} from './ipoLifecycle.ts';
import {
  computeLegacyOverridesState,
  filterPublicArticlesWithOverrides,
  resolveLegacyOverridesReadResult,
} from './historicalNews.ts';
import { canDeleteIpoInFirestore, canPublicOrUserGetArticle, canPublicOrUserListArticle } from './firestoreRulesPolicy.ts';
import type { ArticleRecord, IpoRow, IpoSourceReviewRecord, LegacyOverridesRecord, StoredArticleDoc } from '../types/sakarbazaar.ts';

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
    sourceProjectId: 'isolated-test-proj',
    sourceDatabaseId: '(default)',
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

test('Categorized backup scope, non-atomic warning, and restore report are deterministic', () => {
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

import {
  classifyArticleLifecycle,
  evaluateDeletionRequest,
  evaluateDeletionCancellation,
  isDeletionQueueEditLocked,
} from './newsLifecycle.ts';
import {
  analyzeIpoCandidateMatch,
  buildHistoricalIpoConflictReport,
  buildStableIpoMigrationKey,
  isIpoPubliclyVisible,
} from './ipoLifecycle.ts';
import {
  BACKUP_EXCLUSION_NOTES,
  buildBackupRestorePreview,
  isProductionDatabaseTarget,
  PRODUCTION_TARGET_IDENTITY,
  verifyRestoreTargetIdentity,
} from './backupRestore.ts';
import { IPO_ALL_RECORDS } from '../data/sampleData.ts';
import type { ManagedIpoRecord, EditorialWorkflowStatus, DeletionStatus } from '../types/sakarbazaar.ts';

test('Lifecycle matrix: exact precedence across every status × deletionStatus combination & pending_approval immediate queue', () => {
  const now = Date.UTC(2026, 10, 18, 12, 0, 0);
  const statuses: EditorialWorkflowStatus[] = [
    'Draft',
    'Awaiting Verification',
    'Verified',
    'Published',
    'Expired',
    'Retained',
    'Pending Deletion',
    'Deletion In Progress',
    'Deleted',
    'Archived',
  ];
  const delStatuses: DeletionStatus[] = [
    'none',
    'pending_approval',
    'approved',
    'in_progress',
    'partial_failure',
    'deleted',
  ];

  for (const status of statuses) {
    for (const deletionStatus of delStatuses) {
      const cls = classifyArticleLifecycle({ status, deletionStatus, expiresAtMs: now + 86_400_000 }, now);
      if (status === 'Deleted' || deletionStatus === 'deleted') {
        assert.equal(cls.stage, 'deleted');
        assert.equal(cls.isPublic, false);
        assert.equal(cls.inDeletionQueue, false);
      } else if (status === 'Deletion In Progress' || deletionStatus === 'in_progress') {
        assert.equal(cls.stage, 'deletion_in_progress');
        assert.equal(cls.inDeletionQueue, true);
        assert.equal(cls.isPublic, false);
        assert.equal(cls.canCancelDeletion, false);
      } else if (deletionStatus === 'partial_failure') {
        assert.equal(cls.stage, 'deletion_partial_failure');
        assert.equal(cls.inDeletionQueue, true);
        assert.equal(cls.canRetryDeletion, true);
      } else if (deletionStatus === 'approved') {
        assert.equal(cls.stage, 'deletion_approved');
        assert.equal(cls.inDeletionQueue, true);
        assert.equal(cls.canExecuteDeletion, true);
      } else if (deletionStatus === 'pending_approval' || status === 'Pending Deletion') {
        // Must appear immediately in Pending Deletion & lock News Desk edits, but CANNOT execute delete yet
        assert.equal(cls.stage, 'deletion_pending_approval');
        assert.equal(cls.inDeletionQueue, true);
        assert.equal(cls.isPublic, false);
        assert.equal(cls.canEdit, false);
        assert.equal(cls.canApproveDeletion, true);
        assert.equal(cls.canExecuteDeletion, false);
      }
    }
  }

  assert.equal(
    isDeletionQueueEditLocked({ status: 'Pending Deletion', deletionStatus: 'pending_approval' }),
    true,
  );
  assert.equal(evaluateDeletionRequest('publisher').allowed, true);
  assert.equal(evaluateDeletionRequest('none').allowed, false);
  assert.equal(evaluateDeletionCancellation('owner', { deletionStatus: 'in_progress' }).allowed, false);
  assert.equal(evaluateDeletionCancellation('publisher', { deletionStatus: 'pending_approval' }).allowed, true);
});

const mkFullStoredArticle = (overrides: Partial<StoredArticleDoc> & Pick<StoredArticleDoc, 'id' | 'slug' | 'title'>): StoredArticleDoc => ({
  summary: 'Summary',
  body: 'Body content over twenty chars.',
  enHeadline: overrides.title,
  enSummary: 'Summary',
  enBody: 'Body content over twenty chars.',
  hiHeadline: 'हिन्दी शीर्षक',
  hiSummary: 'हिन्दी सारांश',
  hiBody: 'यह एक पूर्ण हिन्दी समाचार लेख है।',
  category: 'Markets',
  tags: [],
  keywords: [],
  entities: [],
  author: 'Desk',
  status: 'Published',
  verificationStatus: 'verified',
  sourceName: '',
  language: 'bilingual',
  createdByUid: 'owner-1',
  ...overrides,
});

test('Stateful Fake-Backend Integration: deletion retry, idempotent audit key, fresh media guard & private visibility sync', () => {
  const now = Date.UTC(2026, 10, 18, 12, 0, 0);
  // Stateful fake Firestore in-memory store
  const fakeArticles = new Map<string, StoredArticleDoc>([
    [
      'art-del-1',
      mkFullStoredArticle({
        id: 'art-del-1',
        title: 'Target Delete',
        slug: 'target-delete',
        status: 'Published',
        verificationStatus: 'verified',
        mediaId: 'med-shared-1',
        expiresAtMs: now + 3_600_000,
        deletionStatus: 'none',
      }),
    ],
    [
      'art-live-2',
      mkFullStoredArticle({
        id: 'art-live-2',
        title: 'Still Using Shared Photo',
        slug: 'still-using-shared',
        status: 'Published',
        verificationStatus: 'verified',
        mediaId: 'med-shared-1',
        expiresAtMs: now + 7_200_000,
        deletionStatus: 'none',
      }),
    ],
  ]);
  const fakeMedia = new Map<string, { isPublic: boolean; associatedArticleIds: string[] }>([
    ['med-shared-1', { isPublic: true, associatedArticleIds: ['art-del-1', 'art-live-2'] }],
  ]);
  const fakePayloads = new Map<string, { isPublic: boolean }>([['med-shared-1', { isPublic: true }]]);
  const fakeAuditLogs = new Map<string, { action: string; entityId: string }>();

  const writeIdempotentAudit = (key: string, action: string, entityId: string) => {
    if (!fakeAuditLogs.has(key)) {
      fakeAuditLogs.set(key, { action, entityId });
    }
  };

  // Step 1: Request deletion approval -> appears immediately in Pending Deletion & locks edits
  const doc1 = fakeArticles.get('art-del-1')!;
  doc1.status = 'Pending Deletion';
  doc1.deletionStatus = 'pending_approval';
  assert.equal(classifyArticleLifecycle(doc1, now).inDeletionQueue, true);
  assert.equal(classifyArticleLifecycle(doc1, now).canExecuteDeletion, false);

  // Step 2: Approve -> simulate partial_failure -> retry -> complete delete
  doc1.deletionStatus = 'approved';
  doc1.status = 'Deletion In Progress';
  doc1.deletionStatus = 'in_progress';
  doc1.status = 'Pending Deletion';
  doc1.deletionStatus = 'partial_failure';
  doc1.deletionAttempts = 1;
  assert.equal(canRetryPermanentDeletion(doc1, 'publisher'), true);

  // Stale caller snapshot omits art-live-2, but fresh authoritative store check includes it!
  const freshSnapshot = Array.from(fakeArticles.values());
  const deleteCheck = canSafelyDeleteMediaAsset('med-shared-1', freshSnapshot, 'art-del-1');
  assert.equal(deleteCheck.canDelete, false);
  assert.deepEqual(deleteCheck.remainingArticleIds, ['art-live-2']);

  // Execute permanent deletion: removes doc1, preserves med-shared-1, writes idempotent audit log once
  fakeArticles.delete('art-del-1');
  writeIdempotentAudit('del_complete_art-del-1_1', 'complete_delete', 'art-del-1');
  writeIdempotentAudit('del_complete_art-del-1_1', 'complete_delete', 'art-del-1'); // idempotent replay
  assert.equal(fakeArticles.has('art-del-1'), false);
  assert.equal(fakeMedia.has('med-shared-1'), true);
  assert.equal(fakeAuditLogs.size, 1);

  // Step 3: Now expire art-live-2 -> atomic sync hides both media AND mediaPayloads publicly
  const doc2 = fakeArticles.get('art-live-2')!;
  doc2.status = 'Expired';
  const visAfterExpiry = computeMediaVisibilityFromArticles('med-shared-1', Array.from(fakeArticles.values()), now);
  fakeMedia.set('med-shared-1', {
    isPublic: visAfterExpiry.isPublic,
    associatedArticleIds: visAfterExpiry.associatedArticleIds,
  });
  fakePayloads.set('med-shared-1', { isPublic: visAfterExpiry.isPublic });
  assert.equal(fakeMedia.get('med-shared-1')?.isPublic, false);
  assert.equal(fakePayloads.get('med-shared-1')?.isPublic, false);
});

test('IPO Identity, Conflict Guard & Static Exclusion integration', () => {
  const mkIpo = (overrides: Partial<ManagedIpoRecord>): ManagedIpoRecord => ({
    id: 'ipo-base-1',
    migrationKey: buildStableIpoMigrationKey({
      id: 'ipo-base-1',
      companyName: 'Bharat Photonics Limited',
      segment: 'Mainboard',
      filingDate: '2026-06-01',
      sourceUrl: 'https://www.sebi.gov.in/filings/draft/june-2026/bharat-photonics-drhp.html',
    }),
    companyName: 'Bharat Photonics Limited',
    slug: 'bharat-photonics-limited',
    segment: 'Mainboard',
    status: 'Upcoming',
    filingDate: '2026-06-01',
    openingDate: '2026-11-20',
    verificationStatus: 'verified',
    sourceUrl: 'https://www.sebi.gov.in/filings/draft/june-2026/bharat-photonics-drhp.html',
    updatedByUid: 'owner-1',
    ...overrides,
  });

  const existing = [mkIpo({})];

  // 1. Exact document URL + same segment -> idempotent match allowed
  const exactMatch = analyzeIpoCandidateMatch(existing, {
    companyName: 'Bharat Photonics Ltd',
    segment: 'Mainboard',
    filingDate: '2026-06-01',
    sourceName: 'SEBI',
    sourceUrl: 'https://www.sebi.gov.in/filings/draft/june-2026/bharat-photonics-drhp.html',
  });
  assert.equal(exactMatch.autoMergeAllowed, true);

  // 2. Same company name, different segment -> MUST refuse auto-merge
  const segConflict = analyzeIpoCandidateMatch(existing, {
    companyName: 'Bharat Photonics Limited',
    segment: 'SME',
    sourceName: 'SEBI',
    sourceUrl: 'https://www.sebi.gov.in/filings/sme/bharat-photonics-sme.html',
  });
  assert.equal(segConflict.autoMergeAllowed, false);
  assert.equal(segConflict.matchType, 'conflict_segment_difference');

  // 3. Same company name & segment, >30 days apart -> repeat offering, refuse auto-merge
  const repeatOffer = analyzeIpoCandidateMatch(existing, {
    companyName: 'Bharat Photonics Limited',
    segment: 'Mainboard',
    filingDate: '2026-11-15',
    openingDate: '2026-12-01',
    sourceName: 'SEBI',
    sourceUrl: 'https://www.sebi.gov.in/filings/rhp/nov-2026/bharat-photonics-fpo.html',
  });
  assert.equal(repeatOffer.autoMergeAllowed, false);
  assert.equal(repeatOffer.matchType, 'conflict_repeat_offering_candidate');

  // 4. Archived / Unpublished / Pending Deletion IPOs must NEVER be publicly visible
  assert.equal(isIpoPubliclyVisible(existing[0]), true);
  assert.equal(isIpoPubliclyVisible({ ...existing[0], verificationStatus: 'archived', isArchived: true, status: 'Archived' }), false);
  assert.equal(isIpoPubliclyVisible({ ...existing[0], verificationStatus: 'unpublished', status: 'Unpublished' }), false);
  assert.equal(isIpoPubliclyVisible({ ...existing[0], deletionStatus: 'pending_approval', status: 'Pending Deletion' }), false);

  // 5. Historical classification & conflict report does NOT blanket-exclude genuine IPO_ALL_RECORDS entries
  assert.ok(IPO_ALL_RECORDS.length >= 1);
  const mclClass = classifyBuiltInIpoCatalogRecord(IPO_ALL_RECORDS[0], '2026-11-18');
  assert.equal(mclClass.recordId, 'ipo-mcl-editorial');
  assert.equal(mclClass.classification, 'genuine_current');

  const sampleFixture: IpoRow = {
    ...IPO_ALL_RECORDS[0],
    id: 'ipo-demo-fixture-1',
    slug: 'acme-demo-ipo',
    company: 'Acme Demo Sample Corp',
  };
  const historicalFixture: IpoRow = {
    ...IPO_ALL_RECORDS[0],
    id: 'ipo-hist-1',
    slug: 'bharat-photonics-limited',
    company: 'Bharat Photonics Limited',
    status: 'Listed',
    listingDate: '2026-06-25',
    openDate: '2026-06-15',
    closeDate: '2026-06-18',
    verificationStatus: 'verified',
  };
  const unknownFixture: IpoRow = {
    ...IPO_ALL_RECORDS[0],
    id: 'ipo-unknown-hist-1',
    slug: 'eastern-logistics-ventures',
    company: 'Eastern Logistics Ventures Limited',
    status: 'Awaiting Verification',
    verificationStatus: 'awaiting_verification',
    openDate: null,
    closeDate: null,
    listingDate: null,
    offerType: null,
    sellingShareholder: null,
    financialMetrics: [],
    officialDocuments: [],
    sourceUrl: null,
    relatedArticleSlug: undefined,
  };
  const mixedStaticCatalog = [...IPO_ALL_RECORDS, historicalFixture, unknownFixture, sampleFixture];

  const report = buildHistoricalIpoConflictReport({
    firestoreIpos: existing,
    staticIpos: mixedStaticCatalog,
    todayIso: '2026-11-18',
  });
  assert.equal(report.genuineCatalogCount, 2); // ipo-mcl-editorial (genuine_current) + historicalFixture (genuine_historical)
  assert.equal(report.unknownReviewCount, 1); // unknownFixture classified for manual review
  assert.equal(report.sampleExcludedCount, 1); // ONLY sampleFixture excluded
  assert.ok(
    report.recordClassifications?.every((c) =>
      c.recordId === 'ipo-mcl-editorial'
        ? c.classification === 'genuine_current' && c.inPublicWebsite && c.inManagementPreview
        : true,
    ),
  );
  assert.ok(
    !report.items.some((i) => i.recordId === 'ipo-mcl-editorial' && i.conflictType === 'sample_or_fixture_excluded'),
  );
  assert.ok(
    report.items.some((i) => i.recordId === 'ipo-demo-fixture-1' && i.conflictType === 'sample_or_fixture_excluded'),
  );

  // Unified read-only preview combines Firestore + genuine & unknown_review built-in IPOs, preserves IDs, flags duplicates without auto-merging
  const previewRows = buildUnifiedIpoManagementPreview({
    firestoreIpos: existing,
    staticIpos: mixedStaticCatalog,
    todayIso: '2026-11-18',
  });
  assert.equal(previewRows.length, 4); // 1 Firestore + 2 genuine built-in + 1 unknown_review (ONLY sampleFixture excluded)
  assert.ok(previewRows.some((r) => r.id === 'ipo-unknown-hist-1' && r.classification === 'unknown_review'));
  const fsPreview = previewRows.find((r) => r.origin === 'firestore' && r.id === 'ipo-base-1')!;
  const staticDupPreview = previewRows.find((r) => r.origin === 'static_catalog' && r.id === 'ipo-hist-1')!;
  assert.ok(fsPreview.potentialDuplicateIds.includes('ipo-hist-1'));
  assert.ok(staticDupPreview.potentialDuplicateIds.includes('ipo-base-1'));
});

test('Backup/Restore Target Identity verification, Dry-Run Preview & Conflict Policies (skip_existing / fail_on_conflict)', () => {
  const bundle = buildSakarBazaarBackupBundle({
    exportedByUid: 'owner-1',
    exportedByEmail: BOOTSTRAPPED_OWNER_EMAIL,
    sourceProjectId: 'test-staging-proj',
    sourceDatabaseId: '(default)',
    articles: [
      mkFullStoredArticle({
        id: 'art-conflict-1',
        title: 'Existing',
        slug: 'existing',
        status: 'Draft',
        verificationStatus: 'awaiting_verification',
        createdByUid: 'u1',
      }),
      mkFullStoredArticle({
        id: 'art-new-2',
        title: 'Brand New',
        slug: 'brand-new',
        status: 'Draft',
        verificationStatus: 'awaiting_verification',
        createdByUid: 'u1',
      }),
    ],
    media: [],
    mediaPayloads: [],
    paidCampaigns: [],
    ipos: [],
    ipoSourceReviews: [],
    auditLogs: [],
    authorizedEmails: [],
    systemSettings: [],
  });

  // Production guard UNCONDITIONALLY blocks writes to dark-tea-xpd8p / ai-studio-efe3d2d3-00e3-4fb7-b2d9-c39abe14c8ac
  assert.equal(isProductionDatabaseTarget(PRODUCTION_TARGET_IDENTITY), true);
  const blockedProd = verifyRestoreTargetIdentity({
    activeTarget: PRODUCTION_TARGET_IDENTITY,
    confirmedProjectId: PRODUCTION_TARGET_IDENTITY.projectId,
    confirmedDatabaseId: PRODUCTION_TARGET_IDENTITY.firestoreDatabaseId,
  });
  assert.equal(blockedProd.ok, false);
  assert.match(blockedProd.error ?? '', /unconditionally blocked/i);

  // Even if active target claims to be non-prod, entering prod IDs as destination MUST be blocked
  const blockedProdDest = verifyRestoreTargetIdentity({
    activeTarget: { projectId: 'isolated-test-proj', firestoreDatabaseId: '(default)' },
    confirmedProjectId: PRODUCTION_TARGET_IDENTITY.projectId,
    confirmedDatabaseId: PRODUCTION_TARGET_IDENTITY.firestoreDatabaseId,
  });
  assert.equal(blockedProdDest.ok, false);

  // Mismatching IDs abort cleanly
  const mismatch = verifyRestoreTargetIdentity({
    activeTarget: { projectId: 'isolated-test-proj', firestoreDatabaseId: '(default)' },
    confirmedProjectId: 'wrong-proj',
    confirmedDatabaseId: '(default)',
  });
  assert.equal(mismatch.ok, false);

  // Isolated test project succeeds verification
  const okTarget = verifyRestoreTargetIdentity({
    activeTarget: { projectId: 'isolated-test-proj', firestoreDatabaseId: '(default)' },
    confirmedProjectId: 'isolated-test-proj',
    confirmedDatabaseId: '(default)',
  });
  assert.equal(okTarget.ok, true);

  // Dry-run preview detects 1 conflict + 1 new create and lists security/media exclusions
  const preview = buildBackupRestorePreview({
    bundle,
    targetIdentity: { projectId: 'isolated-test-proj', firestoreDatabaseId: '(default)' },
    conflictPolicy: 'skip_existing',
    existingIds: { articles: new Set(['art-conflict-1']) },
  });
  assert.equal(preview.totalExistingConflicts, 1);
  assert.equal(preview.exclusions.length, BACKUP_EXCLUSION_NOTES.length);
  const artPreview = preview.conflictsByCollection.find((c) => c.collection === 'articles')!;
  assert.deepEqual(artPreview.existingConflictIds, ['art-conflict-1']);
  assert.deepEqual(artPreview.newCreateIds, ['art-new-2']);
});

test('Acceptance §6 (11-step News Edit & Photo Attachment), §7 (Owner + Publisher Pending Deletion), §8 (Concurrent Media Safety), §10 (Isolated Export/Restore & RBAC)', () => {
  // Isolated in-memory Stateful Fake Firestore Backend (synthetic test records ONLY; zero live production calls)
  const now = Date.UTC(2026, 10, 19, 10, 0, 0);
  const articlesStore = new Map<string, StoredArticleDoc>();
  const mediaStore = new Map<string, { id: string; mediaType: string; isPublic: boolean; associatedArticleIds: string[] }>();
  const payloadStore = new Map<string, { mediaId: string; dataUrl: string; sizeBytes: number; isPublic: boolean }>();
  const auditStore = new Map<string, { id: string; action: string; entityType: string; entityId: string; actorRole: 'owner' | 'publisher' }>();
  const iposStore = new Map<string, ManagedIpoRecord>();

  // --- §6: Complete 11-step Live News Edit + Compressed Photo Attachment Workflow (synthetic article) ---
  const origPubIso = '2026-11-10T08:00:00.000Z';
  const origPubMs = Date.parse(origPubIso);
  const origExpiryMs = origPubMs + 15 * 24 * 3600 * 1000;
  const syntheticLive = mkFullStoredArticle({
    id: 'art-synth-policy-1',
    slug: 'synthetic-rbi-liquidity-window',
    title: 'RBI Liquidity Window Update',
    enHeadline: 'RBI Liquidity Window Update',
    enSummary: 'Initial English summary with full context for verification.',
    enBody: 'Initial English editorial body explaining monetary transmission in clear detail.',
    hiHeadline: 'आरबीआई तरलता विंडो अपडेट',
    hiSummary: 'सत्यापन के लिए प्रारंभिक हिन्दी सारांश।',
    hiBody: 'प्रारंभिक हिन्दी समाचार विवरण जो मौद्रिक नीति और तरलता को समझाता है।',
    status: 'Published',
    verificationStatus: 'verified',
    publishedAt: origPubIso,
    publishedAtMs: origPubMs,
    expiresAtMs: origExpiryMs,
    createdByUid: 'owner-1',
  });
  articlesStore.set(syntheticLive.id, syntheticLive);

  // Step 1-3: Open published article & verify bilingual EN/HI fields present
  const loaded = articlesStore.get('art-synth-policy-1')!;
  const pubReadyBefore = validateArticlePublishInput({
    enHeadline: loaded.enHeadline!,
    enSummary: loaded.enSummary!,
    enBody: loaded.enBody!,
    hiHeadline: loaded.hiHeadline!,
    hiSummary: loaded.hiSummary!,
    hiBody: loaded.hiBody!,
    durationPreset: loaded.durationPreset ?? '15d',
  });
  assert.equal(pubReadyBefore.valid, true);

  // Step 4-6: Upload compressed photo to media + mediaPayloads and attach inside minor_edit preserving ID/slug/dates/expiry
  const photoDataUrl = 'data:image/jpeg;base64,' + 'B'.repeat(400);
  const photoCheck = validateCompressedImagePayload(photoDataUrl, 'image/jpeg');
  assert.equal(photoCheck.valid, true);
  mediaStore.set('med-synth-photo-1', {
    id: 'med-synth-photo-1',
    mediaType: 'image/jpeg',
    isPublic: true,
    associatedArticleIds: [],
  });
  payloadStore.set('med-synth-photo-1', {
    mediaId: 'med-synth-photo-1',
    dataUrl: photoDataUrl,
    sizeBytes: photoCheck.sizeBytes,
    isPublic: true,
  });

  const updatedDoc = applyMinorEditPreservingExpiry(loaded, {
    enHeadline: 'RBI Liquidity Window Update (Revised Chart Note)',
    mediaId: 'med-synth-photo-1',
    durationHours: 720, // MUST NOT shift existing expiresAtMs during minor_edit
    expiresAtMs: now + 999_999,
    updatedAt: new Date(now).toISOString(),
    updatedByUid: 'pub-1',
  });
  articlesStore.set(updatedDoc.id, updatedDoc);

  // Register attachment atomically in media.associatedArticleIds
  const attachedMedia = mediaStore.get('med-synth-photo-1')!;
  attachedMedia.associatedArticleIds = mergeMediaAssociatedArticleId(attachedMedia.associatedArticleIds, updatedDoc.id);

  // Step 7-11: Verify zero duplicates, ID/slug/publishedAt/expiry preserved, photo visible publicly on reload
  assert.equal(articlesStore.size, 1);
  const reloaded = articlesStore.get('art-synth-policy-1')!;
  assert.equal(reloaded.id, 'art-synth-policy-1');
  assert.equal(reloaded.slug, 'synthetic-rbi-liquidity-window');
  assert.equal(reloaded.publishedAtMs, origPubMs);
  assert.equal(reloaded.expiresAtMs, origExpiryMs);
  assert.equal(reloaded.mediaId, 'med-synth-photo-1');
  assert.equal(payloadStore.get('med-synth-photo-1')?.isPublic, true);

  // --- §8: Concurrent Media Attachment vs Deletion Hardening ---
  // Scenario: article B attaches med-synth-photo-1 concurrently while stale snapshot tries to delete med-synth-photo-1
  const artB = mkFullStoredArticle({
    id: 'art-concurrent-b',
    slug: 'concurrent-story-b',
    title: 'Concurrent Story B',
    status: 'Published',
    verificationStatus: 'verified',
    mediaId: 'med-synth-photo-1',
    expiresAtMs: origExpiryMs,
    createdByUid: 'pub-1',
  });
  articlesStore.set(artB.id, artB);
  attachedMedia.associatedArticleIds = mergeMediaAssociatedArticleId(attachedMedia.associatedArticleIds, artB.id);

  // Even if caller only knew about reloaded (excluding reloaded during deletion), collectCandidateReferencingArticleIds catches art-concurrent-b!
  const candidates = collectCandidateReferencingArticleIds({
    mediaId: 'med-synth-photo-1',
    allArticles: [reloaded], // stale caller list missing artB!
    recordedAssociatedIds: attachedMedia.associatedArticleIds,
    excludingArticleId: reloaded.id,
  });
  assert.ok(candidates.includes('art-concurrent-b'));

  // Authoritative transactional check finds artB still active -> MUST abort media/payload deletion & preserve both!
  const remainingLiveRefs = candidates.filter((cid) => {
    const d = articlesStore.get(cid);
    return d && d.mediaId === 'med-synth-photo-1' && d.status !== 'Deleted' && d.deletionStatus !== 'deleted';
  });
  assert.deepEqual(remainingLiveRefs, ['art-concurrent-b']);
  assert.equal(mediaStore.has('med-synth-photo-1'), true);
  assert.equal(payloadStore.has('med-synth-photo-1'), true);

  // --- §7: Separate Owner + Publisher Pending Deletion Workflows (request -> immediate queue -> approve -> partial_failure retry -> execute) ---
  function runPendingDeletionFlow(actorRole: 'owner' | 'publisher', articleId: string, expectPreservedMediaId?: string) {
    const docItem = articlesStore.get(articleId)!;
    // Step 1: Request deletion -> immediately enters Pending Deletion queue, hidden publicly
    assert.equal(evaluateDeletionRequest(actorRole).allowed, true);
    docItem.status = 'Pending Deletion';
    docItem.deletionStatus = 'pending_approval';
    const clsPending = classifyArticleLifecycle(docItem, now);
    assert.equal(clsPending.inDeletionQueue, true);
    assert.equal(clsPending.isPublic, false);
    assert.equal(isArticlePubliclyVisible(docItem, now), false);

    // KPI counter includes this article immediately
    const queueCount = Array.from(articlesStore.values()).filter((a) => classifyArticleLifecycle(a, now).inDeletionQueue).length;
    assert.ok(queueCount >= 1);

    // Step 2: Approve permanent deletion
    assert.equal(evaluateDeletionApproval(actorRole, docItem.deletionStatus).allowed, true);
    docItem.deletionStatus = 'approved';

    // Step 3: Simulate transient partial_failure & idempotent recovery retry
    docItem.status = 'Deletion In Progress';
    docItem.deletionStatus = 'in_progress';
    docItem.status = 'Pending Deletion';
    docItem.deletionStatus = 'partial_failure';
    docItem.deletionAttempts = 1;
    assert.equal(canRetryPermanentDeletion(docItem, actorRole), true);

    // Step 4: Execute retry -> delete article, sync/preserve shared media or remove unshared media, write idempotent audit once
    const remainingForMedia = docItem.mediaId
      ? canSafelyDeleteMediaAsset(docItem.mediaId, Array.from(articlesStore.values()), docItem.id)
      : { canDelete: false, remainingArticleIds: [] };

    articlesStore.delete(docItem.id);
    if (docItem.mediaId && remainingForMedia.canDelete) {
      payloadStore.delete(docItem.mediaId);
      mediaStore.delete(docItem.mediaId);
    } else if (expectPreservedMediaId) {
      assert.equal(mediaStore.has(expectPreservedMediaId), true);
      assert.equal(payloadStore.has(expectPreservedMediaId), true);
    }
    const auditId = `del_${docItem.id}_done`;
    auditStore.set(auditId, {
      id: auditId,
      action: 'complete_delete',
      entityType: 'article',
      entityId: docItem.id,
      actorRole,
    });
    assert.equal(articlesStore.has(docItem.id), false);
    assert.equal(auditStore.get(auditId)?.actorRole, actorRole);
  }

  // Publisher deletes reloaded (med-synth-photo-1 MUST remain because art-concurrent-b references it)
  runPendingDeletionFlow('publisher', 'art-synth-policy-1', 'med-synth-photo-1');
  assert.equal(mediaStore.has('med-synth-photo-1'), true);
  assert.equal(payloadStore.has('med-synth-photo-1'), true);

  // Owner deletes art-concurrent-b (now unreferenced -> BOTH article and unshared media+payload removed)
  runPendingDeletionFlow('owner', 'art-concurrent-b');
  assert.equal(mediaStore.has('med-synth-photo-1'), false);
  assert.equal(payloadStore.has('med-synth-photo-1'), false);

  // --- §3 & §10: Both Owner and Publisher IPO creation/deletion + Owner-only Restore/RBAC ---
  const ownerPerm = getPermissionsForRole('owner');
  const pubPerm = getPermissionsForRole('publisher');
  assert.equal(ownerPerm.canExecutePermanentDeletion, true);
  assert.equal(pubPerm.canExecutePermanentDeletion, true);
  assert.equal(ownerPerm.canManagePermissionsAndSecurity, true);
  assert.equal(pubPerm.canManagePermissionsAndSecurity, false);
  assert.equal(ownerPerm.canRestoreBackup, true);
  assert.equal(pubPerm.canRestoreBackup, false);

  iposStore.set('ipo-pub-del-1', {
    id: 'ipo-pub-del-1',
    companyName: 'Synthetic FinTech Ltd',
    slug: 'synthetic-fintech-ltd',
    segment: 'Mainboard',
    status: 'Pending Deletion',
    verificationStatus: 'awaiting_verification',
    deletionStatus: 'pending_approval',
    updatedByUid: 'pub-1',
  });
  // Publisher approves & deletes non-verified IPO
  const ipoDoc = iposStore.get('ipo-pub-del-1')!;
  ipoDoc.deletionStatus = 'approved';
  iposStore.delete(ipoDoc.id);
  assert.equal(iposStore.size, 0);

  // Isolated non-production backup bundle with legacyOverrides restores cleanly on test DB
  const overridesAfterDelete = computeLegacyOverridesState({
    firestoreArticles: [],
    staticArticles: [],
    extraSuppressedIds: ['art-legacy-suppressed-1'],
    extraSuppressedSlugs: ['legacy-suppressed-slug'],
  });
  assert.deepEqual(overridesAfterDelete.suppressedArticleIds, ['art-legacy-suppressed-1']);

  const isoBundle = buildSakarBazaarBackupBundle({
    exportedByUid: 'owner-1',
    exportedByEmail: BOOTSTRAPPED_OWNER_EMAIL,
    sourceProjectId: 'isolated-staging-proj',
    sourceDatabaseId: '(default)',
    articles: [
      mkFullStoredArticle({
        id: 'art-restored-1',
        slug: 'restored-public-story',
        title: 'Restored Story',
        status: 'Published',
        verificationStatus: 'verified',
        expiresAtMs: now + 3600_000,
        createdByUid: 'owner-1',
      }),
    ],
    media: [],
    mediaPayloads: [],
    paidCampaigns: [],
    ipos: [],
    ipoSourceReviews: [],
    auditLogs: [],
    authorizedEmails: [],
    systemSettings: [],
    legacyOverrides: overridesAfterDelete,
  });
  const isoVerify = verifyRestoreTargetIdentity({
    activeTarget: { projectId: 'isolated-staging-proj', firestoreDatabaseId: '(default)' },
    confirmedProjectId: 'isolated-staging-proj',
    confirmedDatabaseId: '(default)',
  });
  assert.equal(isoVerify.ok, true);
  assert.equal(validateBackupBundle(isoBundle).valid, true);

  // Verify legacyOverrides still suppresses suppressed static records in public selector
  const fakeStaticCatalog: ArticleRecord[] = [
    {
      id: 'art-legacy-suppressed-1',
      slug: 'legacy-suppressed-slug',
      category: 'Markets',
      headline: 'Old Suppressed Legacy Article',
      deck: 'Suppressed.',
      author: 'Desk',
      authorRole: 'Desk',
      publishedAt: '2026-10-01',
      updatedAt: '2026-10-01',
      time: 'Oct 1',
      readTime: '2 min',
      ticker: 'LEGACY',
      sourceName: 'Test',
      sourceNote: 'Test',
      verificationStatus: 'verified',
      editorialStatus: 'Published',
      illustration: 'markets-pulse',
      illustrationCaption: 'Chart',
      tags: [],
      keywords: [],
      entities: [],
      aliases: [],
      keyPoints: [],
      sections: [{ heading: 'H', paragraphs: ['P'] }],
      citations: [],
      relatedSlugs: [],
    },
  ];
  const publicAfterOverrides = filterPublicArticlesWithOverrides([], fakeStaticCatalog, overridesAfterDelete, now);
  assert.equal(publicAfterOverrides.length, 0);
});

test('Acceptance §3 (Legacy Suppression Matrix across fresh/stale cache, permission failure, missing doc, unpublished, archived, deleted)', () => {
  const now = Date.UTC(2026, 10, 19, 12, 0, 0);
  const mkStatic = (id: string, slug: string): ArticleRecord => ({
    id,
    slug,
    category: 'Markets',
    headline: `Legacy Story ${id}`,
    deck: 'Deck',
    author: 'Desk',
    authorRole: 'Desk',
    publishedAt: '2026-10-10',
    updatedAt: '2026-10-10',
    time: 'Oct 10',
    readTime: '2 min',
    ticker: 'LEGACY',
    sourceName: 'Bureau',
    sourceNote: 'Bureau',
    verificationStatus: 'verified',
    editorialStatus: 'Published',
    illustration: 'markets-pulse',
    illustrationCaption: 'Cap',
    tags: [],
    keywords: [],
    entities: [],
    aliases: [],
    keyPoints: [],
    sections: [{ heading: 'H', paragraphs: ['Paragraph body'] }],
    citations: [],
    relatedSlugs: [],
  });

  const staticCatalog: ArticleRecord[] = [
    mkStatic('leg-unpub', 'leg-unpub-slug'),
    mkStatic('leg-arch', 'leg-arch-slug'),
    mkStatic('leg-del', 'leg-del-slug'),
    mkStatic('leg-live', 'leg-live-slug'),
  ];

  // Firestore has unpublished ('Draft'), archived ('Archived'), deleted removed + extraSuppressedIds, and one live published doc
  const firestoreArticles: StoredArticleDoc[] = [
    mkFullStoredArticle({ id: 'leg-unpub', slug: 'leg-unpub-slug', title: 'Unpub', status: 'Draft', verificationStatus: 'verified', expiresAtMs: now + 86_400_000 }),
    mkFullStoredArticle({ id: 'leg-arch', slug: 'leg-arch-slug', title: 'Arch', status: 'Archived', verificationStatus: 'verified', expiresAtMs: now - 10_000 }),
    mkFullStoredArticle({ id: 'leg-live', slug: 'leg-live-slug', title: 'Live', status: 'Published', verificationStatus: 'verified', expiresAtMs: now + 86_400_000 }),
  ];

  const serverOverrides = computeLegacyOverridesState({
    firestoreArticles,
    staticArticles: staticCatalog,
    extraSuppressedIds: ['leg-del'],
    extraSuppressedSlugs: ['leg-del-slug'],
    nowMs: now,
  });

  // Private article docs must NEVER be exposed via Firestore rules (unpublished/archived denied publicly)
  assert.equal(canPublicOrUserGetArticle(null, 'leg-unpub', { status: 'Draft', deletionStatus: 'none', expiresAtMs: now + 1000, hasExpiresAtTimestamp: true }, now), false);
  assert.equal(canPublicOrUserListArticle(null, { status: 'Archived', deletionStatus: 'none', expiresAtMs: now + 1000, hasExpiresAtTimestamp: true }, now), false);
  const publicRemoteOnly: ArticleRecord[] = [mkStatic('leg-live', 'leg-live-slug')];

  // 1. Fresh browser with NO cache & readable /publicCatalog/legacyOverrides
  const freshRead = resolveLegacyOverridesReadResult({
    serverExists: true,
    serverData: serverOverrides,
    cached: null,
  });
  assert.equal(freshRead.ok, true);
  assert.equal(freshRead.readPermitted, true);
  assert.deepEqual(freshRead.nextCacheToPersist?.suppressedArticleIds, serverOverrides.suppressedArticleIds);
  const freshVisibleIds = filterPublicArticlesWithOverrides(publicRemoteOnly, staticCatalog, freshRead.overrides, now).map((a) => a.id);
  assert.deepEqual(freshVisibleIds, ['leg-live']);

  // 2. Existing browser with stale cache (missing leg-del & leg-arch, still caching republished leg-live as suppressed)
  const staleCache: LegacyOverridesRecord = {
    suppressedArticleIds: ['leg-live'],
    suppressedSlugs: ['leg-live-slug'],
  };
  const refreshedFromServer = resolveLegacyOverridesReadResult({
    serverExists: true,
    serverData: serverOverrides,
    cached: staleCache,
  });
  assert.equal(refreshedFromServer.source, 'server');
  assert.deepEqual(
    filterPublicArticlesWithOverrides(publicRemoteOnly, staticCatalog, refreshedFromServer.overrides, now).map((a) => a.id),
    ['leg-live'],
  );

  // 3. Firestore permission failure preserves existing cache & reports readPermitted=false cleanly
  const permFailure = resolveLegacyOverridesReadResult({
    serverExists: false,
    cached: serverOverrides,
    error: new Error('PERMISSION_DENIED'),
    isPermissionDenied: true,
  });
  assert.equal(permFailure.ok, false);
  assert.equal(permFailure.readPermitted, false);
  assert.equal(permFailure.source, 'permission_denied_cache');
  assert.deepEqual(
    filterPublicArticlesWithOverrides(publicRemoteOnly, staticCatalog, permFailure.overrides, now).map((a) => a.id),
    ['leg-live'],
  );

  // 4. Missing override doc preserves existing cache cleanly without wiping suppressions (and handles empty cache cleanly)
  const missingWithCache = resolveLegacyOverridesReadResult({
    serverExists: false,
    cached: serverOverrides,
  });
  assert.equal(missingWithCache.source, 'missing_doc_cache');
  assert.equal(missingWithCache.nextCacheToPersist, undefined);
  assert.deepEqual(
    filterPublicArticlesWithOverrides(publicRemoteOnly, staticCatalog, missingWithCache.overrides, now).map((a) => a.id),
    ['leg-live'],
  );
  const missingEmpty = resolveLegacyOverridesReadResult({ serverExists: false, cached: null });
  assert.equal(missingEmpty.source, 'missing_doc_empty');
  assert.equal(missingEmpty.ok, true);
});

test('Acceptance §5 (Simulated Isolated Fake-Backend): Complete News & IPO CRUD, Media, Linked-Doc Guard, and Owner + Publisher Deletion', () => {
  // Explicit NOTE: Runs against an isolated in-memory stateful fake Firestore backend — NOT live production Firestore.
  const now = Date.UTC(2026, 10, 19, 14, 0, 0);
  const fakeArticles = new Map<string, StoredArticleDoc>();
  const fakeMedia = new Map<string, { id: string; isPublic: boolean; associatedArticleIds: string[] }>();
  const fakeIpos = new Map<string, {
    id: string;
    migrationKey: string;
    companyName: string;
    slug: string;
    segment: 'Mainboard' | 'SME';
    status: 'Awaiting Verification' | 'Upcoming' | 'Open' | 'Closed' | 'Listed' | 'Archived' | 'Unpublished' | 'Pending Deletion' | 'Deleted';
    verificationStatus: 'awaiting_verification' | 'verified' | 'unpublished' | 'archived';
    previousVerificationStatus?: 'awaiting_verification' | 'verified';
    isArchived: boolean;
    deletionStatus: 'none' | 'pending_approval' | 'approved' | 'deleted';
    officialDocuments: string[];
    sourceUrl?: string;
    openingDate?: string;
    closingDate?: string;
    updatedByUid: string;
  }>();
  const fakeReviews: IpoSourceReviewRecord[] = [];
  const fakeAudit: Array<{ action: string; entityType: string; entityId: string; actorRole: 'owner' | 'publisher'; summary: string }> = [];

  // === PART A: NEWS CRUD LIFECYCLE ===
  const origPub = now - 3_600_000;
  const origExp = now + 15 * 24 * 3_600_000;
  const artId = 'art-crud-1';
  fakeMedia.set('med-crud-1', { id: 'med-crud-1', isPublic: false, associatedArticleIds: [] });

  // Create draft -> Read -> Edit -> Publish -> Minor Edit preserving dates -> Unpublish -> Archive -> Restore -> Pending Delete
  fakeArticles.set(
    artId,
    mkFullStoredArticle({
      id: artId,
      slug: 'crud-initial-story',
      title: 'CRUD Initial Story',
      status: 'Draft',
      verificationStatus: 'awaiting_verification',
      createdByUid: 'pub-1',
    }),
  );
  assert.equal(classifyArticleLifecycle(fakeArticles.get(artId)!, now).isDraftReview, true);

  // Publish with media
  const art = fakeArticles.get(artId)!;
  art.status = 'Published';
  art.verificationStatus = 'verified';
  art.publishedAtMs = origPub;
  art.expiresAtMs = origExp;
  art.mediaId = 'med-crud-1';
  fakeMedia.get('med-crud-1')!.isPublic = true;
  fakeMedia.get('med-crud-1')!.associatedArticleIds.push(artId);
  assert.equal(isArticlePubliclyVisible(art, now), true);

  // Minor edit preserves ID, slug, publishedAtMs, expiresAtMs
  const minorEdited = applyMinorEditPreservingExpiry(art, {
    enHeadline: 'CRUD Revised Headline',
    publishedAtMs: now + 999_999,
    expiresAtMs: now + 999_999,
  });
  fakeArticles.set(artId, minorEdited);
  assert.equal(minorEdited.id, artId);
  assert.equal(minorEdited.slug, 'crud-initial-story');
  assert.equal(minorEdited.publishedAtMs, origPub);
  assert.equal(minorEdited.expiresAtMs, origExp);

  // Unpublish (Retained) & Archive -> hidden publicly, media synced private -> Restore back to Published
  minorEdited.status = 'Retained';
  assert.equal(isArticlePubliclyVisible(minorEdited, now), false);
  assert.equal(computeMediaVisibilityFromArticles('med-crud-1', Array.from(fakeArticles.values()), now).isPublic, false);
  minorEdited.status = 'Archived';
  assert.equal(isArticlePubliclyVisible(minorEdited, now), false);
  minorEdited.status = 'Published';
  assert.equal(isArticlePubliclyVisible(minorEdited, now), true);

  // === PART B: IPO CRUD + NON-PUBLIC PERMANENT DELETION (OWNER & PUBLISHER INDEPENDENTLY) ===
  function createAndLifecycleDeleteIpo(actorRole: 'owner' | 'publisher', id: string) {
    const actorUid = actorRole === 'owner' ? 'owner-1' : 'pub-1';
    const authCtx = {
      uid: actorUid,
      email: actorRole === 'owner' ? BOOTSTRAPPED_OWNER_EMAIL : 'publisher@example.com',
      emailVerified: true,
      isBootstrappedOwner: actorRole === 'owner',
      allowlistActive: true,
      allowlistRole: actorRole,
    };

    // 1. Create Awaiting Verification draft IPO
    const migKey = buildStableIpoMigrationKey({
      id,
      companyName: `Alpha FinCorp ${id} Limited`,
      segment: 'Mainboard',
      sourceUrl: `https://www.sebi.gov.in/filings/${id}.html`,
    });
    fakeIpos.set(id, {
      id,
      migrationKey: migKey,
      companyName: `Alpha FinCorp ${id} Limited`,
      slug: sanitizeArticleSlug(`alpha-fincorp-${id}-limited`),
      segment: 'Mainboard',
      status: 'Awaiting Verification',
      verificationStatus: 'awaiting_verification',
      isArchived: false,
      deletionStatus: 'none',
      officialDocuments: [`https://www.sebi.gov.in/filings/${id}.html`],
      sourceUrl: `https://www.sebi.gov.in/filings/${id}.html`,
      openingDate: '2026-11-18',
      closingDate: '2026-11-22',
      updatedByUid: actorUid,
    });
    const ipo = fakeIpos.get(id)!;

    // 2. Verify & publish (status Open) -> public deletion MUST be rejected
    ipo.verificationStatus = 'verified';
    ipo.status = calculateIpoStatusFromDates({
      openingDate: ipo.openingDate,
      closingDate: ipo.closingDate,
      verificationStatus: ipo.verificationStatus,
      isArchived: ipo.isArchived,
      deletionStatus: ipo.deletionStatus,
      todayIst: '2026-11-19',
    });
    assert.equal(ipo.status, 'Open');
    assert.equal(isIpoPubliclyVisible(ipo), true);
    assert.equal(canDeleteIpoInFirestore(authCtx, id, ipo), false);

    // 3. Archive first (even if verificationStatus remained 'verified'!) -> becomes non-public and deletable by BOTH Owner & Publisher
    ipo.isArchived = true;
    ipo.status = 'Archived';
    assert.equal(isIpoPubliclyVisible(ipo), false);
    assert.equal(canDeleteIpoInFirestore(authCtx, id, ipo), true);

    // 4. Add a blocking Needs Review item referencing this IPO -> linked-ref check blocks deletion until resolved
    const revId = `rev-${id}`;
    fakeReviews.push({
      id: revId,
      companyName: ipo.companyName,
      targetIpoId: id,
      migrationKey: migKey,
      segment: 'Mainboard',
      reviewStatus: 'Needs Review',
      sourceName: 'SEBI',
      sourceUrl: ipo.sourceUrl,
      checkedAt: new Date(now).toISOString(),
      diffs: [],
      createdByUid: actorUid,
    });
    const blockedRefs = inspectIpoLinkedReferences({
      ipo,
      articles: Array.from(fakeArticles.values()),
      reviews: fakeReviews,
    });
    assert.equal(blockedRefs.hasBlockingPendingReviews, true);

    // Resolve review (Rejected) + approve delete -> linked-ref check passes & preserves linked article/media
    fakeReviews[fakeReviews.length - 1].reviewStatus = 'Rejected';
    ipo.deletionStatus = 'approved';
    ipo.status = 'Pending Deletion';
    ipo.isArchived = false;
    assert.equal(canDeleteIpoInFirestore(authCtx, id, ipo), true);

    const clearRefs = inspectIpoLinkedReferences({
      ipo,
      articles: Array.from(fakeArticles.values()),
      reviews: fakeReviews,
    });
    assert.equal(clearRefs.hasBlockingPendingReviews, false);

    fakeIpos.delete(id);
    fakeAudit.push({
      action: 'complete_delete',
      entityType: 'ipo',
      entityId: id,
      actorRole,
      summary: clearRefs.summary,
    });
    assert.equal(fakeIpos.has(id), false);
    // Linked editorial article & media remain preserved
    assert.equal(fakeArticles.has(artId), true);
    assert.equal(fakeMedia.has('med-crud-1'), true);
  }

  createAndLifecycleDeleteIpo('owner', 'ipo-owner-del-test');
  createAndLifecycleDeleteIpo('publisher', 'ipo-pub-del-test');
  assert.equal(fakeAudit.filter((a) => a.entityType === 'ipo' && a.action === 'complete_delete').length, 2);
});






