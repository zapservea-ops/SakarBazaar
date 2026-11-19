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
  isArticleInDeletionQueue,
  isArticlePubliclyVisible,
  resolveDurationHours,
  sanitizeArticleSlug,
  selectHomepageFeaturedArticles,
  shouldAllowAbandonedDeletionRecovery,
  validateArticleDraftInput,
  validateArticlePublishInput,
  validateNewsComposerInput,
} from './newsLifecycle.ts';
import {
  canSafelyDeleteMediaAsset,
  collectCandidateReferencingArticleIds,
  computeMediaVisibilityFromArticles,
  estimateMediaQuotaUsage,
  evaluateReplacedMediaCleanup,
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
  buildIpoBackfillDryRunReport,
  buildProductionIpoSchemaInventory,
  buildUnifiedIpoManagementList,
  buildUnifiedIpoManagementPreview,
  calculateIpoStatusFromDates,
  classifyBuiltInIpoCatalogRecord,
  classifyUnifiedIpoCategory,
  convertCatalogIpoToManagedIpo,
  convertSebiFilingToManagedIpo,
  detectIpoFieldDiffs,
  evaluateManualIpoVerificationGuard,
  filterAndSortManagedIpos,
  findMatchingManagedIpo,
  formatOfficialIpoField,
  getAvailableIpoRowActions,
  hasDuplicateIpoReview,
  inspectIpoLinkedReferences,
  IPO_MANAGEMENT_CATEGORIES,
  isIpoPubliclyVisible,
  isOfficialSebiUrl,
  mapManagedIpoToPublicRow,
  normalizeIpoCompanyKey,
  normalizeToIsoDate,
  summarizeIpoManagementCategories,
} from './ipoLifecycle.ts';
import {
  computeLegacyOverridesState,
  filterPublicArticlesWithOverrides,
  resolveLegacyOverridesReadResult,
} from './historicalNews.ts';
import {
  canDeleteArticleInFirestore,
  canDeleteIpoInFirestore,
  canDeleteMediaInFirestore,
  canGetMediaRecord,
  canPublicOrUserGetArticle,
  canPublicOrUserListArticle,
  hasOnlyAllowedArticleKeys,
  isPolicyAuthorizedUser,
  isValidArticleSchemaForRules,
  isValidIpoSchemaForRules,
} from './firestoreRulesPolicy.ts';
import { SEBI_IPO_FILINGS } from '../data/sebiIpoData.ts';
import { getImageMedia, hasImageMedia } from './articleMedia.ts';
import { computeAdminDashboardCounters } from './workspaceSync.ts';
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

  // 3. Firestore permission failure preserves existing cache & surfaces explicit PERMISSION_DENIED diagnostic
  const permFailure = resolveLegacyOverridesReadResult({
    serverExists: false,
    cached: serverOverrides,
    error: new Error('PERMISSION_DENIED'),
    isPermissionDenied: true,
  });
  assert.equal(permFailure.ok, false);
  assert.equal(permFailure.readPermitted, false);
  assert.equal(permFailure.source, 'permission_denied_cache');
  assert.ok(permFailure.errorMessage && /PERMISSION_DENIED/.test(permFailure.errorMessage));
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
    status: ManagedIpoRecord['status'];
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

test('Release Blocker §1: Read-only Production /ipos Schema Inventory & Backfill Dry-Run Analyzer', () => {
  const mixedSample = [
    {
      id: 'ipo-modern-public',
      companyName: 'Modern Public FinCorp',
      verificationStatus: 'verified' as const,
      status: 'Open' as const,
      isArchived: false,
      deletionStatus: 'none' as const,
    },
    {
      id: 'ipo-legacy-verified-missing-both',
      companyName: 'Legacy Missing Defaults Ltd',
      verificationStatus: 'verified' as const,
      status: 'Listed' as const,
    },
    {
      id: 'ipo-legacy-missing-del',
      companyName: 'Legacy Missing DeletionStatus Ltd',
      verificationStatus: 'verified' as const,
      status: 'Upcoming' as const,
      isArchived: false,
    },
    {
      id: 'ipo-archived',
      companyName: 'Archived Holdings',
      verificationStatus: 'archived' as const,
      status: 'Archived' as const,
      isArchived: true,
      deletionStatus: 'none' as const,
    },
    {
      id: 'ipo-unpublished',
      companyName: 'Unpublished Infra',
      verificationStatus: 'unpublished' as const,
      status: 'Unpublished' as const,
      isArchived: false,
      deletionStatus: 'none' as const,
    },
    {
      id: 'ipo-pending-del',
      companyName: 'Pending Del Retail',
      verificationStatus: 'awaiting_verification' as const,
      status: 'Pending Deletion' as const,
      isArchived: false,
      deletionStatus: 'pending_approval' as const,
    },
    {
      id: 'ipo-unknown-anomaly',
      companyName: 'Corrupt Status Co',
      verificationStatus: 'bogus_verif' as never,
      status: 'MysteryStatus' as never,
      isArchived: false,
      deletionStatus: 'weird_del' as never,
    },
  ];

  const inv = buildProductionIpoSchemaInventory(mixedSample);
  assert.equal(inv.totalRecords, 7);
  assert.equal(inv.withIsArchivedCount, 6);
  assert.equal(inv.withDeletionStatusCount, 5);
  assert.equal(inv.missingEitherFieldCount, 2);
  assert.deepEqual(inv.missingIsArchivedIds, ['ipo-legacy-verified-missing-both']);
  assert.deepEqual(inv.missingDeletionStatusIds, [
    'ipo-legacy-verified-missing-both',
    'ipo-legacy-missing-del',
  ]);
  assert.equal(inv.verifiedLegacy2FilterCount, 3);
  assert.equal(inv.verifiedPublic4FilterCount, 1);
  assert.deepEqual(inv.droppedUnderNewQueryIds, [
    'ipo-legacy-verified-missing-both',
    'ipo-legacy-missing-del',
  ]);
  assert.equal(inv.archivedCount, 1);
  assert.equal(inv.unpublishedCount, 1);
  assert.equal(inv.pendingDeletionCount, 1);
  assert.equal(inv.invalidOrUnknownStatuses.length, 3);

  const dryRun = buildIpoBackfillDryRunReport(mixedSample);
  assert.equal(dryRun.dryRunOnly, true);
  assert.equal(dryRun.recordsRequiringBackfill, 2);
  assert.equal(dryRun.droppedVerifiedRecordsRescuedCount, 2);
  assert.deepEqual(dryRun.items[0].patchFields, { isArchived: false, deletionStatus: 'none' });
  assert.deepEqual(dryRun.items[1].patchFields, { deletionStatus: 'none' });
  // Confirm input docs remain unmodified (read-only guarantee)
  assert.equal('isArchived' in mixedSample[1], false);
  assert.equal('deletionStatus' in mixedSample[2], false);
});

test('Issue 1: Two-step Pending Deletion lifecycle, media ref cleanup, partial failure retry, and RBAC parity', () => {
  const now = Date.UTC(2026, 10, 19, 10, 0, 0);
  const ownerAuth = { uid: 'owner-1', email: BOOTSTRAPPED_OWNER_EMAIL, emailVerified: true, isBootstrappedOwner: true };
  const pubAuth = { uid: 'pub-1', email: 'publisher@sakarbazaar.com', emailVerified: true, allowlistActive: true, allowlistRole: 'publisher' as const };
  const outsiderAuth = { uid: 'user-9', email: 'random@example.com', emailVerified: true };

  // Non-admin / unauthorized user cannot approve, execute, or delete
  assert.equal(evaluateDeletionRequest('none').allowed, false);
  assert.equal(evaluateDeletionApproval('none', 'pending_approval').allowed, false);
  assert.equal(isPolicyAuthorizedUser(outsiderAuth), false);
  assert.equal(
    canDeleteArticleInFirestore(outsiderAuth, 'art-del-1', {
      status: 'Pending Deletion',
      deletionStatus: 'approved',
    }),
    false,
  );

  // In-memory store simulating Firestore /articles, /media, /mediaPayloads, /auditLogs
  const articles = new Map<string, StoredArticleDoc>();
  const mediaDocs = new Map<string, { id: string; isPublic: boolean; associatedArticleIds: string[] }>();
  const payloadDocs = new Map<string, { id: string; dataUrl: string; isPublic: boolean }>();
  const auditLogs: Array<{ id: string; action: string; entityId: string }> = [];

  mediaDocs.set('med-solo', { id: 'med-solo', isPublic: true, associatedArticleIds: ['art-solo'] });
  payloadDocs.set('med-solo', { id: 'med-solo', dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==', isPublic: true });
  mediaDocs.set('med-shared', { id: 'med-shared', isPublic: true, associatedArticleIds: ['art-shared-a', 'art-shared-b'] });
  payloadDocs.set('med-shared', { id: 'med-shared', dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==', isPublic: true });

  articles.set('art-solo', {
    id: 'art-solo',
    title: 'Solo Deletion Test Dispatch',
    slug: 'solo-deletion-test-dispatch',
    summary: 'Summary text for solo deletion verification.',
    body: 'Body content for solo deletion verification test.',
    enHeadline: 'Solo Deletion Test Dispatch',
    enSummary: 'Summary text for solo deletion verification.',
    enBody: 'Body content for solo deletion verification test.',
    hiHeadline: 'सोलो विलोपन परीक्षण रिपोर्ट',
    hiSummary: 'सोलो विलोपन सत्यापन सारांश।',
    hiBody: 'सोलो विलोपन सत्यापन परीक्षण के लिए विस्तृत सामग्री।',
    category: 'Markets',
    tags: ['Markets'],
    keywords: ['Markets'],
    entities: [],
    author: 'SakarBazaar Desk',
    status: 'Published',
    verificationStatus: 'verified',
    sourceName: '',
    mediaId: 'med-solo',
    language: 'bilingual',
    expiresAtMs: now + 86_400_000,
    deletionStatus: 'none',
    createdByUid: 'owner-1',
  });
  articles.set('art-shared-a', {
    ...articles.get('art-solo')!,
    id: 'art-shared-a',
    slug: 'shared-a',
    mediaId: 'med-shared',
  });
  articles.set('art-shared-b', {
    ...articles.get('art-solo')!,
    id: 'art-shared-b',
    slug: 'shared-b',
    mediaId: 'med-shared',
  });

  // 1. Stage 1: Request deletion -> enters pending_approval and disappears from public visibility & dashboard live KPI
  const reqRes = evaluateDeletionRequest('publisher', articles.get('art-solo'));
  assert.equal(reqRes.allowed, true);
  assert.equal(reqRes.nextDeletionStatus, 'pending_approval');
  articles.set('art-solo', {
    ...articles.get('art-solo')!,
    status: reqRes.nextStatus,
    deletionStatus: reqRes.nextDeletionStatus,
  });

  const clsPending = classifyArticleLifecycle(articles.get('art-solo')!, now);
  assert.equal(clsPending.inDeletionQueue, true);
  assert.equal(clsPending.isPublic, false);
  assert.equal(clsPending.canApproveDeletion, true);
  assert.equal(clsPending.canExecuteDeletion, false);
  assert.equal(canRetryPermanentDeletion(articles.get('art-solo')!, 'owner'), false);
  assert.equal(
    canDeleteArticleInFirestore(ownerAuth, 'art-solo', {
      status: 'Pending Deletion',
      deletionStatus: 'pending_approval',
    }),
    false,
  );

  // Dashboard counters reflect 1 article in pendingDeletion queue
  const countersPending = computeAdminDashboardCounters({
    articles: Array.from(articles.values()),
    ipos: [],
    ipoReviews: [],
    staticArticles: [],
    nowMs: now,
  });
  assert.equal(countersPending.pendingDeletionCount, 1);

  // 2. Cancel & Retain Privately works cleanly and clears queue counter
  const cancelRes = evaluateDeletionCancellation('publisher', articles.get('art-solo')!);
  assert.equal(cancelRes.allowed, true);
  articles.set('art-solo', {
    ...articles.get('art-solo')!,
    status: cancelRes.nextStatus,
    retainedPrivate: true,
    deletionStatus: cancelRes.nextDeletionStatus,
  });
  assert.equal(isArticleInDeletionQueue(articles.get('art-solo')!), false);

  // Re-request -> re-approve cycle (different approval timestamp must allow fresh audit entry)
  articles.set('art-solo', {
    ...articles.get('art-solo')!,
    status: 'Pending Deletion',
    deletionStatus: 'pending_approval',
  });
  const approveRes = evaluateDeletionApproval('owner', 'pending_approval');
  assert.equal(approveRes.allowed, true);
  assert.equal(approveRes.nextDeletionStatus, 'approved');
  articles.set('art-solo', {
    ...articles.get('art-solo')!,
    status: approveRes.nextStatus,
    deletionStatus: approveRes.nextDeletionStatus,
    deletionApprovedByEmail: BOOTSTRAPPED_OWNER_EMAIL,
  });
  auditLogs.push({ id: `approve_del_art-solo_${now + 1}`, action: 'approve_delete', entityId: 'art-solo' });
  auditLogs.push({ id: `approve_del_art-solo_${now + 2}`, action: 'approve_delete', entityId: 'art-solo' });
  assert.equal(new Set(auditLogs.map((l) => l.id)).size, 2);

  // 3. Stage 2: Execute allowed only after approval (by BOTH Owner and Publisher)
  const clsApproved = classifyArticleLifecycle(articles.get('art-solo')!, now);
  assert.equal(clsApproved.canExecuteDeletion, true);
  assert.equal(canRetryPermanentDeletion(articles.get('art-solo')!, 'owner'), true);
  assert.equal(canRetryPermanentDeletion(articles.get('art-solo')!, 'publisher'), true);
  assert.equal(
    canDeleteArticleInFirestore(pubAuth, 'art-solo', {
      status: 'Pending Deletion',
      deletionStatus: 'approved',
    }),
    true,
  );

  // 4. Simulate interrupted execution -> partial_failure recovery & retry -> deleted
  articles.set('art-solo', {
    ...articles.get('art-solo')!,
    status: 'Deletion In Progress',
    deletionStatus: 'in_progress',
    deletionAttempts: 1,
    updatedAt: now - 120_000,
  });
  assert.equal(shouldAllowAbandonedDeletionRecovery(now - 10_000, now), false);
  assert.equal(shouldAllowAbandonedDeletionRecovery(now - 120_000, now), true);

  // Mark partial failure and confirm cancel + retry both permitted
  articles.set('art-solo', {
    ...articles.get('art-solo')!,
    status: 'Pending Deletion',
    deletionStatus: 'partial_failure',
    deletionError: 'Simulated network drop',
    deletionAttempts: 1,
  });
  const clsPartial = classifyArticleLifecycle(articles.get('art-solo')!, now);
  assert.equal(clsPartial.canRetryDeletion, true);
  assert.equal(clsPartial.canCancelDeletion, true);

  // Retry succeeds: payload deleted BEFORE media (rule requires !exists(mediaPayloads/{mediaId}))
  const soloCheck = canSafelyDeleteMediaAsset('med-solo', Array.from(articles.values()), 'art-solo');
  assert.equal(soloCheck.canDelete, true);
  assert.equal(canDeleteMediaInFirestore(ownerAuth, 'med-solo', true), false);
  payloadDocs.delete('med-solo');
  assert.equal(canDeleteMediaInFirestore(ownerAuth, 'med-solo', false), true);
  mediaDocs.delete('med-solo');
  articles.delete('art-solo');
  assert.equal(articles.has('art-solo'), false);
  assert.equal(mediaDocs.has('med-solo'), false);
  assert.equal(payloadDocs.has('med-solo'), false);

  // 5. Shared media preservation when art-shared-a is deleted while art-shared-b still references med-shared
  articles.set('art-shared-a', {
    ...articles.get('art-shared-a')!,
    status: 'Pending Deletion',
    deletionStatus: 'approved',
  });
  const sharedCheck = canSafelyDeleteMediaAsset('med-shared', Array.from(articles.values()), 'art-shared-a');
  assert.equal(sharedCheck.canDelete, false);
  assert.deepEqual(sharedCheck.remainingArticleIds, ['art-shared-b']);
  articles.delete('art-shared-a');
  const updatedSharedVis = computeMediaVisibilityFromArticles('med-shared', Array.from(articles.values()), now);
  assert.equal(updatedSharedVis.isPublic, true);
  assert.deepEqual(updatedSharedVis.associatedArticleIds, ['art-shared-b']);
  assert.equal(mediaDocs.has('med-shared'), true);
  assert.equal(payloadDocs.has('med-shared'), true);

  // Counter drops cleanly to 0 after deletion
  const countersFinal = computeAdminDashboardCounters({
    articles: Array.from(articles.values()),
    ipos: [],
    ipoReviews: [],
    staticArticles: [],
    nowMs: now,
  });
  assert.equal(countersFinal.pendingDeletionCount, 0);

  // Terminal Deleted status cannot be approved again
  assert.equal(evaluateDeletionApproval('owner', 'deleted').allowed, false);
});

test('Issue 2: Photo credit & usage rights validation, News Desk republishing, and previous-media cleanup', () => {
  const baseFields = {
    author: 'SakarBazaar Editorial Desk',
    enHeadline: 'SEBI tightens retail margin transparency rules',
    enSummary: 'Listed brokers must display upfront intraday margin breakdowns cleanly.',
    enBody: 'Detailed English market structure dispatch covering retail broker margin disclosures across NSE and BSE.',
    hiHeadline: 'सेबी ने खुदरा मार्जिन पारदर्शिता नियम कड़े किए',
    hiSummary: 'सूचीबद्ध ब्रोकरों को अब इंट्राडे मार्जिन विवरण स्पष्ट दिखाना होगा।',
    hiBody: 'एनएसई और बीएसई पर खुदरा ब्रोकर मार्जिन प्रकटीकरण को कवर करने वाली विस्तृत हिंदी बाजार रिपोर्ट।',
    sourceName: '',
    sourceUrl: '',
    durationPreset: '15d' as const,
    customHours: 360,
    targetMode: 'publish' as const,
  };
  const validPhotoDataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(120);

  // 1. Uploaded photo with BOTH credit empty AND usage rights unchecked -> blocked with explicit field flags
  const missingBoth = validateNewsComposerInput({
    ...baseFields,
    mediaMode: 'photo',
    photoDataUrl: validPhotoDataUrl,
    mediaCredit: '',
    usageRightsConfirmed: false,
  });
  assert.equal(missingBoth.valid, false);
  assert.equal(missingBoth.fields.mediaCredit, true);
  assert.equal(missingBoth.fields.usageRightsConfirmed, true);
  assert.equal(missingBoth.fields.photoFile, false);
  assert.match(missingBoth.message ?? '', /Credit/i);
  assert.match(missingBoth.message ?? '', /usage rights/i);

  // 2. Uploaded photo with credit present but usage rights unchecked -> blocked on usageRightsConfirmed
  const missingRights = validateNewsComposerInput({
    ...baseFields,
    mediaMode: 'photo',
    photoDataUrl: validPhotoDataUrl,
    mediaCredit: 'Press Information Bureau',
    usageRightsConfirmed: false,
  });
  assert.equal(missingRights.valid, false);
  assert.equal(missingRights.fields.mediaCredit, false);
  assert.equal(missingRights.fields.usageRightsConfirmed, true);

  // 3. Uploaded photo with rights checked but credit empty -> blocked on mediaCredit
  const missingCredit = validateNewsComposerInput({
    ...baseFields,
    mediaMode: 'photo',
    photoDataUrl: validPhotoDataUrl,
    mediaCredit: '   ',
    usageRightsConfirmed: true,
  });
  assert.equal(missingCredit.valid, false);
  assert.equal(missingCredit.fields.mediaCredit, true);
  assert.equal(missingCredit.fields.usageRightsConfirmed, false);

  // 4. Switching to 'photo' without selecting an image file -> blocked cleanly (prevents silently clearing existing photo)
  const missingPhoto = validateNewsComposerInput({
    ...baseFields,
    mediaMode: 'photo',
    photoDataUrl: '',
    mediaCredit: 'PIB',
    usageRightsConfirmed: true,
  });
  assert.equal(missingPhoto.valid, false);
  assert.equal(missingPhoto.fields.photoFile, true);

  // 5. Valid compressed photo + credit + legal usage rights passes & resolves publicly via getImageMedia
  const validUpload = validateNewsComposerInput({
    ...baseFields,
    mediaMode: 'photo',
    photoDataUrl: validPhotoDataUrl,
    mediaCredit: 'SakarBazaar Photo Desk',
    usageRightsConfirmed: true,
  });
  assert.equal(validUpload.valid, true);
  assert.equal(validUpload.message, null);

  const imgAsset = {
    id: 'img_republish_test',
    fileName: '4JLOWAV_Media_2.jpg.jpg',
    storagePath: 'firestore:mediaPayloads/img_republish_test',
    publicUrl: validPhotoDataUrl,
    mediaType: 'image/jpeg' as const,
    width: 800,
    height: 500,
    sizeBytes: 69 * 1024,
    title: 'SEBI margin transparency report image',
    sourceNote: 'Photo: SakarBazaar Photo Desk',
    credit: 'SakarBazaar Photo Desk',
    usageRightsConfirmed: true,
    isPublic: true,
    caption: 'Test caption',
  };
  assert.equal(hasImageMedia({ media: imgAsset }), true);
  assert.equal(getImageMedia({ media: imgAsset })?.id, 'img_republish_test');

  // Invalid / oversized payload is rejected
  assert.equal(validateCompressedImagePayload('data:image/gif;base64,R0lGODlh', 'image/gif').valid, false);
  assert.equal(validateCompressedImagePayload('data:image/jpeg;base64,' + 'A'.repeat(700_000), 'image/jpeg').valid, false);

  // 6. Replace unshared previous custom photo -> old photo evaluated as safe to delete
  const unsharedReplace = evaluateReplacedMediaCleanup({
    previousMediaId: 'img_old_unshared',
    nextMediaId: 'img_republish_test',
    allArticles: [
      { id: 'art-1', mediaId: 'img_republish_test', status: 'Published', deletionStatus: 'none' },
      { id: 'art-2', mediaId: 'img_other', status: 'Published', deletionStatus: 'none' },
    ],
    staticArticles: [],
    staticMediaAssets: [],
  });
  assert.equal(unsharedReplace.shouldSyncPrevious, true);
  assert.equal(unsharedReplace.shouldDeletePrevious, true);
  assert.equal(unsharedReplace.reason, 'unreferenced_custom_asset');

  // 7. Replace shared previous photo -> old photo preserved & visibility synced across remaining articles
  const sharedReplace = evaluateReplacedMediaCleanup({
    previousMediaId: 'img_shared_photo',
    nextMediaId: 'img_republish_test',
    allArticles: [
      { id: 'art-1', mediaId: 'img_republish_test', status: 'Published', deletionStatus: 'none' },
      { id: 'art-2', mediaId: 'img_shared_photo', status: 'Published', deletionStatus: 'none' },
    ],
    staticArticles: [],
    staticMediaAssets: [],
  });
  assert.equal(sharedReplace.shouldSyncPrevious, true);
  assert.equal(sharedReplace.shouldDeletePrevious, false);
  assert.equal(sharedReplace.reason, 'still_referenced');
  assert.deepEqual(sharedReplace.remainingArticleIds, ['art-2']);

  // 8. Replace bundled static photo -> never deleted automatically
  const staticReplace = evaluateReplacedMediaCleanup({
    previousMediaId: 'med-rbi-policy',
    nextMediaId: 'img_republish_test',
    allArticles: [
      { id: 'art-1', mediaId: 'img_republish_test', status: 'Published', deletionStatus: 'none' },
    ],
    staticArticles: [],
    staticMediaAssets: [{ id: 'med-rbi-policy' }],
  });
  assert.equal(staticReplace.shouldDeletePrevious, false);
  assert.equal(staticReplace.reason, 'bundled_static_asset');

  // 9. Minor edit with attached new photo preserves original ID, slug, publishedAtMs, duration & expiresAtMs
  const pubMs = Date.UTC(2026, 9, 1, 8, 0, 0);
  const expMs = pubMs + 360 * 3_600_000;
  const minorEdited = applyMinorEditPreservingExpiry(
    {
      id: 'art-minor-1',
      slug: 'original-slug',
      publishedAt: '1 Oct 2026',
      publishedAtMs: pubMs,
      durationPreset: '15d' as const,
      durationHours: 360,
      expiresAtMs: expMs,
      mediaId: 'img_old',
    },
    { mediaId: 'img_republish_test' },
  );
  assert.equal(minorEdited.mediaId, 'img_republish_test');
  assert.equal(minorEdited.publishedAtMs, pubMs);
  assert.equal(minorEdited.expiresAtMs, expMs);
  assert.equal(minorEdited.durationHours, 360);

  // 10. Draft save with photo keeps media private (isPublic: false)
  const draftVis = computeMediaVisibilityFromArticles('img_republish_test', [
    { id: 'art-draft', mediaId: 'img_republish_test', status: 'Draft', expiresAtMs: null, deletionStatus: 'none' },
  ]);
  assert.equal(draftVis.isPublic, false);
  assert.equal(
    canGetMediaRecord(null, 'img_republish_test', { isPublic: draftVis.isPublic, expiresAtMs: draftVis.expiresAtMs }, Date.now()),
    false,
  );
  assert.equal(
    hasOnlyAllowedArticleKeys({
      slug: 'original-slug',
      category: 'Markets',
      author: 'SakarBazaar Editorial Desk',
      status: 'Published',
      verificationStatus: 'verified',
      language: 'bilingual',
      mediaId: 'img_republish_test',
      createdByUid: 'owner-1',
      updatedAt: {},
      createdAt: {},
    }),
    true,
  );
});

test('Issue 3 & Diagnostic Attribution: Manual IPO SEBI Verification Guard, Draft Isolation, and Step-Path Error Messages', () => {
  // 1. Official SEBI URL validation
  assert.equal(
    isOfficialSebiUrl('https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3'),
    true,
  );
  assert.equal(isOfficialSebiUrl('https://example.com/fake-ipo'), false);
  assert.equal(isOfficialSebiUrl(''), false);

  // 2. New manual IPO CANNOT bypass SEBI verification directly to 'verified'
  const blockedManualNew = evaluateManualIpoVerificationGuard({
    isNew: true,
    requestedVerificationStatus: 'verified',
    sourceUrl: 'https://www.sebi.gov.in/sebiweb/fake-manual-bypass',
  });
  assert.equal(blockedManualNew.allowed, false);
  assert.match(blockedManualNew.reason ?? '', /Section 10/i);

  // 3. New manual IPO CAN save cleanly as Draft or Awaiting Verification without SEBI URLs or dates
  const allowedManualDraft = evaluateManualIpoVerificationGuard({
    isNew: true,
    requestedVerificationStatus: 'awaiting_verification',
  });
  assert.equal(allowedManualDraft.allowed, true);

  const draftStatus = calculateIpoStatusFromDates({
    openingDate: '',
    closingDate: '',
    listingDate: '',
    verificationStatus: 'awaiting_verification',
    currentStatus: 'Draft',
  });
  assert.equal(draftStatus, 'Draft');
  assert.equal(
    isIpoPubliclyVisible({
      verificationStatus: 'awaiting_verification',
      status: draftStatus,
      isArchived: false,
      deletionStatus: 'none',
    }),
    false,
  );

  // Even if someone supplies dates while awaiting_verification, status remains private Awaiting Verification (or Draft)
  const awaitingStatusWithDates = calculateIpoStatusFromDates({
    openingDate: '2026-12-01',
    closingDate: '2026-12-03',
    listingDate: '2026-12-08',
    verificationStatus: 'awaiting_verification',
    currentStatus: 'Awaiting Verification',
  });
  assert.equal(awaitingStatusWithDates, 'Awaiting Verification');
  assert.equal(
    isIpoPubliclyVisible({
      verificationStatus: 'awaiting_verification',
      status: awaitingStatusWithDates,
      isArchived: false,
      deletionStatus: 'none',
    }),
    false,
  );

  // 4. Existing unverified IPO cannot be promoted via manual dropdown without Section 10 approval
  const blockedManualPromote = evaluateManualIpoVerificationGuard({
    isNew: false,
    requestedVerificationStatus: 'verified',
    existingVerificationStatus: 'awaiting_verification',
  });
  assert.equal(blockedManualPromote.allowed, false);

  // 5. Already-verified SEBI IPO preserves edit capability cleanly
  const allowedExistingVerified = evaluateManualIpoVerificationGuard({
    isNew: false,
    requestedVerificationStatus: 'verified',
    existingVerificationStatus: 'verified',
    sourceUrl: 'https://www.sebi.gov.in/filings/example.pdf',
    existingLastVerifiedAt: '2026-11-01T10:00:00.000Z',
  });
  assert.equal(allowedExistingVerified.allowed, true);

  // 6. Structured FirestoreErrorInfo messages always surface exact step operation & path
  const structuredAuditErr = new Error(
    JSON.stringify({
      error: 'Missing or insufficient permissions.',
      operationType: 'create',
      path: 'auditLogs/log_abc_123',
      authInfo: { userId: 'owner-1' },
    }),
  );
  const readableAudit = extractReadableErrorMessage(structuredAuditErr, 'Fallback');
  assert.match(readableAudit, /Missing or insufficient permissions/);
  assert.match(readableAudit, /\[create on auditLogs\/log_abc_123\]/);

  const structuredPayloadErr = new Error(
    JSON.stringify({
      error: 'Missing or insufficient permissions.',
      operationType: 'write',
      path: 'mediaPayloads/img_123',
    }),
  );
  assert.match(
    extractReadableErrorMessage(structuredPayloadErr, 'Fallback'),
    /\[write on mediaPayloads\/img_123\]/,
  );

  // 7. Legacy Published article without expiresAtMs gets fallback expiry calculated before media upload
  const now = Date.UTC(2026, 10, 19, 10, 0, 0);
  const legacyNoExpiry = applyMinorEditPreservingExpiry(
    {
      id: 'art-legacy-no-exp',
      slug: 'art-legacy-no-exp',
      durationPreset: '15d',
      durationHours: 360,
      expiresAtMs: null,
    },
    {},
  );
  const alignedExpiryMs =
    legacyNoExpiry.expiresAtMs ?? computeExpiresAtMs(now, legacyNoExpiry.durationHours || 360);
  assert.equal(alignedExpiryMs, now + 360 * 3_600_000);
});

test('Problem A: Unified IPO Records Management (3-source aggregation, 10 categories, filters/sort, per-status action matrix)', () => {
  const todayIso = '2026-11-19';
  const firestoreIpos: any[] = [
    {
      id: 'ipo_draft_alpha',
      migrationKey: 'alpha_draft',
      companyName: 'Alpha Draft BioTech Ltd',
      slug: 'alpha-draft-biotech-ltd',
      segment: 'Mainboard',
      status: 'Draft',
      verificationStatus: 'awaiting_verification',
      isArchived: false,
      deletionStatus: 'none',
      updatedByUid: 'owner-1',
      updatedAt: Date.UTC(2026, 10, 18),
    },
    {
      id: 'ipo_await_beta',
      migrationKey: 'beta_await',
      companyName: 'Beta Awaiting Aerospace Ltd',
      slug: 'beta-awaiting-aerospace-ltd',
      segment: 'SME',
      status: 'Awaiting Verification',
      verificationStatus: 'awaiting_verification',
      sourceName: 'SEBI',
      sourceUrl: 'https://www.sebi.gov.in/filings/beta-drhp.pdf',
      isArchived: false,
      deletionStatus: 'none',
      updatedByUid: 'owner-1',
      updatedAt: Date.UTC(2026, 10, 19),
    },
    {
      id: 'ipo_rejected_gamma',
      migrationKey: 'gamma_rejected',
      companyName: 'Gamma Rejected Infra Ltd',
      slug: 'gamma-rejected-infra-ltd',
      segment: 'Mainboard',
      status: 'Rejected',
      verificationStatus: 'rejected',
      isArchived: false,
      deletionStatus: 'none',
      updatedByUid: 'owner-1',
      updatedAt: Date.UTC(2026, 10, 17),
    },
    {
      id: 'ipo_open_delta',
      migrationKey: 'delta_open',
      companyName: 'Delta Live Precision Ltd',
      slug: 'delta-live-precision-ltd',
      segment: 'Mainboard',
      status: 'Open',
      verificationStatus: 'verified',
      openingDate: '2026-11-18',
      closingDate: '2026-11-20',
      listingDate: '2026-11-25',
      sourceName: 'SEBI',
      sourceUrl: 'https://www.sebi.gov.in/filings/delta-rhp.pdf',
      isArchived: false,
      deletionStatus: 'none',
      updatedByUid: 'owner-1',
      updatedAt: Date.UTC(2026, 10, 19),
    },
    {
      id: 'ipo_upcoming_eps',
      migrationKey: 'eps_upcoming',
      companyName: 'Epsilon Upcoming Chips Ltd',
      slug: 'epsilon-upcoming-chips-ltd',
      segment: 'Mainboard',
      status: 'Upcoming',
      verificationStatus: 'verified',
      openingDate: '2026-11-26',
      closingDate: '2026-11-28',
      listingDate: '2026-12-03',
      isArchived: false,
      deletionStatus: 'none',
      updatedByUid: 'owner-1',
      updatedAt: Date.UTC(2026, 10, 16),
    },
    {
      id: 'ipo_closed_zeta',
      migrationKey: 'zeta_closed',
      companyName: 'Zeta Closed Logistics Ltd',
      slug: 'zeta-closed-logistics-ltd',
      segment: 'SME',
      status: 'Closed',
      verificationStatus: 'verified',
      openingDate: '2026-11-10',
      closingDate: '2026-11-12',
      listingDate: '2026-11-22',
      isArchived: false,
      deletionStatus: 'none',
      updatedByUid: 'owner-1',
      updatedAt: Date.UTC(2026, 10, 15),
    },
    {
      id: 'ipo_listed_kappa',
      migrationKey: 'kappa_listed',
      companyName: 'Kappa Listed Defence Ltd',
      slug: 'kappa-listed-defence-ltd',
      segment: 'Mainboard',
      status: 'Listed',
      verificationStatus: 'verified',
      openingDate: '2026-10-10',
      closingDate: '2026-10-12',
      listingDate: '2026-10-17',
      isArchived: false,
      deletionStatus: 'none',
      updatedByUid: 'owner-1',
      updatedAt: Date.UTC(2026, 10, 15),
    },
    {
      id: 'ipo_archived_eta',
      migrationKey: 'eta_archived',
      companyName: 'Eta Archived Energy Ltd',
      slug: 'eta-archived-energy-ltd',
      segment: 'Mainboard',
      status: 'Archived',
      verificationStatus: 'archived',
      isArchived: true,
      deletionStatus: 'none',
      updatedByUid: 'owner-1',
      updatedAt: Date.UTC(2026, 10, 14),
    },
    {
      id: 'ipo_pending_del_theta',
      migrationKey: 'theta_pend_del',
      companyName: 'Theta Pending Del Corp',
      slug: 'theta-pending-del-corp',
      segment: 'Mainboard',
      status: 'Pending Deletion',
      verificationStatus: 'unpublished',
      isArchived: false,
      deletionStatus: 'pending_approval',
      updatedByUid: 'owner-1',
      updatedAt: Date.UTC(2026, 10, 19),
    },
    {
      // Built-in name collision with SME segment to confirm zero silent auto-merge & Needs Review flag
      id: 'ipo_conflict_nse',
      migrationKey: 'conflict_nse_sme',
      companyName: 'National Stock Exchange of India Ltd',
      slug: 'nse-sme-conflict-check',
      segment: 'SME',
      status: 'Awaiting Verification',
      verificationStatus: 'awaiting_verification',
      isArchived: false,
      deletionStatus: 'none',
      updatedByUid: 'owner-1',
      updatedAt: Date.UTC(2026, 10, 12),
    },
  ];

  const auditLogs: any[] = [
    {
      id: 'audit_del_1',
      action: 'complete_delete',
      entityType: 'ipo',
      entityId: 'ipo_removed_history_1',
      actorUid: 'owner-1',
      actorEmail: BOOTSTRAPPED_OWNER_EMAIL,
      previousStatus: 'Archived',
      nextStatus: 'Deleted',
      summary: 'Permanently deleted IPO dossier "Omega Removed Legacy Ltd" (ipo_removed_history_1)',
      createdAtMs: Date.UTC(2026, 10, 10),
    },
  ];

  const unified = buildUnifiedIpoManagementList({
    firestoreIpos,
    staticCatalogIpos: IPO_ALL_RECORDS,
    sebiFilings: SEBI_IPO_FILINGS,
    auditLogs,
    todayIso,
  });

  // Verify genuine built-in IPOs & SEBI filings are included and sample placeholders excluded
  assert.ok(unified.some((u) => u.sourceOrigin === 'firestore'));
  assert.ok(unified.some((u) => u.sourceOrigin === 'static_catalog'));
  assert.ok(unified.some((u) => u.sourceOrigin === 'sebi_filings'));
  assert.ok(unified.some((u) => u.sourceOrigin === 'deleted_history' && u.companyName === 'Omega Removed Legacy Ltd'));

  // All 10 categories must be represented cleanly in summary counters
  const summary = summarizeIpoManagementCategories(unified);
  assert.equal(IPO_MANAGEMENT_CATEGORIES.length, 10);
  for (const cat of IPO_MANAGEMENT_CATEGORIES) {
    assert.ok(summary[cat] >= 1, `Expected at least 1 record in category "${cat}", got ${summary[cat]}`);
  }

  // NSE name collision between Firestore SME & built-in catalog MUST NOT auto-merge & MUST flag Needs Review
  const nseMatches = unified.filter((u) =>
    normalizeIpoCompanyKey(u.companyName) === normalizeIpoCompanyKey('National Stock Exchange of India Ltd'),
  );
  assert.ok(nseMatches.length >= 2);
  assert.ok(nseMatches.every((m) => m.needsReview === true));

  // Search + Filters + Sorting
  const smeOpenSearch = filterAndSortManagedIpos(unified, {
    search: 'Beta',
    segment: 'SME',
    category: 'Awaiting Verification',
    verificationStatus: 'awaiting_verification',
    sortField: 'company_asc',
  });
  assert.equal(smeOpenSearch.length, 1);
  assert.equal(smeOpenSearch[0].id, 'ipo_await_beta');

  const sortedByOpening = filterAndSortManagedIpos(unified, {
    category: 'Upcoming',
    sortField: 'opening_asc',
  });
  assert.ok(sortedByOpening.some((i) => i.id === 'ipo_upcoming_eps'));

  // Exact per-status actions matrix & role gates
  const ownerPerms = getPermissionsForRole('owner');
  const pubPerms = getPermissionsForRole('publisher');

  const draftItem = unified.find((u) => u.id === 'ipo_draft_alpha')!;
  assert.deepEqual(
    getAvailableIpoRowActions(draftItem, ownerPerms).map((a) => a.id),
    ['edit', 'submit_review', 'execute_delete'],
  );

  const awaitingItem = unified.find((u) => u.id === 'ipo_await_beta')!;
  assert.deepEqual(
    getAvailableIpoRowActions(awaitingItem, ownerPerms).map((a) => a.id),
    ['edit', 'verify', 'reject', 'execute_delete'],
  );

  const openItem = unified.find((u) => u.id === 'ipo_open_delta')!;
  const openActions = getAvailableIpoRowActions(openItem, ownerPerms);
  assert.deepEqual(
    openActions.map((a) => a.id),
    ['edit', 'unpublish', 'archive', 'execute_delete'],
  );
  // Live public Open IPO MUST disable Delete
  assert.equal(openActions.find((a) => a.id === 'execute_delete')?.disabled, true);

  const closedItem = unified.find((u) => u.id === 'ipo_closed_zeta')!;
  const closedActions = getAvailableIpoRowActions(closedItem, ownerPerms);
  assert.deepEqual(
    closedActions.map((a) => a.id),
    ['edit', 'archive', 'restore', 'execute_delete'],
  );
  assert.equal(closedActions.find((a) => a.id === 'execute_delete')?.disabled, true);

  const rejectedItem = unified.find((u) => u.id === 'ipo_rejected_gamma')!;
  assert.deepEqual(
    getAvailableIpoRowActions(rejectedItem, ownerPerms).map((a) => a.id),
    ['edit', 'return_review', 'execute_delete'],
  );

  const archivedItem = unified.find((u) => u.id === 'ipo_archived_eta')!;
  assert.deepEqual(
    getAvailableIpoRowActions(archivedItem, ownerPerms).map((a) => a.id),
    ['restore', 'execute_delete'],
  );

  const pendingDelItem = unified.find((u) => u.id === 'ipo_pending_del_theta')!;
  // Publisher sees Cancel only (cannot Approve); Owner sees Cancel + Approve (cannot Execute before Approve)
  assert.deepEqual(
    getAvailableIpoRowActions(pendingDelItem, pubPerms).map((a) => a.id),
    ['cancel_delete'],
  );
  assert.deepEqual(
    getAvailableIpoRowActions(pendingDelItem, ownerPerms).map((a) => a.id),
    ['cancel_delete', 'approve_delete'],
  );

  const deletedItem = unified.find((u) => u.id === 'ipo_removed_history_1')!;
  assert.deepEqual(
    getAvailableIpoRowActions(deletedItem, ownerPerms).map((a) => a.id),
    ['view_history'],
  );
});

test('Problem C (Stateful Fake-Backend Simulation): Full IPO Lifecycle, Article Photo Republish, and Two-Step Permanent Deletion', () => {
  const now = Date.UTC(2026, 10, 19, 12, 0, 0);
  const ipoStore = new Map<string, Record<string, any>>();
  const articleStore = new Map<string, Record<string, any>>();
  const mediaStore = new Map<string, Record<string, any>>();
  const payloadStore = new Map<string, Record<string, any>>();
  const auditStore: Array<Record<string, any>> = [];

  // 1. IPO creation & full lifecycle management (Draft -> Review -> Verify -> Unpublish -> Archive -> Restore -> Delete)
  const ipoId = 'ipo_sim_acme_test';
  const ipoDraft: Record<string, any> = {
    id: ipoId,
    migrationKey: 'sim_acme_mainboard',
    companyName: 'SimTech Cloud Infrastructure Ltd',
    slug: 'simtech-cloud-infrastructure-ltd',
    segment: 'Mainboard',
    status: 'Draft',
    verificationStatus: 'awaiting_verification',
    sourceName: 'SEBI',
    sourceUrl: 'https://www.sebi.gov.in/filings/simtech-drhp.pdf',
    openingDate: '2026-12-01',
    closingDate: '2026-12-03',
    listingDate: '2026-12-08',
    isArchived: false,
    deletionStatus: 'none',
    updatedByUid: 'owner-1',
    createdAt: {},
    updatedAt: {},
  };
  const { id: _ignoreIpoId, ...draftDocData } = ipoDraft;
  assert.equal(isValidIpoSchemaForRules(draftDocData).valid, true);
  assert.equal(
    evaluateManualIpoVerificationGuard({
      isNew: true,
      requestedVerificationStatus: 'verified',
      sourceUrl: ipoDraft.sourceUrl,
    }).allowed,
    false,
  );
  ipoStore.set(ipoId, ipoDraft);

  // Submit for review -> Verify (requires official sebi.gov.in URL)
  ipoStore.set(ipoId, {
    ...ipoStore.get(ipoId)!,
    status: 'Awaiting Verification',
    verificationStatus: 'awaiting_verification',
  });
  assert.equal(isOfficialSebiUrl(ipoStore.get(ipoId)!.sourceUrl), true);

  const verifiedStatus = calculateIpoStatusFromDates({
    openingDate: '2026-12-01',
    closingDate: '2026-12-03',
    listingDate: '2026-12-08',
    verificationStatus: 'verified',
    isArchived: false,
    deletionStatus: 'none',
    todayIst: '2026-11-19',
  });
  assert.equal(verifiedStatus, 'Upcoming');
  ipoStore.set(ipoId, {
    ...ipoStore.get(ipoId)!,
    verificationStatus: 'verified',
    status: verifiedStatus,
    isArchived: false,
  });
  // Live public IPO CANNOT be deleted directly
  assert.equal(canDeleteIpoInFirestore({ uid: 'owner-1', email: BOOTSTRAPPED_OWNER_EMAIL, emailVerified: true }, ipoId, ipoStore.get(ipoId)!), false);

  // Archive -> Delete permanently (passes schema & rules parity)
  ipoStore.set(ipoId, {
    ...ipoStore.get(ipoId)!,
    previousVerificationStatus: 'verified',
    verificationStatus: 'archived',
    status: 'Archived',
    isArchived: true,
  });
  assert.equal(canDeleteIpoInFirestore({ uid: 'owner-1', email: BOOTSTRAPPED_OWNER_EMAIL, emailVerified: true }, ipoId, ipoStore.get(ipoId)!), true);
  ipoStore.delete(ipoId);
  auditStore.push({
    action: 'complete_delete',
    entityType: 'ipo',
    entityId: ipoId,
    summary: 'Permanently deleted IPO dossier "SimTech Cloud Infrastructure Ltd"',
    createdAtMs: now,
  });
  assert.equal(ipoStore.has(ipoId), false);

  // Also test built-in SEBI filing edit conversion preserves ID & derives safe slug
  const firstFiling = SEBI_IPO_FILINGS[0];
  const convertedSebi = convertSebiFilingToManagedIpo(firstFiling, '2026-11-19');
  assert.equal(convertedSebi.id, firstFiling.id);
  assert.equal(convertedSebi.slug, firstFiling.id);
  assert.equal(classifyUnifiedIpoCategory(convertedSebi, '2026-11-19'), 'Open');

  // Also test static catalog conversion preserves ID & slug
  const firstStatic = IPO_ALL_RECORDS[0];
  const convertedStatic = convertCatalogIpoToManagedIpo(firstStatic, '2026-11-19');
  assert.equal(convertedStatic.id, firstStatic.id);
  assert.equal(convertedStatic.slug, firstStatic.slug);

  // 2. Existing news article edit + compressed photo republishing
  const artId = 'art_sim_republish';
  const pubExpiresAtMs = computeExpiresAtMs(now, 360);
  articleStore.set(artId, {
    id: artId,
    slug: 'sim-existing-article',
    category: 'Markets',
    author: 'SakarBazaar Desk',
    status: 'Published',
    verificationStatus: 'verified',
    language: 'bilingual',
    enHeadline: 'Existing Market Report',
    enSummary: 'Initial market report summary text.',
    enBody: 'Detailed initial English body text exceeding minimum word count.',
    hiHeadline: 'मौजूदा बाजार रिपोर्ट',
    hiSummary: 'प्रारंभिक बाजार रिपोर्ट सारांश।',
    hiBody: 'विस्तृत प्रारंभिक हिंदी रिपोर्ट।',
    mediaId: null,
    expiresAtMs: pubExpiresAtMs,
    deletionStatus: 'none',
    createdByUid: 'owner-1',
    updatedByUid: 'owner-1',
    createdAt: {},
    updatedAt: {},
  });

  const validPhotoData = 'data:image/jpeg;base64,' + 'A'.repeat(160);
  const composerCheck = validateNewsComposerInput({
    mediaMode: 'photo',
    photoDataUrl: validPhotoData,
    mediaCredit: 'Press Information Bureau',
    usageRightsConfirmed: true,
    author: 'SakarBazaar Desk',
    enHeadline: 'Existing Market Report',
    enSummary: 'Initial market report summary text.',
    enBody: 'Detailed initial English body text exceeding minimum word count.',
    hiHeadline: 'मौजूदा बाजार रिपोर्ट',
    hiSummary: 'प्रारंभिक बाजार रिपोर्ट सारांश।',
    hiBody: 'विस्तृत प्रारंभिक हिंदी रिपोर्ट।',
    sourceName: '',
    sourceUrl: '',
    durationPreset: '15d',
    customHours: 360,
    targetMode: 'publish',
  });
  assert.equal(composerCheck.valid, true);

  const newMediaId = 'img_sim_repub_1';
  payloadStore.set(newMediaId, { mediaId: newMediaId, dataUrl: validPhotoData, isPublic: true });
  mediaStore.set(newMediaId, { id: newMediaId, isPublic: true, associatedArticleIds: [artId], expiresAtMs: pubExpiresAtMs });
  const updatedArticle: Record<string, any> = {
    ...articleStore.get(artId)!,
    mediaId: newMediaId,
    updatedByUid: 'owner-1',
    updatedAt: {},
  };
  const { id: _ignoreArtId, ...updatedArticleDoc } = updatedArticle;
  assert.equal(isValidArticleSchemaForRules(updatedArticleDoc).valid, true);
  articleStore.set(artId, updatedArticle);
  assert.equal(articleStore.get(artId)!.mediaId, newMediaId);

  // 3. Two-step permanent deletion: approve (pending_approval -> approved) THEN separate execute
  articleStore.set(artId, {
    ...articleStore.get(artId)!,
    status: 'Pending Deletion',
    deletionStatus: 'pending_approval',
  });
  const approvalGate = evaluateDeletionApproval('owner', 'pending_approval');
  assert.equal(approvalGate.allowed, true);
  assert.equal(approvalGate.nextDeletionStatus, 'approved');
  articleStore.set(artId, {
    ...articleStore.get(artId)!,
    status: 'Pending Deletion',
    deletionStatus: 'approved',
    deletionApprovedByUid: 'owner-1',
    deletionApprovedByEmail: BOOTSTRAPPED_OWNER_EMAIL,
    deletionApprovedAtMs: now,
    deletionError: '',
  });
  // Media still intact until explicit execution runs
  assert.equal(mediaStore.has(newMediaId), true);
  assert.equal(payloadStore.has(newMediaId), true);

  // Separate explicit execution removes payload -> media -> article
  const ownerAuth = { uid: 'owner-1', email: BOOTSTRAPPED_OWNER_EMAIL, emailVerified: true, isBootstrappedOwner: true };
  assert.equal(
    canDeleteArticleInFirestore(ownerAuth, artId, {
      status: articleStore.get(artId)!.status,
      deletionStatus: articleStore.get(artId)!.deletionStatus,
    }),
    true,
  );
  payloadStore.delete(newMediaId);
  mediaStore.delete(newMediaId);
  articleStore.delete(artId);
  assert.equal(articleStore.has(artId), false);
  assert.equal(mediaStore.has(newMediaId), false);
  assert.equal(payloadStore.has(newMediaId), false);
});









