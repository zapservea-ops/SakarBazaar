import type {
  ArticleRecord,
  AuditLogRecord,
  IpoSourceReviewRecord,
  ManagedIpoRecord,
  StoredArticleDoc,
  SystemSettingsRecord,
} from '../types/sakarbazaar';
import { isIpoPubliclyVisible } from './ipoLifecycle';
import {
  classifyArticleLifecycle,
  extractTimestampMillis,
  isArticleExpiringSoon,
} from './newsLifecycle';

export type WorkspaceSyncTopic =
  | 'articles'
  | 'ipos'
  | 'ipoReviews'
  | 'media'
  | 'legacyOverrides'
  | 'all';

export interface WorkspaceSyncSignal {
  senderId: string;
  topics: WorkspaceSyncTopic[];
  sentAtMs: number;
  reason?: string;
}

export const WORKSPACE_SYNC_CHANNEL_NAME = 'sakarbazaar_workspace_sync_v1';
export const WORKSPACE_SYNC_STORAGE_KEY = 'sb_workspace_sync_signal_v1';

export function createTabSessionId(): string {
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface BroadcastChannelLike {
  postMessage: (message: unknown) => void;
  addEventListener: (type: 'message', listener: (ev: { data: unknown }) => void) => void;
  removeEventListener: (type: 'message', listener: (ev: { data: unknown }) => void) => void;
  close?: () => void;
}

export interface StorageLike {
  setItem: (key: string, value: string) => void;
}

export function publishWorkspaceSyncSignal(
  topics: WorkspaceSyncTopic[],
  senderId: string,
  reason?: string,
  deps?: {
    channel?: BroadcastChannelLike | null;
    storage?: StorageLike | null;
    nowMs?: number;
  },
): WorkspaceSyncSignal {
  const signal: WorkspaceSyncSignal = {
    senderId,
    topics: topics.length > 0 ? topics : ['all'],
    sentAtMs: deps?.nowMs ?? Date.now(),
    reason,
  };

  try {
    if (deps?.channel) {
      deps.channel.postMessage(signal);
    } else if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(WORKSPACE_SYNC_CHANNEL_NAME);
      ch.postMessage(signal);
      ch.close();
    }
  } catch {
    // Fallback to storage signal cleanly
  }

  try {
    const storage =
      deps?.storage ??
      (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null);
    if (storage) {
      storage.setItem(WORKSPACE_SYNC_STORAGE_KEY, JSON.stringify(signal));
    }
  } catch {
    // Ignore private-mode / quota errors cleanly
  }

  return signal;
}

function isValidSyncSignal(raw: unknown): raw is WorkspaceSyncSignal {
  if (typeof raw !== 'object' || raw === null) return false;
  const candidate = raw as Partial<WorkspaceSyncSignal>;
  return (
    typeof candidate.senderId === 'string' &&
    Array.isArray(candidate.topics) &&
    typeof candidate.sentAtMs === 'number'
  );
}

export function subscribeWorkspaceSyncSignals(opts: {
  senderId: string;
  onSignal: (signal: WorkspaceSyncSignal) => void;
  channel?: BroadcastChannelLike | null;
  windowTarget?: {
    addEventListener: (type: 'storage', listener: (ev: { key?: string | null; newValue?: string | null }) => void) => void;
    removeEventListener: (type: 'storage', listener: (ev: { key?: string | null; newValue?: string | null }) => void) => void;
  } | null;
}): () => void {
  let ownedChannel: BroadcastChannelLike | null = null;
  let channel: BroadcastChannelLike | null = opts.channel ?? null;

  if (!channel && typeof BroadcastChannel !== 'undefined') {
    try {
      ownedChannel = new BroadcastChannel(WORKSPACE_SYNC_CHANNEL_NAME);
      channel = ownedChannel;
    } catch {
      ownedChannel = null;
    }
  }

  const onChannelMessage = (ev: { data: unknown }) => {
    if (!isValidSyncSignal(ev.data)) return;
    if (ev.data.senderId === opts.senderId) return;
    opts.onSignal(ev.data);
  };

  if (channel) {
    channel.addEventListener('message', onChannelMessage);
  }

  const winTarget =
    opts.windowTarget !== undefined
      ? opts.windowTarget
      : typeof window !== 'undefined'
        ? (window as unknown as NonNullable<typeof opts.windowTarget>)
        : null;

  const onStorage = (ev: { key?: string | null; newValue?: string | null }) => {
    if (ev.key !== WORKSPACE_SYNC_STORAGE_KEY || !ev.newValue) return;
    try {
      const parsed: unknown = JSON.parse(ev.newValue);
      if (!isValidSyncSignal(parsed)) return;
      if (parsed.senderId === opts.senderId) return;
      opts.onSignal(parsed);
    } catch {
      // Ignore malformed storage entries
    }
  };

  if (winTarget) {
    winTarget.addEventListener('storage', onStorage);
  }

  return () => {
    if (channel) {
      channel.removeEventListener('message', onChannelMessage);
    }
    if (ownedChannel?.close) {
      try {
        ownedChannel.close();
      } catch {
        // Ignore close error
      }
    }
    if (winTarget) {
      winTarget.removeEventListener('storage', onStorage);
    }
  };
}

/**
 * Prevents redundant read bursts on rapid tab switches while letting open browser tabs
 * refresh public feeds economically when the reader returns after >= minIntervalMs.
 */
export function shouldRunEconomicalVisibilityRefresh(
  lastRefreshMs: number,
  nowMs: number,
  minIntervalMs: number = 30_000,
): boolean {
  if (!Number.isFinite(lastRefreshMs) || lastRefreshMs <= 0) return true;
  return nowMs - lastRefreshMs >= minIntervalMs;
}

export function sortArticlesForAdmin(articles: StoredArticleDoc[]): StoredArticleDoc[] {
  return [...articles].sort((a, b) => {
    const aTime =
      extractTimestampMillis(a.updatedAt) ??
      extractTimestampMillis(a.createdAt) ??
      a.publishedAtMs ??
      0;
    const bTime =
      extractTimestampMillis(b.updatedAt) ??
      extractTimestampMillis(b.createdAt) ??
      b.publishedAtMs ??
      0;
    if (bTime !== aTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  });
}

export function sortManagedIposForAdmin(ipos: ManagedIpoRecord[]): ManagedIpoRecord[] {
  return [...ipos].sort((a, b) => {
    const aTime = extractTimestampMillis(a.updatedAt) ?? extractTimestampMillis(a.createdAt) ?? 0;
    const bTime = extractTimestampMillis(b.updatedAt) ?? extractTimestampMillis(b.createdAt) ?? 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  });
}

export function sortIpoReviewsForAdmin(reviews: IpoSourceReviewRecord[]): IpoSourceReviewRecord[] {
  return [...reviews].sort((a, b) => {
    const aTime = extractTimestampMillis(a.updatedAt) ?? extractTimestampMillis(a.createdAt) ?? 0;
    const bTime = extractTimestampMillis(b.updatedAt) ?? extractTimestampMillis(b.createdAt) ?? 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  });
}

export function sortAuditLogsForAdmin(logs: AuditLogRecord[]): AuditLogRecord[] {
  return [...logs].sort((a, b) => {
    const aTime = a.createdAtMs ?? extractTimestampMillis(a.createdAt) ?? 0;
    const bTime = b.createdAtMs ?? extractTimestampMillis(b.createdAt) ?? 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  });
}

export function applyDocChangeDelta<T extends { id: string }>(
  current: T[],
  change: { type: 'added' | 'modified' | 'removed'; doc: T },
  sortFn: (items: T[]) => T[],
): T[] {
  if (change.type === 'removed') {
    return sortFn(current.filter((item) => item.id !== change.doc.id));
  }
  const exists = current.some((item) => item.id === change.doc.id);
  const next = exists
    ? current.map((item) => (item.id === change.doc.id ? change.doc : item))
    : [...current, change.doc];
  return sortFn(next);
}

export interface AdminDashboardCounters {
  thresholdHours: number;
  livePublicArticles: StoredArticleDoc[];
  expiringSoonArticles: StoredArticleDoc[];
  draftArticles: StoredArticleDoc[];
  expiredOrRetainedArticles: StoredArticleDoc[];
  pendingDeletionArticles: StoredArticleDoc[];
  needsReviewIpos: IpoSourceReviewRecord[];
  livePublicCount: number;
  expiringSoonCount: number;
  draftCount: number;
  expiredOrRetainedCount: number;
  unmigratedLegacyCount: number;
  pendingDeletionCount: number;
  needsReviewIpoCount: number;
  managedIposCount: number;
  publicIposCount: number;
}

export function computeAdminDashboardCounters(params: {
  articles: StoredArticleDoc[];
  ipos: ManagedIpoRecord[];
  ipoReviews: IpoSourceReviewRecord[];
  staticArticles: ArticleRecord[];
  systemSettings?: Partial<SystemSettingsRecord>;
  nowMs?: number;
}): AdminDashboardCounters {
  const nowMs = params.nowMs ?? Date.now();
  const thresholdHours = params.systemSettings?.expiringSoonThresholdHours || 48;

  const classified = params.articles.map((article) => ({
    article,
    lifecycle: classifyArticleLifecycle(article, nowMs),
  }));

  const livePublicArticles = classified
    .filter((c) => c.lifecycle.isPublic)
    .map((c) => c.article);
  const draftArticles = classified
    .filter((c) => c.lifecycle.isDraftReview)
    .map((c) => c.article);
  const expiringSoonArticles = params.articles.filter((a) =>
    isArticleExpiringSoon(a, nowMs, thresholdHours),
  );
  const expiredOrRetainedArticles = classified
    .filter((c) => c.lifecycle.isExpiredArchive)
    .map((c) => c.article);
  const pendingDeletionArticles = classified
    .filter((c) => c.lifecycle.inDeletionQueue)
    .map((c) => c.article);

  const firestoreIds = new Set(params.articles.map((a) => a.id));
  const firestoreSlugs = new Set(params.articles.map((a) => a.slug));
  const unmigratedLegacyCount = params.staticArticles.filter(
    (base) => !firestoreIds.has(base.id) && !firestoreSlugs.has(base.slug),
  ).length;

  const needsReviewIpos = params.ipoReviews.filter((r) => r.reviewStatus === 'Needs Review');
  const publicIposCount = params.ipos.filter((i) => isIpoPubliclyVisible(i)).length;

  return {
    thresholdHours,
    livePublicArticles,
    expiringSoonArticles,
    draftArticles,
    expiredOrRetainedArticles,
    pendingDeletionArticles,
    needsReviewIpos,
    livePublicCount: livePublicArticles.length,
    expiringSoonCount: expiringSoonArticles.length,
    draftCount: draftArticles.length,
    expiredOrRetainedCount: expiredOrRetainedArticles.length,
    unmigratedLegacyCount,
    pendingDeletionCount: pendingDeletionArticles.length,
    needsReviewIpoCount: needsReviewIpos.length,
    managedIposCount: params.ipos.length,
    publicIposCount,
  };
}
