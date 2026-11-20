import test from 'node:test';
import assert from 'node:assert/strict';
import { IPO_ALL_RECORDS } from '../data/editorialData.ts';
import { SEBI_IPO_FILINGS } from '../data/sebiIpoData.ts';
import type {
  LegacyOverridesRecord,
  ManagedIpoRecord,
} from '../types/sakarbazaar.ts';
import * as ipoLifecycle from './ipoLifecycle.ts';
import * as historicalNews from './historicalNews.ts';
import * as firestoreRulesPolicy from './firestoreRulesPolicy.ts';
import * as ipoRepo from '../lib/ipoRepository.ts';

test('I-1 / I-2: Canonical identity keeps dual offerings separate and shadows static filings cleanly by id/slug/migrationKey', () => {
  const selectPublicIpoCatalog = (ipoLifecycle as Record<string, unknown>).selectPublicIpoCatalog as
    | ((params: {
        firestoreIpos: ManagedIpoRecord[];
        staticCatalogIpos: typeof IPO_ALL_RECORDS;
        sebiFilings: typeof SEBI_IPO_FILINGS;
        legacyOverrides?: LegacyOverridesRecord | null;
        todayIst?: string;
      }) => {
        publicIpoRows: Array<{ id: string; slug: string; company: string; segment: string; issueSize?: string | null }>;
        calendarFilings: Array<{ id: string; companyName: string; category: string; issueSize?: string }>;
      })
    | undefined;

  assert.equal(typeof selectPublicIpoCatalog, 'function', 'selectPublicIpoCatalog must be exported from ipoLifecycle.ts');

  const ntpcFiling = SEBI_IPO_FILINGS.find((f) => f.id === 'sebi-ntpc-green')!;
  assert.ok(ntpcFiling, 'Expected built-in NTPC Green SEBI filing');

  // Verified Firestore override of built-in NTPC Green + a distinct SME offering of the same company name
  const firestoreIpos: ManagedIpoRecord[] = [
    {
      id: ntpcFiling.id,
      migrationKey: ipoLifecycle.convertSebiFilingToManagedIpo(ntpcFiling).migrationKey,
      companyName: ntpcFiling.companyName,
      slug: ntpcFiling.id,
      segment: 'Mainboard',
      status: 'Listed',
      verificationStatus: 'verified',
      isArchived: false,
      deletionStatus: 'none',
      issueSize: '₹10,500 Cr (Firestore Verified Update)',
      openingDate: '2024-11-19',
      closingDate: '2024-11-22',
      listingDate: '2024-11-27',
      sourceName: 'SEBI',
      sourceUrl: ntpcFiling.sebiDocumentUrl,
      officialDocuments: [ntpcFiling.sebiDocumentUrl],
      updatedByUid: 'owner-1',
    },
    {
      id: 'ipo-ntpc-sme-bonds',
      migrationKey: 'ntpc_sme_distinct_issue',
      companyName: ntpcFiling.companyName,
      slug: 'ntpc-green-sme-distinct',
      segment: 'SME',
      status: 'Upcoming',
      verificationStatus: 'verified',
      isArchived: false,
      deletionStatus: 'none',
      issueSize: '₹250 Cr',
      openingDate: '2026-12-10',
      closingDate: '2026-12-12',
      sourceName: 'SEBI',
      sourceUrl: 'https://www.sebi.gov.in/filings/ntpc-sme.pdf',
      officialDocuments: ['https://www.sebi.gov.in/filings/ntpc-sme.pdf'],
      updatedByUid: 'owner-1',
    },
  ];

  const result = selectPublicIpoCatalog!({
    firestoreIpos,
    staticCatalogIpos: IPO_ALL_RECORDS,
    sebiFilings: SEBI_IPO_FILINGS,
    legacyOverrides: null,
    todayIst: '2026-11-19',
  });

  // Dual offerings with same companyName MUST both remain in calendarFilings and publicIpoRows
  const ntpcCal = result.calendarFilings.filter((f) => f.companyName === ntpcFiling.companyName);
  assert.equal(ntpcCal.length, 2, 'Two distinct offerings of same company must stay separate');
  const mainboardCal = ntpcCal.find((f) => f.category === 'Mainboard');
  assert.equal(mainboardCal?.issueSize, '₹10,500 Cr (Firestore Verified Update)', 'Firestore verified edit must shadow static filing');
});

test('I-3: Persistent suppression via legacyOverrides hides archived/deleted built-in IPOs even with fresh browser state', () => {
  const selectPublicIpoCatalog = (ipoLifecycle as Record<string, unknown>).selectPublicIpoCatalog as
    | ((params: {
        firestoreIpos: ManagedIpoRecord[];
        staticCatalogIpos: typeof IPO_ALL_RECORDS;
        sebiFilings: typeof SEBI_IPO_FILINGS;
        legacyOverrides?: LegacyOverridesRecord | null;
        todayIst?: string;
      }) => {
        publicIpoRows: Array<{ id: string; slug: string }>;
        calendarFilings: Array<{ id: string; companyName: string }>;
      })
    | undefined;
  assert.equal(typeof selectPublicIpoCatalog, 'function');

  const mcl = IPO_ALL_RECORDS[0];
  const sebiFirst = SEBI_IPO_FILINGS[0];
  const overrides: LegacyOverridesRecord = {
    suppressedArticleIds: [],
    suppressedSlugs: [],
    suppressedIpoIds: [mcl.id, sebiFirst.id],
    suppressedIpoSlugs: [mcl.slug],
    suppressedIpoKeys: [],
  };

  const result = selectPublicIpoCatalog!({
    firestoreIpos: [],
    staticCatalogIpos: IPO_ALL_RECORDS,
    sebiFilings: SEBI_IPO_FILINGS,
    legacyOverrides: overrides,
    todayIst: '2026-11-19',
  });

  assert.equal(result.publicIpoRows.some((r) => r.id === mcl.id || r.slug === mcl.slug), false);
  assert.equal(result.calendarFilings.some((f) => f.id === sebiFirst.id || f.companyName === sebiFirst.companyName), false);

  // Unreadable overrides (null) keeps showing built-in rows safely (U-1 default)
  const fallbackResult = selectPublicIpoCatalog!({
    firestoreIpos: [],
    staticCatalogIpos: IPO_ALL_RECORDS,
    sebiFilings: SEBI_IPO_FILINGS,
    legacyOverrides: null,
    todayIst: '2026-11-19',
  });
  assert.equal(fallbackResult.publicIpoRows.some((r) => r.id === mcl.id), true);
  assert.equal(fallbackResult.calendarFilings.some((f) => f.companyName === sebiFirst.companyName), true);

  // Rules policy mirror must accept suppressedIpoIds/Slugs/Keys on legacyOverrides
  assert.equal(
    firestoreRulesPolicy.canWritePublicLegacyOverrides(
      { uid: 'owner-1', email: 'jeetsheetalpuri@gmail.com', emailVerified: true },
      'legacyOverrides',
      {
        suppressedArticleIds: [],
        suppressedSlugs: [],
        suppressedIpoIds: [mcl.id],
        suppressedIpoSlugs: [mcl.slug],
        suppressedIpoKeys: ['key-1'],
        updatedByUid: 'owner-1',
        updatedAt: 'ts',
      },
      'owner-1',
    ),
    true,
  );
});

test('I-4: Legacy /ipos records missing isArchived and deletionStatus remain visible publicly and in Admin', () => {
  const legacyIpo = {
    id: 'ipo_legacy_missing_flags',
    companyName: 'Legacy Verified Corp Ltd',
    slug: 'legacy-verified-corp-ltd',
    segment: 'Mainboard' as const,
    status: 'Open' as const,
    verificationStatus: 'verified' as const,
    updatedByUid: 'owner-1',
  } as unknown as ManagedIpoRecord;

  assert.equal(ipoLifecycle.isIpoPubliclyVisible(legacyIpo), true);
  assert.equal(firestoreRulesPolicy.isPolicyPublicIpo(legacyIpo), true);
});

test('I-10: Built-in SEBI filings & static catalog rows are marked Needs Review and never auto-verified in Admin table', () => {
  const unified = ipoLifecycle.buildUnifiedIpoManagementList({
    firestoreIpos: [],
    staticCatalogIpos: IPO_ALL_RECORDS,
    sebiFilings: SEBI_IPO_FILINGS,
    todayIso: '2026-11-19',
  });

  const builtinRows = unified.filter(
    (u) => u.sourceOrigin === 'sebi_filings' || u.sourceOrigin === 'static_catalog',
  );
  assert.equal(builtinRows.length, IPO_ALL_RECORDS.length + SEBI_IPO_FILINGS.length);
  for (const row of builtinRows) {
    assert.notEqual(row.verificationStatus, 'verified', `Built-in row ${row.companyName} must never be auto-verified`);
    assert.equal(row.needsReview, true, `Built-in row ${row.companyName} must show Needs Review`);
  }
});

test('I-5 & I-6: In-memory Firestore repository drives draft revisions (conflict check) & two-step IPO deletion with atomic suppression', async () => {
  const store = ipoRepo.createInMemoryIpoStore({
    ipos: {
      'ipo-mcl-editorial': {
        id: 'ipo-mcl-editorial',
        migrationKey: ipoLifecycle.convertCatalogIpoToManagedIpo(IPO_ALL_RECORDS[0]).migrationKey,
        companyName: 'Mahanadi Coalfields Limited',
        slug: 'mahanadi-coalfields-limited',
        segment: 'Mainboard',
        status: 'Upcoming',
        verificationStatus: 'verified',
        isArchived: false,
        deletionStatus: 'none',
        issueSize: '₹8,981 Cr',
        openingDate: '2026-12-01',
        closingDate: '2026-12-03',
        sourceName: 'SEBI',
        sourceUrl: 'https://www.sebi.gov.in/filings/mcl-rhp.pdf',
        officialDocuments: ['https://www.sebi.gov.in/filings/mcl-rhp.pdf'],
        updatedByUid: 'owner-1',
        updatedAtMs: 1000,
      } as ManagedIpoRecord & { updatedAtMs: number },
    },
    reviews: {},
    articles: {},
    publicCatalog: {},
    ipoRevisions: {},
    auditLogs: [],
  });

  const actor = { uid: 'pub-1', email: 'publisher@example.com' };

  // 1. Draft revision on published IPO leaves live IPO untouched
  await ipoRepo.saveIpoDraftRevisionTx(store, actor, {
    baseIpo: store.ipos['ipo-mcl-editorial'],
    proposedUpdates: {
      issueSize: '₹9,200 Cr',
      priceBand: '₹132–₹138',
    },
    baseUpdatedAtMs: 1000,
    submitForReview: true,
  });

  assert.equal(store.ipos['ipo-mcl-editorial'].issueSize, '₹8,981 Cr', 'Live IPO must stay unchanged while revision is pending');
  assert.equal(store.ipoRevisions['ipo-mcl-editorial']?.revisionStatus, 'pending_review');

  // 2. Reject revision preserves live IPO
  await ipoRepo.rejectIpoDraftRevisionTx(store, actor, 'ipo-mcl-editorial', 'Need updated RHP');
  assert.equal(store.ipoRevisions['ipo-mcl-editorial']?.revisionStatus, 'rejected');
  assert.equal(store.ipos['ipo-mcl-editorial'].issueSize, '₹8,981 Cr');

  // 3. Re-submit and test stale baseUpdatedAtMs conflict guard
  await ipoRepo.saveIpoDraftRevisionTx(store, actor, {
    baseIpo: store.ipos['ipo-mcl-editorial'],
    proposedUpdates: { issueSize: '₹9,500 Cr' },
    baseUpdatedAtMs: 900, // stale!
    submitForReview: true,
  });
  await assert.rejects(
    () => ipoRepo.approveAndPublishIpoRevisionTx(store, actor, 'ipo-mcl-editorial'),
    /updated|changed|refresh/i,
  );

  // 4. Approve with matching baseUpdatedAtMs merges cleanly
  await ipoRepo.saveIpoDraftRevisionTx(store, actor, {
    baseIpo: store.ipos['ipo-mcl-editorial'],
    proposedUpdates: { issueSize: '₹9,500 Cr' },
    baseUpdatedAtMs: 1000,
    submitForReview: true,
  });
  await ipoRepo.approveAndPublishIpoRevisionTx(store, actor, 'ipo-mcl-editorial');
  assert.equal(store.ipos['ipo-mcl-editorial'].issueSize, '₹9,500 Cr');
  assert.equal(store.ipoRevisions['ipo-mcl-editorial']?.revisionStatus, 'approved');

  // 5. Two-step IPO permanent deletion (archive -> request -> approve -> execute) + atomic suppression
  await assert.rejects(
    () => ipoRepo.requestIpoDeletionTx(store, actor, 'ipo-mcl-editorial'),
    /Archive or Unpublish/i,
  );
  await assert.rejects(
    () => ipoRepo.executeIpoPermanentDeletionTx(store, actor, 'ipo-mcl-editorial'),
    /pending|approved|archive|unpublish/i,
  );

  // Archive suppresses built-in IPO; Restore clears suppression
  await ipoRepo.updateIpoLifecycleWithSuppressionTx(store, actor, {
    targetIpo: store.ipos['ipo-mcl-editorial'],
    action: 'archive',
  });
  assert.ok(store.publicCatalog.legacyOverrides?.suppressedIpoIds?.includes('ipo-mcl-editorial'));
  await ipoRepo.updateIpoLifecycleWithSuppressionTx(store, actor, {
    targetIpo: store.ipos['ipo-mcl-editorial'],
    action: 'restore',
    todayIst: '2026-11-19',
  });
  assert.equal(store.publicCatalog.legacyOverrides?.suppressedIpoIds?.includes('ipo-mcl-editorial'), false);

  // Archive -> Request Delete -> Approve -> Execute Delete
  await ipoRepo.updateIpoLifecycleWithSuppressionTx(store, actor, {
    targetIpo: store.ipos['ipo-mcl-editorial'],
    action: 'archive',
  });
  await ipoRepo.requestIpoDeletionTx(store, actor, 'ipo-mcl-editorial');
  assert.equal(store.ipos['ipo-mcl-editorial'].deletionStatus, 'pending_approval');
  await assert.rejects(
    () => ipoRepo.executeIpoPermanentDeletionTx(store, actor, 'ipo-mcl-editorial'),
    /approval/i,
  );
  await ipoRepo.approveIpoDeletionTx(store, actor, 'ipo-mcl-editorial');
  assert.equal(store.ipos['ipo-mcl-editorial'].deletionStatus, 'approved');
  await ipoRepo.executeIpoPermanentDeletionTx(store, actor, 'ipo-mcl-editorial');
  assert.equal(store.ipos['ipo-mcl-editorial'], undefined);
  assert.ok(store.publicCatalog.legacyOverrides?.suppressedIpoIds?.includes('ipo-mcl-editorial'));
});
