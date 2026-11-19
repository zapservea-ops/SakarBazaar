import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLegacyMigrationPreview,
  buildSeededHindiBodyFromStatic,
  buildUnifiedManageNewsList,
  computeLegacyOverridesState,
  convertStaticArticleToStoredDoc,
  evaluateStaticArticlePublishSafety,
  filterHistoricalAndCurrentNews,
  filterPublicArticlesWithOverrides,
  formatPublishedDateLabel,
  parseBodyToSections,
  parseLegacyPublishedDateMs,
  serializeSectionsToBody,
  sortPublicArticleRecords,
  toIstIsoDateInput,
} from './historicalNews.ts';
import { isArticleInDeletionQueue } from './newsLifecycle.ts';
import type { ArticleRecord, MediaAssetRecord, StoredArticleDoc } from '../types/sakarbazaar.ts';

function makeStaticArticle(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: 'art-rbi-01',
    slug: 'rbi-policy-dispatch-2026',
    category: 'RBI',
    headline: 'RBI holds policy repo rate steady amid steady liquidity',
    headlineHi: 'आरबीआई ने स्थिर तरलता के बीच नीतिगत रेपो दर को अपरिवर्तित रखा',
    deck: 'Central bank retains stance while monitoring inflation expectations across food baskets.',
    deckHi: 'केंद्रीय बैंक ने खाद्य मुद्रास्फीति के रुझानों पर नजर रखते हुए अपना रुख बरकरार रखा।',
    author: 'SakarBazaar Macro Desk',
    authorRole: 'Macro Editor',
    publishedAt: '17 Nov 2026 · 09:05 PM IST',
    updatedAt: '17 Nov 2026 · 09:05 PM IST',
    time: '09:05 PM IST',
    readTime: '3 min read',
    ticker: 'RBI',
    sourceName: 'Reserve Bank of India',
    sourceUrl: 'https://www.rbi.org.in',
    sourceNote: 'RBI MPC Press Release',
    verificationStatus: 'verified',
    editorialStatus: 'Published',
    illustration: 'rbi-dial',
    illustrationCaption: 'MPC Policy Dial',
    tags: ['RBI', 'Repo Rate'],
    keywords: ['rbi', 'repo'],
    entities: ['Reserve Bank of India'],
    aliases: [],
    keyPoints: ['Repo held steady'],
    sections: [
      {
        heading: 'Policy Overview',
        paragraphs: ['Paragraph one covering rate path.', 'Paragraph two covering liquidity.'],
      },
      {
        heading: 'Banking Outlook',
        paragraphs: ['Credit growth remains resilient across retail and services.'],
      },
    ],
    citations: [
      {
        id: 'cit-1',
        label: 'RBI Bulletin',
        portalName: 'RBI Official Portal',
        url: 'https://www.rbi.org.in',
        note: 'Official press release',
      },
    ],
    mediaId: 'med-rbi-hero',
    relatedSlugs: [],
    ...overrides,
  };
}

function makeFirestoreDoc(overrides: Partial<StoredArticleDoc> = {}): StoredArticleDoc {
  return {
    id: 'fs-new-01',
    title: 'SEBI tightens SME IPO disclosure framework',
    slug: 'sebi-tightens-sme-ipo-disclosure-framework',
    summary: 'Updated merchant banker disclosure checklist for SME issues.',
    body: 'Detailed regulatory update for SME market issuers.',
    enHeadline: 'SEBI tightens SME IPO disclosure framework',
    enSummary: 'Updated merchant banker disclosure checklist for SME issues.',
    enBody: 'Detailed regulatory update for SME market issuers.',
    hiHeadline: 'सेबी ने एसएमई आईपीओ प्रकटीकरण नियम कड़े किए',
    hiSummary: 'एसएमई निर्गमों के लिए अद्यतन मर्चेंट बैंकर जांच सूची।',
    hiBody: 'एसएमई बाजार के जारीकर्ताओं के लिए विस्तृत नियामक अद्यतन।',
    category: 'IPO',
    tags: ['SEBI', 'SME'],
    keywords: ['sebi', 'sme'],
    entities: ['SEBI'],
    author: 'Desk',
    status: 'Published',
    verificationStatus: 'verified',
    sourceName: 'SEBI',
    language: 'bilingual',
    publishedAt: '18 Nov 2026',
    publishedAtMs: Date.UTC(2026, 10, 18, 6, 0, 0),
    expiresAtMs: Date.UTC(2026, 10, 25, 6, 0, 0),
    deletionStatus: 'none',
    createdByUid: 'owner-1',
    ...overrides,
  };
}

test('Historical date parsing, IST formatting, and ISO date input helpers', () => {
  const istHuman = parseLegacyPublishedDateMs('17 Nov 2026 · 09:05 PM IST');
  assert.ok(istHuman !== null);
  // 21:05 IST on 17 Nov 2026 == 15:35 UTC on 17 Nov 2026
  assert.equal(istHuman, Date.UTC(2026, 10, 17, 15, 35, 0));
  assert.equal(toIstIsoDateInput(istHuman), '2026-11-17');
  assert.equal(formatPublishedDateLabel(istHuman!), '17 Nov 2026');

  const dateOnly = parseLegacyPublishedDateMs('2026-10-05');
  assert.ok(dateOnly !== null);
  assert.equal(toIstIsoDateInput(dateOnly), '2026-10-05');

  const plainHuman = parseLegacyPublishedDateMs('03 Aug 2025');
  assert.ok(plainHuman !== null);
  assert.equal(toIstIsoDateInput(plainHuman), '2025-08-03');

  assert.equal(parseLegacyPublishedDateMs(''), null);
  assert.equal(parseLegacyPublishedDateMs(null), null);
});

test('Structured sections <-> body round-tripping and plain paragraph backward compatibility', () => {
  const sections = [
    { heading: 'Policy Overview', paragraphs: ['First paragraph.', 'Second paragraph.'] },
    { heading: 'Banking Outlook', paragraphs: ['Third paragraph.'] },
  ];
  const serialized = serializeSectionsToBody(sections);
  assert.match(serialized, /## Policy Overview/);
  assert.match(serialized, /## Banking Outlook/);

  const reparsed = parseBodyToSections(serialized, 'Fallback summary', 'Editorial Dispatch');
  assert.equal(reparsed.length, 2);
  assert.equal(reparsed[0].heading, 'Policy Overview');
  assert.deepEqual(reparsed[0].paragraphs, ['First paragraph.', 'Second paragraph.']);
  assert.equal(reparsed[1].heading, 'Banking Outlook');
  assert.deepEqual(reparsed[1].paragraphs, ['Third paragraph.']);

  // Plain text without ## headings groups cleanly under default heading
  const plain = parseBodyToSections('Alpha paragraph.\n\nBeta paragraph.', 'Fallback', 'Editorial Dispatch');
  assert.equal(plain.length, 1);
  assert.equal(plain[0].heading, 'Editorial Dispatch');
  assert.deepEqual(plain[0].paragraphs, ['Alpha paragraph.', 'Beta paragraph.']);
});

test('Static-to-Firestore conversion preserves exact ID, slug, dates, and enforces safe verification + bilingual publish gates', () => {
  const legacy = makeStaticArticle();
  const { hiBody, seededFromDeck } = buildSeededHindiBodyFromStatic(legacy);
  assert.equal(seededFromDeck, true);
  assert.match(hiBody, /खाद्य मुद्रास्फीति/);

  const nowMs = Date.UTC(2026, 10, 18, 12, 0, 0);
  // Without full sectionsHi, requesting Published coerces safely to Draft instead of auto-publishing incomplete HI
  const convertedSeededOnly = convertStaticArticleToStoredDoc(legacy, {
    actorUid: 'pub-1',
    targetStatus: 'Published',
    durationPreset: '60d',
    nowMs,
  });

  assert.equal(convertedSeededOnly.id, 'art-rbi-01');
  assert.equal(convertedSeededOnly.slug, 'rbi-policy-dispatch-2026');
  assert.equal(convertedSeededOnly.publishedAt, '17 Nov 2026 · 09:05 PM IST');
  assert.equal(convertedSeededOnly.publishedAtMs, Date.UTC(2026, 10, 17, 15, 35, 0));
  assert.equal(convertedSeededOnly.mediaId, 'med-rbi-hero');
  assert.equal(convertedSeededOnly.deletionStatus, 'none');
  assert.equal(convertedSeededOnly.verificationStatus, 'verified');
  assert.match(convertedSeededOnly.enBody, /## Policy Overview/);
  assert.equal(convertedSeededOnly.status, 'Draft');
  assert.equal(convertedSeededOnly.expiresAtMs, null);

  // Full verified bilingual article WITH sectionsHi publishes cleanly when targetStatus is 'Published'
  const fullHi = makeStaticArticle({
    sectionsHi: [{ heading: 'नीति समीक्षा', paragraphs: ['यह विस्तृत हिन्दी अनुच्छेद पर्याप्त लंबा है।'] }],
  });
  const fullResult = buildSeededHindiBodyFromStatic(fullHi);
  assert.equal(fullResult.seededFromDeck, false);
  assert.match(fullResult.hiBody, /## नीति समीक्षा/);

  const convertedFullVerified = convertStaticArticleToStoredDoc(fullHi, {
    actorUid: 'pub-1',
    targetStatus: 'Published',
    durationPreset: '60d',
    nowMs,
  });
  assert.equal(convertedFullVerified.status, 'Published');
  assert.ok((convertedFullVerified.expiresAtMs ?? 0) > nowMs);

  // awaiting_verification MUST NEVER become Published automatically, even if full EN+HI exists
  const awaitingVerificationDoc = convertStaticArticleToStoredDoc(
    makeStaticArticle({
      verificationStatus: 'awaiting_verification',
      sectionsHi: [{ heading: 'समीक्षा', paragraphs: ['प्रारंभिक जानकारी आधिकारिक पुष्टि की प्रतीक्षा में है।'] }],
    }),
    {
      actorUid: 'pub-1',
      targetStatus: 'Published',
      durationPreset: '60d',
      nowMs,
    },
  );
  assert.equal(awaitingVerificationDoc.status, 'Awaiting Verification');
  assert.equal(awaitingVerificationDoc.verificationStatus, 'awaiting_verification');
  assert.equal(awaitingVerificationDoc.expiresAtMs, null);
});

test('Unified Manage News list deduplicates Firestore vs Static and filters by EN/HI, ID, slug, date & status', () => {
  const staticOne = makeStaticArticle({ id: 'stat-1', slug: 'legacy-rbi-note', publishedAt: '10 Oct 2026' });
  const staticMigrated = makeStaticArticle({
    id: 'stat-2',
    slug: 'legacy-migrated-note',
    publishedAt: '12 Oct 2026',
  });
  const fsLive = makeFirestoreDoc({
    id: 'fs-live-1',
    slug: 'live-nifty-close',
    publishedAtMs: Date.UTC(2026, 10, 18, 9, 0, 0),
    expiresAtMs: Date.UTC(2026, 10, 25, 9, 0, 0),
  });
  const fsMigrated = makeFirestoreDoc({
    id: 'stat-2',
    slug: 'legacy-migrated-note',
    status: 'Archived',
    retainedPrivate: true,
    publishedAt: '12 Oct 2026',
    publishedAtMs: parseLegacyPublishedDateMs('12 Oct 2026')!,
    expiresAtMs: Date.UTC(2026, 9, 20, 0, 0, 0),
  });
  const fsDraft = makeFirestoreDoc({
    id: 'fs-draft-1',
    slug: 'draft-banking-update',
    status: 'Draft',
    publishedAtMs: Date.UTC(2026, 10, 17, 10, 0, 0),
    expiresAtMs: null,
  });
  const fsPendingDel = makeFirestoreDoc({
    id: 'fs-del-1',
    slug: 'pending-delete-item',
    deletionStatus: 'approved',
  });

  const unified = buildUnifiedManageNewsList(
    [fsLive, fsMigrated, fsDraft, fsPendingDel],
    [staticOne, staticMigrated],
  );

  // Deduplicated: 4 Firestore + 1 unmigrated static = 5 items
  assert.equal(unified.length, 5);
  assert.equal(unified[0].doc.id, 'fs-live-1'); // newest first

  const nowMs = Date.UTC(2026, 10, 18, 12, 0, 0);

  // Excludes Section 8 deletion-queued items across 'all'
  const allVisibleInManage = filterHistoricalAndCurrentNews(unified, {
    search: '',
    statusFilter: 'all',
    originFilter: 'all',
    categoryFilter: 'All',
    dateFilter: 'all',
    nowMs,
  });
  assert.equal(allVisibleInManage.some((i) => i.doc.id === 'fs-del-1'), false);
  assert.equal(allVisibleInManage.length, 4);

  // Search by exact article ID
  const byId = filterHistoricalAndCurrentNews(unified, {
    search: 'stat-1',
    statusFilter: 'all',
    originFilter: 'all',
    categoryFilter: 'All',
    dateFilter: 'all',
    nowMs,
  });
  assert.equal(byId.length, 1);
  assert.equal(byId[0].origin, 'static');

  // Search by exact slug
  const bySlug = filterHistoricalAndCurrentNews(unified, {
    search: 'legacy-migrated-note',
    statusFilter: 'all',
    originFilter: 'all',
    categoryFilter: 'All',
    dateFilter: 'all',
    nowMs,
  });
  assert.equal(bySlug.length, 1);
  assert.equal(bySlug[0].doc.status, 'Archived');

  // Search by Hindi headline
  const byHindi = filterHistoricalAndCurrentNews(unified, {
    search: 'एसएमई आईपीओ',
    statusFilter: 'all',
    originFilter: 'all',
    categoryFilter: 'All',
    dateFilter: 'all',
    nowMs,
  });
  assert.equal(byHindi.some((i) => i.doc.id === 'fs-live-1'), true);

  // Status filter: 'historical' returns Archived + unmigrated static
  const historicalOnly = filterHistoricalAndCurrentNews(unified, {
    search: '',
    statusFilter: 'historical',
    originFilter: 'all',
    categoryFilter: 'All',
    dateFilter: 'all',
    nowMs,
  });
  assert.deepEqual(
    historicalOnly.map((i) => i.doc.id).sort(),
    ['stat-1', 'stat-2'],
  );

  // Date filter: exact_date in IST
  const exactOct10 = filterHistoricalAndCurrentNews(unified, {
    search: '',
    statusFilter: 'all',
    originFilter: 'all',
    categoryFilter: 'All',
    dateFilter: 'exact_date',
    exactDate: '2026-10-10',
    nowMs,
  });
  assert.equal(exactOct10.length, 1);
  assert.equal(exactOct10[0].doc.id, 'stat-1');

  // Date filter: older_30d (>30 days before 18 Nov 2026 -> Oct 10 & Oct 12)
  const older30d = filterHistoricalAndCurrentNews(unified, {
    search: '',
    statusFilter: 'all',
    originFilter: 'all',
    categoryFilter: 'All',
    dateFilter: 'older_30d',
    nowMs,
  });
  assert.deepEqual(
    older30d.map((i) => i.doc.id).sort(),
    ['stat-1', 'stat-2'],
  );
});

test('Migration preview accurately classifies migrate, already_in_firestore, and slug_conflict', () => {
  const staticList: ArticleRecord[] = [
    makeStaticArticle({ id: 's-ready', slug: 'ready-slug', mediaId: 'med-1' }),
    makeStaticArticle({ id: 's-done', slug: 'done-slug', mediaId: 'med-2' }),
    makeStaticArticle({ id: 's-conflict', slug: 'taken-slug', mediaId: 'med-1' }),
  ];
  const staticMedia: MediaAssetRecord[] = [
    {
      id: 'med-1',
      fileName: 'hero1.png',
      storagePath: 'public/assets/hero1.png',
      publicUrl: '/assets/hero1.png',
      mediaType: 'image/png',
      title: 'Hero 1',
      caption: 'Caption 1',
      sourceNote: 'SakarBazaar',
    },
    {
      id: 'med-2',
      fileName: 'hero2.png',
      storagePath: 'public/assets/hero2.png',
      publicUrl: '/assets/hero2.png',
      mediaType: 'image/png',
      title: 'Hero 2',
      caption: 'Caption 2',
      sourceNote: 'SakarBazaar',
    },
  ];
  const fsArticles: StoredArticleDoc[] = [
    makeFirestoreDoc({ id: 's-done', slug: 'done-slug' }),
    makeFirestoreDoc({ id: 'custom-other-id', slug: 'taken-slug' }),
  ];

  const preview = buildLegacyMigrationPreview(staticList, staticMedia, fsArticles, [
    { id: 'med-2', fileName: 'hero2.png', mediaType: 'image/png', uploadedByUid: 'owner-1' },
  ]);

  assert.equal(preview.totalStaticArticles, 3);
  assert.equal(preview.readyCount, 1);
  assert.equal(preview.alreadyMigratedCount, 1);
  assert.equal(preview.conflictCount, 1);
  assert.equal(preview.items.find((i) => i.articleId === 's-ready')?.action, 'migrate');
  assert.equal(preview.items.find((i) => i.articleId === 's-done')?.action, 'already_in_firestore');
  assert.equal(preview.items.find((i) => i.articleId === 's-conflict')?.action, 'slug_conflict');
  assert.equal(preview.mediaAssetsToRegister.find((m) => m.id === 'med-1')?.alreadyRegistered, false);
  assert.equal(preview.mediaAssetsToRegister.find((m) => m.id === 'med-2')?.alreadyRegistered, true);
});

test('Public catalog overrides prevent duplicate articles & prevent resurrection after unpublish/archive/delete', () => {
  const nowMs = Date.UTC(2026, 10, 18, 12, 0, 0);
  const futureMs = nowMs + 7 * 24 * 3_600_000;
  const pastMs = nowMs - 60_000;

  const staticA = makeStaticArticle({ id: 'legacy-a', slug: 'legacy-a-slug' });
  const staticB = makeStaticArticle({ id: 'legacy-b', slug: 'legacy-b-slug' });
  const staticC = makeStaticArticle({ id: 'legacy-c', slug: 'legacy-c-slug' });

  // Scenario 1: legacy-a migrated & live; legacy-b archived; legacy-c permanently deleted
  const fsArticles: StoredArticleDoc[] = [
    makeFirestoreDoc({
      id: 'legacy-a',
      slug: 'legacy-a-slug',
      status: 'Published',
      expiresAtMs: futureMs,
      deletionStatus: 'none',
    }),
    makeFirestoreDoc({
      id: 'legacy-b',
      slug: 'legacy-b-slug',
      status: 'Archived',
      expiresAtMs: futureMs,
      deletionStatus: 'none',
    }),
  ];

  const overrides = computeLegacyOverridesState({
    firestoreArticles: fsArticles,
    staticArticles: [staticA, staticB, staticC],
    extraSuppressedIds: ['legacy-c'],
    extraSuppressedSlugs: ['legacy-c-slug'],
    nowMs,
  });

  // legacy-a is live, so NOT suppressed; legacy-b (Archived) and legacy-c (Deleted) ARE suppressed
  assert.equal(overrides.suppressedArticleIds.includes('legacy-a'), false);
  assert.equal(overrides.suppressedArticleIds.includes('legacy-b'), true);
  assert.equal(overrides.suppressedSlugs.includes('legacy-b-slug'), true);
  assert.equal(overrides.suppressedArticleIds.includes('legacy-c'), true);

  // Public filter receives only live Firestore docs (legacy-a) + static fallback catalog + legacyOverrides
  const remoteLivePublic: ArticleRecord[] = [
    makeStaticArticle({
      id: 'legacy-a',
      slug: 'legacy-a-slug',
      headline: 'Updated Firestore Headline for Legacy A',
      editorialStatus: 'Published',
      expiresAtMs: futureMs,
    }),
  ];
  const publicFeed = filterPublicArticlesWithOverrides(
    remoteLivePublic,
    [staticA, staticB, staticC],
    overrides,
    nowMs,
  );

  // Only legacy-a appears ONCE (with Firestore's updated headline); legacy-b & legacy-c stay hidden!
  assert.equal(publicFeed.length, 1);
  assert.equal(publicFeed[0].id, 'legacy-a');
  assert.equal(publicFeed[0].headline, 'Updated Firestore Headline for Legacy A');

  // Scenario 2: legacy-b expires via pastMs as well -> still suppressed
  const overridesExpired = computeLegacyOverridesState({
    firestoreArticles: [
      makeFirestoreDoc({
        id: 'legacy-b',
        slug: 'legacy-b-slug',
        status: 'Published',
        expiresAtMs: pastMs,
        deletionStatus: 'none',
      }),
    ],
    staticArticles: [staticB],
    currentOverrides: overrides,
    nowMs,
  });
  assert.equal(overridesExpired.suppressedArticleIds.includes('legacy-b'), true);

  // Scenario 3: legacy-b is Restored & Republished -> suppression is cleanly lifted
  const overridesRestored = computeLegacyOverridesState({
    firestoreArticles: [
      makeFirestoreDoc({
        id: 'legacy-b',
        slug: 'legacy-b-slug',
        status: 'Published',
        expiresAtMs: futureMs,
        deletionStatus: 'none',
      }),
    ],
    staticArticles: [staticB],
    currentOverrides: overridesExpired,
    nowMs,
  });
  assert.equal(overridesRestored.suppressedArticleIds.includes('legacy-b'), false);
  assert.equal(overridesRestored.suppressedSlugs.includes('legacy-b-slug'), false);
});

test('Migration safety counters, deterministic public sort order, and consistent 6-state deletion queue boundaries', () => {
  const verifiedBilingual = makeStaticArticle({
    id: 's-ver',
    slug: 'verified-bilingual',
    mediaId: 'med-ok',
    sectionsHi: [{ heading: 'सारांश', paragraphs: ['पूर्ण हिंदी लेख सामग्री बीस से अधिक अक्षरों की है।'] }],
  });
  const awaitingMissingMedia = makeStaticArticle({
    id: 's-wait',
    slug: 'awaiting-missing-media',
    verificationStatus: 'awaiting_verification',
    mediaId: 'med-missing',
  });

  const safetyA = evaluateStaticArticlePublishSafety(verifiedBilingual, new Set(['med-ok']));
  assert.equal(safetyA.canSafelyPublish, true);
  assert.equal(safetyA.missingMedia, false);

  const safetyB = evaluateStaticArticlePublishSafety(awaitingMissingMedia, new Set(['med-ok']));
  assert.equal(safetyB.canSafelyPublish, false);
  assert.equal(safetyB.awaitingVerification, true);
  assert.equal(safetyB.missingMedia, true);
  assert.equal(safetyB.resultingStatusIfPublished, 'Awaiting Verification');

  const preview = buildLegacyMigrationPreview([verifiedBilingual, awaitingMissingMedia], [], [], []);
  assert.equal(preview.readyCount, 2);
  assert.equal(preview.blockedFromPublishCount, 1);

  // Deterministic sort order places newest published timestamp first independent of input order
  const older = makeStaticArticle({ id: 'art-old', slug: 'old', publishedAt: '10 Nov 2026', publishedAtMs: Date.UTC(2026, 10, 10) });
  const newer = makeStaticArticle({ id: 'art-new', slug: 'new', publishedAt: '18 Nov 2026', publishedAtMs: Date.UTC(2026, 10, 18) });
  const sorted = sortPublicArticleRecords([older, newer]);
  assert.deepEqual(sorted.map((s) => s.id), ['art-new', 'art-old']);

  // All 6 DeletionStatus values: none = Manage News; pending_approval/approved/in_progress/partial_failure = Queue; deleted = excluded
  const allStatuses = ['none', 'pending_approval', 'approved', 'in_progress', 'partial_failure', 'deleted'] as const;
  const fsDocs = allStatuses.map((deletionStatus) =>
    makeFirestoreDoc({
      id: `doc-${deletionStatus}`,
      slug: `slug-${deletionStatus}`,
      deletionStatus,
      status: deletionStatus === 'none' ? 'Published' : deletionStatus === 'deleted' ? 'Deleted' : 'Pending Deletion',
    }),
  );
  assert.deepEqual(
    fsDocs.filter(isArticleInDeletionQueue).map((d) => d.id),
    ['doc-pending_approval', 'doc-approved', 'doc-in_progress', 'doc-partial_failure'],
  );
  const unified = buildUnifiedManageNewsList(fsDocs, []);
  const manageVisible = filterHistoricalAndCurrentNews(unified, {
    search: '',
    statusFilter: 'all',
    originFilter: 'all',
    categoryFilter: 'All',
    dateFilter: 'all',
  });
  assert.deepEqual(manageVisible.map((m) => m.doc.id), ['doc-none']);
});

