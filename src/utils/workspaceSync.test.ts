import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ArticleRecord,
  AuditLogRecord,
  IpoSourceReviewRecord,
  ManagedIpoRecord,
  StoredArticleDoc,
} from '../types/sakarbazaar.ts';
import { filterPublicArticlesWithOverrides } from './historicalNews.ts';
import { isIpoPubliclyVisible } from './ipoLifecycle.ts';
import {
  applyDocChangeDelta,
  computeAdminDashboardCounters,
  publishWorkspaceSyncSignal,
  shouldRunEconomicalVisibilityRefresh,
  sortArticlesForAdmin,
  sortAuditLogsForAdmin,
  sortManagedIposForAdmin,
  subscribeWorkspaceSyncSignals,
  type BroadcastChannelLike,
  type StorageLike,
} from './workspaceSync.ts';

class MockBroadcastBus {
  private channels: Set<{
    listenerMap: Set<(ev: { data: unknown }) => void>;
    channel: BroadcastChannelLike;
  }> = new Set();

  createChannel(): BroadcastChannelLike {
    const listenerMap = new Set<(ev: { data: unknown }) => void>();
    const entry = {
      listenerMap,
      channel: {
        postMessage: (message: unknown) => {
          for (const target of this.channels) {
            if (target === entry) continue;
            for (const fn of target.listenerMap) {
              fn({ data: message });
            }
          }
        },
        addEventListener: (_type: 'message', listener: (ev: { data: unknown }) => void) => {
          listenerMap.add(listener);
        },
        removeEventListener: (_type: 'message', listener: (ev: { data: unknown }) => void) => {
          listenerMap.delete(listener);
        },
        close: () => {
          listenerMap.clear();
          this.channels.delete(entry);
        },
      },
    };
    this.channels.add(entry);
    return entry.channel;
  }
}

function toPublicArticleRecord(doc: StoredArticleDoc): ArticleRecord {
  return {
    id: doc.id,
    slug: doc.slug,
    category: doc.category,
    headline: doc.enHeadline,
    headlineHi: doc.hiHeadline,
    deck: doc.enSummary,
    deckHi: doc.hiSummary,
    author: doc.author,
    authorRole: 'Staff Desk',
    publishedAt: doc.publishedAt || '2026-11-19',
    publishedAtMs: doc.publishedAtMs ?? null,
    expiresAtMs: doc.expiresAtMs ?? null,
    updatedAt: doc.publishedAt || '2026-11-19',
    time: 'Today',
    readTime: '3 min read',
    ticker: 'NIFTY',
    sourceName: doc.sourceName,
    sourceUrl: doc.sourceUrl ?? null,
    sourceNote: doc.sourceName,
    verificationStatus: doc.verificationStatus,
    editorialStatus: doc.status,
    illustration: 'markets-pulse',
    illustrationCaption: '',
    tags: doc.tags,
    keywords: doc.keywords,
    entities: doc.entities,
    aliases: [],
    keyPoints: [],
    sections: [{ heading: 'Report', paragraphs: [doc.enBody] }],
    citations: [],
    relatedSlugs: [],
    isFeatured: Boolean(doc.featuredPlacement && doc.featuredPlacement !== 'none'),
    featuredPlacement: doc.featuredPlacement,
    featuredOrder: doc.featuredOrder,
    isPaid: doc.isPaid,
    paidDisclosureLabel: doc.paidDisclosureLabel,
    isHomepageFeed: true,
  };
}

class InMemoryReactiveStore {
  private articles = new Map<string, StoredArticleDoc>();
  private ipos = new Map<string, ManagedIpoRecord>();
  private reviews = new Map<string, IpoSourceReviewRecord>();
  private audits = new Map<string, AuditLogRecord>();

  private articleSubscribers = new Set<(items: StoredArticleDoc[]) => void>();
  private ipoSubscribers = new Set<(items: ManagedIpoRecord[]) => void>();
  private reviewSubscribers = new Set<(items: IpoSourceReviewRecord[]) => void>();
  private auditSubscribers = new Set<(items: AuditLogRecord[]) => void>();

  subscribeSession(handlers: {
    onArticles: (docs: StoredArticleDoc[]) => void;
    onIpos: (docs: ManagedIpoRecord[]) => void;
    onReviews: (docs: IpoSourceReviewRecord[]) => void;
    onAudits: (docs: AuditLogRecord[]) => void;
  }): () => void {
    this.articleSubscribers.add(handlers.onArticles);
    this.ipoSubscribers.add(handlers.onIpos);
    this.reviewSubscribers.add(handlers.onReviews);
    this.auditSubscribers.add(handlers.onAudits);

    handlers.onArticles(sortArticlesForAdmin(Array.from(this.articles.values())));
    handlers.onIpos(sortManagedIposForAdmin(Array.from(this.ipos.values())));
    handlers.onReviews(Array.from(this.reviews.values()));
    handlers.onAudits(sortAuditLogsForAdmin(Array.from(this.audits.values())));

    return () => {
      this.articleSubscribers.delete(handlers.onArticles);
      this.ipoSubscribers.delete(handlers.onIpos);
      this.reviewSubscribers.delete(handlers.onReviews);
      this.auditSubscribers.delete(handlers.onAudits);
    };
  }

  upsertArticle(doc: StoredArticleDoc) {
    this.articles.set(doc.id, { ...doc });
    const sorted = sortArticlesForAdmin(Array.from(this.articles.values()));
    for (const sub of this.articleSubscribers) sub(sorted);
  }

  deleteArticle(id: string) {
    this.articles.delete(id);
    const sorted = sortArticlesForAdmin(Array.from(this.articles.values()));
    for (const sub of this.articleSubscribers) sub(sorted);
  }

  upsertIpo(doc: ManagedIpoRecord) {
    this.ipos.set(doc.id, { ...doc });
    const sorted = sortManagedIposForAdmin(Array.from(this.ipos.values()));
    for (const sub of this.ipoSubscribers) sub(sorted);
  }

  deleteIpo(id: string) {
    this.ipos.delete(id);
    const sorted = sortManagedIposForAdmin(Array.from(this.ipos.values()));
    for (const sub of this.ipoSubscribers) sub(sorted);
  }

  appendAudit(log: AuditLogRecord) {
    this.audits.set(log.id, { ...log });
    const sorted = sortAuditLogsForAdmin(Array.from(this.audits.values()));
    for (const sub of this.auditSubscribers) sub(sorted);
  }

  getPublicPublishedArticles(): ArticleRecord[] {
    return Array.from(this.articles.values())
      .filter((a) => a.status === 'Published' && a.verificationStatus === 'verified' && a.deletionStatus === 'none')
      .map(toPublicArticleRecord);
  }

  getPublicVerifiedIpos(): ManagedIpoRecord[] {
    return Array.from(this.ipos.values()).filter((i) => isIpoPubliclyVisible(i));
  }
}

function mkStoredArticle(id: string, overrides: Partial<StoredArticleDoc> = {}): StoredArticleDoc {
  return {
    id,
    slug: `slug-${id}`,
    title: `Title ${id}`,
    summary: 'Summary EN',
    body: 'Body EN',
    enHeadline: `English ${id}`,
    enSummary: 'Deck EN',
    enBody: 'Body EN',
    hiHeadline: `Hindi ${id}`,
    hiSummary: 'Deck HI',
    hiBody: 'Body HI',
    category: 'Markets',
    tags: [],
    keywords: [],
    entities: [],
    author: 'SakarBazaar Desk',
    sourceName: 'SEBI',
    language: 'bilingual',
    verificationStatus: 'awaiting_verification',
    status: 'Draft',
    deletionStatus: 'none',
    isPaid: false,
    durationPreset: '15d',
    publishedAtMs: 1_760_000_000_000,
    expiresAtMs: 1_765_000_000_000,
    createdByUid: 'owner-uid',
    updatedByUid: 'owner-uid',
    ...overrides,
  };
}

function mkIpo(id: string, overrides: Partial<ManagedIpoRecord> = {}): ManagedIpoRecord {
  return {
    id,
    companyName: `Company ${id}`,
    slug: `company-${id}`,
    segment: 'Mainboard',
    status: 'Awaiting Verification',
    verificationStatus: 'awaiting_verification',
    isArchived: false,
    deletionStatus: 'none',
    officialDocuments: [],
    updatedByUid: 'owner-uid',
    ...overrides,
  };
}

test('Workspace Sync: Multi-Session Admin Listeners + Cross-Tab Public Sync Propagate News, Pending Deletion, IPOs, and Dashboard Counters', () => {
  const nowMs = 1_760_500_000_000;
  const store = new InMemoryReactiveStore();
  const bus = new MockBroadcastBus();
  const staticCatalog: ArticleRecord[] = [];

  const sessionAState = {
    articles: [] as StoredArticleDoc[],
    ipos: [] as ManagedIpoRecord[],
    reviews: [] as IpoSourceReviewRecord[],
    audits: [] as AuditLogRecord[],
  };
  const sessionBState = {
    articles: [] as StoredArticleDoc[],
    ipos: [] as ManagedIpoRecord[],
    reviews: [] as IpoSourceReviewRecord[],
    audits: [] as AuditLogRecord[],
  };

  // Two concurrent admin sessions (Session A = Owner, Session B = Publisher)
  const unsubA = store.subscribeSession({
    onArticles: (docs) => { sessionAState.articles = docs; },
    onIpos: (docs) => { sessionAState.ipos = docs; },
    onReviews: (docs) => { sessionAState.reviews = docs; },
    onAudits: (docs) => { sessionAState.audits = docs; },
  });
  const unsubB = store.subscribeSession({
    onArticles: (docs) => { sessionBState.articles = docs; },
    onIpos: (docs) => { sessionBState.ipos = docs; },
    onReviews: (docs) => { sessionBState.reviews = docs; },
    onAudits: (docs) => { sessionBState.audits = docs; },
  });

  // Public reader Tab C subscribed to cross-tab BroadcastChannel signals
  let publicArticles: ArticleRecord[] = [];
  let publicIpos: ManagedIpoRecord[] = [];
  const syncStorage: StorageLike = { setItem: () => {} };
  const adminChannel = bus.createChannel();
  const publicChannel = bus.createChannel();
  let selfSignalsSeen = 0;

  const unsubSyncSelf = subscribeWorkspaceSyncSignals({
    senderId: 'admin-tab-a',
    channel: adminChannel,
    windowTarget: null,
    onSignal: () => {
      selfSignalsSeen++;
    },
  });

  const unsubSyncPublic = subscribeWorkspaceSyncSignals({
    senderId: 'public-tab-c',
    channel: publicChannel,
    windowTarget: null,
    onSignal: (signal) => {
      if (signal.topics.includes('articles')) {
        publicArticles = filterPublicArticlesWithOverrides(
          store.getPublicPublishedArticles(),
          staticCatalog,
          null,
          nowMs,
        );
      }
      if (signal.topics.includes('ipos')) {
        publicIpos = store.getPublicVerifiedIpos();
      }
    },
  });

  // 1. Session A creates Draft & Publishes News -> Session B Manage News + Dashboard KPIs + Public Tab C update immediately
  store.upsertArticle(mkStoredArticle('art-1', {
    status: 'Published',
    verificationStatus: 'verified',
    publishedAtMs: nowMs - 10_000,
    expiresAtMs: nowMs + 10 * 24 * 3_600_000,
  }));
  store.appendAudit({
    id: 'aud-1',
    action: 'publish',
    entityType: 'article',
    entityId: 'art-1',
    actorUid: 'owner-uid',
    actorEmail: 'owner@example.com',
    previousStatus: 'Draft',
    nextStatus: 'Published',
    summary: 'Published art-1',
    createdAtMs: nowMs,
  });
  publishWorkspaceSyncSignal(['articles'], 'admin-tab-a', 'publish', {
    channel: adminChannel,
    storage: syncStorage,
    nowMs,
  });

  assert.equal(selfSignalsSeen, 0);
  assert.equal(sessionBState.articles.length, 1);
  assert.equal(sessionBState.audits.length, 1);
  assert.equal(publicArticles.map((a) => a.id).join(','), 'art-1');

  let countersB = computeAdminDashboardCounters({
    articles: sessionBState.articles,
    ipos: sessionBState.ipos,
    ipoReviews: sessionBState.reviews,
    staticArticles: staticCatalog,
    nowMs,
  });
  assert.equal(countersB.livePublicCount, 1);
  assert.equal(countersB.pendingDeletionCount, 0);

  // 2. Session A marks article Pending Deletion -> Session B Pending Deletion badge/counter & Public Tab C hide it immediately
  store.upsertArticle(mkStoredArticle('art-1', {
    status: 'Pending Deletion',
    verificationStatus: 'unverified',
    deletionStatus: 'pending_approval',
    publishedAtMs: nowMs - 10_000,
    expiresAtMs: nowMs + 10 * 24 * 3_600_000,
  }));
  publishWorkspaceSyncSignal(['articles', 'legacyOverrides'], 'admin-tab-a', 'pending_delete', {
    channel: adminChannel,
    storage: syncStorage,
    nowMs: nowMs + 1000,
  });

  countersB = computeAdminDashboardCounters({
    articles: sessionBState.articles,
    ipos: sessionBState.ipos,
    ipoReviews: sessionBState.reviews,
    staticArticles: staticCatalog,
    nowMs,
  });
  assert.equal(countersB.livePublicCount, 0);
  assert.equal(countersB.pendingDeletionCount, 1);
  assert.equal(publicArticles.length, 0);

  // 3. Session B creates, verifies, then archives & permanently deletes an IPO -> Session A & Public Tab C stay synchronized
  store.upsertIpo(mkIpo('ipo-sync-1', {
    status: 'Open',
    verificationStatus: 'verified',
    isArchived: false,
    deletionStatus: 'none',
  }));
  publishWorkspaceSyncSignal(['ipos'], 'admin-tab-b', 'publish_ipo', {
    channel: adminChannel,
    storage: syncStorage,
    nowMs: nowMs + 2000,
  });
  assert.equal(sessionAState.ipos.length, 1);
  assert.equal(publicIpos.map((i) => i.id).join(','), 'ipo-sync-1');

  store.upsertIpo(mkIpo('ipo-sync-1', {
    status: 'Archived',
    verificationStatus: 'archived',
    isArchived: true,
    deletionStatus: 'none',
  }));
  publishWorkspaceSyncSignal(['ipos'], 'admin-tab-b', 'archive_ipo', {
    channel: adminChannel,
    storage: syncStorage,
    nowMs: nowMs + 3000,
  });
  assert.equal(publicIpos.length, 0);
  assert.equal(sessionAState.ipos[0].status, 'Archived');

  store.deleteIpo('ipo-sync-1');
  assert.equal(sessionAState.ipos.length, 0);
  assert.equal(sessionBState.ipos.length, 0);

  // Cleanup detaches all listeners cleanly
  unsubA();
  unsubB();
  unsubSyncSelf();
  unsubSyncPublic();
});

test('Workspace Sync: Delta updater and economical 30s visibility refresh cooldown', () => {
  const initial = [mkIpo('a'), mkIpo('b')];
  const modified = applyDocChangeDelta(
    initial,
    { type: 'modified', doc: mkIpo('b', { status: 'Archived', isArchived: true }) },
    sortManagedIposForAdmin,
  );
  assert.equal(modified.find((i) => i.id === 'b')?.isArchived, true);

  const removed = applyDocChangeDelta(
    modified,
    { type: 'removed', doc: mkIpo('a') },
    sortManagedIposForAdmin,
  );
  assert.deepEqual(removed.map((i) => i.id), ['b']);

  const base = 1_760_500_000_000;
  assert.equal(shouldRunEconomicalVisibilityRefresh(0, base, 30_000), true);
  assert.equal(shouldRunEconomicalVisibilityRefresh(base, base + 5_000, 30_000), false);
  assert.equal(shouldRunEconomicalVisibilityRefresh(base, base + 29_999, 30_000), false);
  assert.equal(shouldRunEconomicalVisibilityRefresh(base, base + 30_000, 30_000), true);
});
