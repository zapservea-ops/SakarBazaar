import type {
  ArticleRecord,
  ArticleSection,
  DurationPreset,
  EditorialWorkflowStatus,
  LegacyMigrationItemPreview,
  LegacyMigrationPreview,
  LegacyMigrationPublishSafety,
  LegacyOverridesRecord,
  ManagedNewsItem,
  MediaAssetRecord,
  NewsCategory,
  StoredArticleDoc,
  StoredMediaAssetDoc,
} from '../types/sakarbazaar';
import {
  classifyArticleLifecycle,
  computeExpiresAtMs,
  extractTimestampMillis,
  isArticlePubliclyVisible,
  MS_PER_HOUR,
  resolveDurationHours,
  sanitizeArticleSlug,
} from './newsLifecycle';

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Parses historical editorial date labels (e.g. "17 Nov 2026 · 09:05 PM IST", "18 Nov 2026", "2026-11-17")
 * into UTC epoch milliseconds accurately respecting IST when specified or for Indian dates.
 */
export function parseLegacyPublishedDateMs(rawDate: string | undefined | null): number | null {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();
  if (!trimmed) return null;

  // 1. ISO date "YYYY-MM-DD"
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    // Store at 09:00 AM IST so local date formatting stays on that calendar date in IST & UTC
    return Date.UTC(year, month, day, 9, 0, 0) - IST_OFFSET_MS;
  }

  // 2. "DD Mon YYYY · HH:MM AM/PM IST" or "DD Mon YYYY"
  const humanMatch =
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s*[·,-]?\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?(?:\s*IST)?)?/i.exec(
      trimmed,
    );
  if (humanMatch) {
    const day = Number(humanMatch[1]);
    const month = MONTH_INDEX[humanMatch[2].toLowerCase()];
    const year = Number(humanMatch[3]);
    if (month !== undefined && year >= 1990 && day >= 1 && day <= 31) {
      let hours = 12;
      let minutes = 0;
      if (humanMatch[4] !== undefined && humanMatch[5] !== undefined) {
        hours = Number(humanMatch[4]);
        minutes = Number(humanMatch[5]);
        const meridiem = humanMatch[6]?.toUpperCase();
        if (meridiem === 'PM' && hours < 12) hours += 12;
        if (meridiem === 'AM' && hours === 12) hours = 0;
      }
      return Date.UTC(year, month, day, hours, minutes, 0) - IST_OFFSET_MS;
    }
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPublishedDateLabel(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function toIstIsoDateInput(ms: number | null | undefined, fallbackLabel?: string): string {
  const resolved = typeof ms === 'number' && Number.isFinite(ms)
    ? ms
    : parseLegacyPublishedDateMs(fallbackLabel);
  if (resolved === null) return '';
  const ist = new Date(resolved + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Serializes structured sections back to editable markdown-style "## Heading" + double-newline
 * paragraphs so historical articles keep their section structure cleanly through edits.
 */
export function serializeSectionsToBody(sections: ArticleSection[] | undefined): string {
  if (!sections || sections.length === 0) return '';
  return sections
    .map((sec) => {
      const heading = sec.heading?.trim();
      const body = (sec.paragraphs ?? []).map((p) => p.trim()).filter(Boolean).join('\n\n');
      if (!body && !heading) return '';
      if (heading && heading !== 'Editorial Dispatch' && heading !== 'संपादकीय रिपोर्ट') {
        return `## ${heading}\n\n${body}`;
      }
      return body;
    })
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 24_800);
}

/**
 * Parses an article body string (with optional "## Heading" lines) back into structured ArticleSection[].
 * Fully backward-compatible with plain double-newline separated paragraphs.
 */
export function parseBodyToSections(
  body: string | undefined,
  fallbackSummary: string,
  defaultHeading: string,
): ArticleSection[] {
  const clean = (body ?? '').trim();
  if (!clean) {
    return fallbackSummary.trim()
      ? [{ heading: defaultHeading, paragraphs: [fallbackSummary.trim()] }]
      : [];
  }

  const blocks = clean
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const sections: ArticleSection[] = [];
  let currentHeading = defaultHeading;
  let currentParagraphs: string[] = [];

  for (const block of blocks) {
    if (block.startsWith('## ')) {
      const nextHeading = block.slice(3).trim();
      if (currentParagraphs.length > 0) {
        sections.push({ heading: currentHeading, paragraphs: currentParagraphs });
        currentParagraphs = [];
      }
      if (nextHeading) {
        currentHeading = nextHeading;
      }
    } else {
      currentParagraphs.push(block);
    }
  }

  if (currentParagraphs.length > 0) {
    sections.push({ heading: currentHeading, paragraphs: currentParagraphs });
  }

  return sections.length > 0
    ? sections
    : fallbackSummary.trim()
      ? [{ heading: defaultHeading, paragraphs: [fallbackSummary.trim()] }]
      : [];
}

/**
 * Builds a clean Hindi article body for legacy static articles that have headlineHi + deckHi
 * without sectionsHi, allowing seamless bilingual editing while clearly tracking seeded provenance.
 */
export function buildSeededHindiBodyFromStatic(article: ArticleRecord): {
  hiBody: string;
  seededFromDeck: boolean;
} {
  const existingHi = serializeSectionsToBody(article.sectionsHi);
  if (existingHi.length >= 20) {
    return { hiBody: existingHi, seededFromDeck: false };
  }
  const deckHi = (article.deckHi ?? '').trim();
  const headlineHi = (article.headlineHi ?? '').trim();
  const sourceNote = (article.sourceNote ?? article.sourceName ?? '').trim();
  const composed = [
    deckHi || headlineHi,
    sourceNote ? `स्रोत संदर्भ: ${sourceNote}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
  return {
    hiBody: composed,
    seededFromDeck: true,
  };
}

/**
 * Evaluates whether a static article can be safely migrated straight to `Published`,
 * blocking auto-publication of `awaiting_verification` dispatches or incomplete EN/HI articles.
 */
export function evaluateStaticArticlePublishSafety(
  article: ArticleRecord,
  availableMediaIds?: ReadonlySet<string>,
): LegacyMigrationPublishSafety {
  const reasons: string[] = [];
  const awaitingVerification = article.verificationStatus === 'awaiting_verification';
  const enHeadlineOk = article.headline.trim().length >= 5;
  const enBody = serializeSectionsToBody(article.sections);
  const completeEn = enHeadlineOk && enBody.trim().length >= 20;

  const hiHeadlineOk = (article.headlineHi ?? '').trim().length >= 5;
  const { seededFromDeck } = buildSeededHindiBodyFromStatic(article);
  const completeHi = hiHeadlineOk && !seededFromDeck;

  const mediaId = (article.mediaId || article.media?.id || '').trim();
  const missingMedia = Boolean(
    mediaId &&
      availableMediaIds &&
      !availableMediaIds.has(mediaId) &&
      !article.media?.publicUrl,
  );

  if (awaitingVerification) {
    reasons.push('verificationStatus is awaiting_verification; coerced to Awaiting Verification instead of Published.');
  }
  if (!completeEn) {
    reasons.push('English headline or full English sections are incomplete (< 20 characters).');
  }
  if (!completeHi) {
    reasons.push('Full Hindi body (sectionsHi) is missing or only seeded from deckHi; requires bilingual review before Publishing.');
  }
  if (missingMedia) {
    reasons.push(`Referenced media asset "${mediaId}" was not found in static or Firestore media catalogs.`);
  }

  let resultingStatusIfPublished: EditorialWorkflowStatus = 'Published';
  if (awaitingVerification) {
    resultingStatusIfPublished = 'Awaiting Verification';
  } else if (!completeEn || !completeHi) {
    resultingStatusIfPublished = 'Draft';
  }

  return {
    canSafelyPublish: !awaitingVerification && completeEn && completeHi,
    awaitingVerification,
    completeEn,
    completeHi,
    missingMedia,
    resultingStatusIfPublished,
    reasons,
  };
}

export interface ConvertStaticArticleOptions {
  actorUid: string;
  targetStatus?: EditorialWorkflowStatus;
  durationPreset?: DurationPreset;
  customHours?: number;
  nowMs?: number;
}

/**
 * Converts a legacy static ArticleRecord from ARTICLES_CATALOG into a Firestore StoredArticleDoc
 * while strictly preserving original ID, slug, publication label, historical timestamps, verification status,
 * media references, and enforcing safe bilingual + verification gates against premature publishing.
 */
export function convertStaticArticleToStoredDoc(
  article: ArticleRecord,
  opts: ConvertStaticArticleOptions,
): StoredArticleDoc {
  const nowMs = opts.nowMs ?? Date.now();
  const requestedStatus: EditorialWorkflowStatus = opts.targetStatus ?? 'Draft';
  const safety = evaluateStaticArticlePublishSafety(article);
  const effectiveStatus: EditorialWorkflowStatus =
    requestedStatus === 'Published' && !safety.canSafelyPublish
      ? safety.resultingStatusIfPublished
      : requestedStatus;

  const parsedPublishedMs =
    typeof article.publishedAtMs === 'number' && Number.isFinite(article.publishedAtMs)
      ? article.publishedAtMs
      : parseLegacyPublishedDateMs(article.publishedAt) ?? nowMs;

  const durationPreset: DurationPreset = opts.durationPreset ?? article.durationPreset ?? '60d';
  const durationHours = resolveDurationHours(durationPreset, opts.customHours ?? article.durationHours ?? 1440);
  const expiresAtMs =
    effectiveStatus === 'Published'
      ? computeExpiresAtMs(nowMs, durationHours)
      : article.expiresAtMs ?? null;

  const enBody = serializeSectionsToBody(article.sections) || article.deck;
  const { hiBody } = buildSeededHindiBodyFromStatic(article);
  const enHeadline = article.headline.trim().slice(0, 260);
  const hiHeadline = (article.headlineHi ?? article.headline).trim().slice(0, 260);
  const enSummary = article.deck.trim().slice(0, 1200);
  const hiSummary = (article.deckHi ?? article.deck).trim().slice(0, 1200);

  const officialSources = (article.citations ?? [])
    .map((c) => c.url || c.portalName)
    .filter((s): s is string => Boolean(s && s.trim()))
    .slice(0, 8);

  return {
    id: article.id,
    title: enHeadline,
    slug: sanitizeArticleSlug(article.slug, article.id),
    summary: enSummary,
    body: enBody.slice(0, 25_000),
    enHeadline,
    enSummary,
    enBody: enBody.slice(0, 25_000),
    hiHeadline,
    hiSummary,
    hiBody: hiBody.slice(0, 25_000),
    category: article.category,
    tags: (article.tags ?? []).slice(0, 12),
    keywords: (article.keywords ?? []).slice(0, 20),
    entities: (article.entities ?? []).slice(0, 20),
    author: article.author || 'SakarBazaar Editorial Desk',
    status: effectiveStatus,
    verificationStatus: article.verificationStatus ?? 'awaiting_verification',
    sourceName: article.sourceName || article.sourceNote || '',
    sourceUrl: article.sourceUrl || '',
    officialSources,
    mediaId: article.mediaId || article.media?.id || '',
    youtubeUrl: article.media?.youtubeUrl || '',
    youtubeVideoId: article.media?.youtubeVideoId || '',
    youtubeTitle: article.media?.title || '',
    language: hiHeadline && enHeadline ? 'bilingual' : 'en',
    durationPreset,
    durationHours,
    publishedAt: article.publishedAt || formatPublishedDateLabel(parsedPublishedMs),
    publishedAtMs: parsedPublishedMs,
    expiresAtMs,
    retainedPrivate:
      effectiveStatus === 'Retained' || effectiveStatus === 'Archived' || effectiveStatus === 'Expired',
    featuredPlacement:
      article.featuredPlacement ?? (article.isFeatured ? 'main' : 'none'),
    featuredOrder: article.featuredPlacement === 'main' || article.isFeatured ? 0 : 99,
    isPaid: Boolean(article.isPaid),
    paidDisclosureLabel: article.isPaid
      ? article.paidDisclosureLabel || 'Partner Disclosure'
      : '',
    deletionStatus: 'none',
    createdByUid: opts.actorUid,
    updatedByUid: opts.actorUid,
  };
}

/**
 * Deterministic public article sort order: newest published timestamp descending,
 * with slug/id tie-breakers independent of Firestore query cursor ordering.
 */
export function sortPublicArticleRecords(articles: ArticleRecord[]): ArticleRecord[] {
  return [...articles].sort((a, b) => {
    const aMs =
      typeof a.publishedAtMs === 'number' && Number.isFinite(a.publishedAtMs)
        ? a.publishedAtMs
        : parseLegacyPublishedDateMs(a.publishedAt) ?? 0;
    const bMs =
      typeof b.publishedAtMs === 'number' && Number.isFinite(b.publishedAtMs)
        ? b.publishedAtMs
        : parseLegacyPublishedDateMs(b.publishedAt) ?? 0;
    if (bMs !== aMs) return bMs - aMs;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Combines Firestore articles with any static ARTICLES_CATALOG records that have not yet been migrated,
 * producing a single deduplicated Manage News inventory with clear origin & resolved dates.
 */
export function buildUnifiedManageNewsList(
  firestoreArticles: StoredArticleDoc[],
  staticArticles: ArticleRecord[],
): ManagedNewsItem[] {
  const staticById = new Map(staticArticles.map((s) => [s.id, s]));
  const staticBySlug = new Map(staticArticles.map((s) => [s.slug, s]));
  const firestoreIds = new Set(firestoreArticles.map((a) => a.id));
  const firestoreSlugs = new Set(firestoreArticles.map((a) => a.slug));

  const items: ManagedNewsItem[] = [];

  for (const art of firestoreArticles) {
    const pubMs =
      typeof art.publishedAtMs === 'number' && Number.isFinite(art.publishedAtMs)
        ? art.publishedAtMs
        : parseLegacyPublishedDateMs(art.publishedAt) ??
          extractTimestampMillis(art.createdAt) ??
          0;
    const updMs = extractTimestampMillis(art.updatedAt) ?? pubMs;
    items.push({
      doc: art,
      origin: 'firestore',
      isMigratedToFirestore: true,
      matchesLegacyCatalog: staticById.has(art.id) || staticBySlug.has(art.slug),
      publishedAtMsResolved: pubMs,
      updatedAtMsResolved: updMs,
    });
  }

  for (const base of staticArticles) {
    if (firestoreIds.has(base.id) || firestoreSlugs.has(base.slug)) {
      continue;
    }
    const synthesized = convertStaticArticleToStoredDoc(base, {
      actorUid: 'static_catalog',
      targetStatus: base.editorialStatus ?? 'Draft',
      durationPreset: '60d',
    });
    const pubMs =
      synthesized.publishedAtMs ??
      parseLegacyPublishedDateMs(base.publishedAt) ??
      0;
    items.push({
      doc: synthesized,
      origin: 'static',
      isMigratedToFirestore: false,
      matchesLegacyCatalog: true,
      publishedAtMsResolved: pubMs,
      updatedAtMsResolved: pubMs,
    });
  }

  return items.sort((a, b) => {
    const diff = b.publishedAtMsResolved - a.publishedAtMsResolved;
    if (diff !== 0) return diff;
    return b.updatedAtMsResolved - a.updatedAtMsResolved;
  });
}

export type ManageStatusFilter = 'live' | 'drafts' | 'historical' | 'all';
export type ManageOriginFilter = 'all' | 'firestore' | 'static';
export type ManageDateFilter = 'all' | 'last_7d' | 'last_30d' | 'older_30d' | 'exact_date';

export interface ManageNewsFilterCriteria {
  search: string;
  statusFilter: ManageStatusFilter;
  originFilter: ManageOriginFilter;
  categoryFilter: NewsCategory;
  dateFilter: ManageDateFilter;
  exactDate?: string;
  nowMs?: number;
}

export function filterHistoricalAndCurrentNews(
  items: ManagedNewsItem[],
  criteria: ManageNewsFilterCriteria,
): ManagedNewsItem[] {
  const nowMs = criteria.nowMs ?? Date.now();
  const q = criteria.search.trim().toLowerCase();
  const exact = (criteria.exactDate ?? '').trim();

  return items.filter((item) => {
    const art = item.doc;
    const lifecycle = classifyArticleLifecycle(art, nowMs);
    // All deletion-queue states (pending_approval, approved, in_progress, partial_failure) belong exclusively to Section 8
    if (lifecycle.inDeletionQueue || lifecycle.isDeleted) {
      return false;
    }

    if (criteria.originFilter !== 'all' && item.origin !== criteria.originFilter) {
      return false;
    }

    if (criteria.categoryFilter !== 'All' && art.category !== criteria.categoryFilter) {
      return false;
    }

    const visible =
      item.origin === 'static'
        ? art.status === 'Published' || art.status === 'Awaiting Verification'
        : lifecycle.isPublic;

    if (criteria.statusFilter === 'live' && !visible) return false;
    if (criteria.statusFilter === 'drafts' && !lifecycle.isDraftReview) {
      return false;
    }
    if (
      criteria.statusFilter === 'historical' &&
      !(lifecycle.isExpiredArchive || item.origin === 'static')
    ) {
      return false;
    }

    if (criteria.dateFilter !== 'all') {
      const refMs = item.publishedAtMsResolved || item.updatedAtMsResolved;
      if (criteria.dateFilter === 'last_7d' && (refMs <= 0 || nowMs - refMs > 7 * 24 * MS_PER_HOUR)) {
        return false;
      }
      if (criteria.dateFilter === 'last_30d' && (refMs <= 0 || nowMs - refMs > 30 * 24 * MS_PER_HOUR)) {
        return false;
      }
      if (criteria.dateFilter === 'older_30d' && (refMs > 0 && nowMs - refMs <= 30 * 24 * MS_PER_HOUR)) {
        return false;
      }
      if (criteria.dateFilter === 'exact_date' && exact) {
        const isoDate = toIstIsoDateInput(refMs, art.publishedAt);
        if (!isoDate.startsWith(exact)) {
          return false;
        }
      }
    }

    if (q) {
      const haystack = [
        art.id,
        art.slug,
        art.enHeadline,
        art.title,
        art.hiHeadline,
        art.enSummary,
        art.hiSummary,
        art.category,
        art.author,
        art.sourceName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

/**
 * Generates a dry-run migration preview explaining exactly which static articles & media
 * are ready to migrate, blocked from direct auto-publish, already migrated, or have a slug conflict.
 */
export function buildLegacyMigrationPreview(
  staticArticles: ArticleRecord[],
  staticMedia: MediaAssetRecord[],
  firestoreArticles: StoredArticleDoc[],
  firestoreMedia: StoredMediaAssetDoc[],
): LegacyMigrationPreview {
  const firestoreIds = new Set(firestoreArticles.map((a) => a.id));
  const firestoreBySlug = new Map(firestoreArticles.map((a) => [a.slug, a]));
  const firestoreMediaIds = new Set(firestoreMedia.map((m) => m.id));
  const availableMediaIds = new Set<string>([
    ...staticMedia.map((m) => m.id),
    ...firestoreMedia.map((m) => m.id),
  ]);

  const items: LegacyMigrationItemPreview[] = [];
  let readyCount = 0;
  let blockedFromPublishCount = 0;
  let alreadyMigratedCount = 0;
  let conflictCount = 0;
  const neededMediaIds = new Set<string>();

  for (const base of staticArticles) {
    const parsedMs =
      parseLegacyPublishedDateMs(base.publishedAt) ??
      Date.now();
    const { seededFromDeck } = buildSeededHindiBodyFromStatic(base);
    const mediaId = base.mediaId || base.media?.id;
    const bySlug = firestoreBySlug.get(base.slug);
    const publishSafety = evaluateStaticArticlePublishSafety(base, availableMediaIds);

    if (firestoreIds.has(base.id)) {
      alreadyMigratedCount++;
      items.push({
        articleId: base.id,
        slug: base.slug,
        headline: base.headline,
        headlineHi: base.headlineHi || '',
        category: base.category,
        verificationStatus: base.verificationStatus,
        publishedAt: base.publishedAt,
        publishedAtMs: parsedMs,
        mediaId,
        hindiBodySeededFromDeck: seededFromDeck,
        publishSafety,
        action: 'already_in_firestore',
        reason: `Already present in Firestore (/articles/${base.id}). Will not duplicate.`,
      });
    } else if (bySlug && bySlug.id !== base.id) {
      conflictCount++;
      items.push({
        articleId: base.id,
        slug: base.slug,
        headline: base.headline,
        headlineHi: base.headlineHi || '',
        category: base.category,
        verificationStatus: base.verificationStatus,
        publishedAt: base.publishedAt,
        publishedAtMs: parsedMs,
        mediaId,
        hindiBodySeededFromDeck: seededFromDeck,
        publishSafety,
        action: 'slug_conflict',
        reason: `Slug "${base.slug}" is already used by Firestore article ${bySlug.id}.`,
      });
    } else {
      readyCount++;
      if (!publishSafety.canSafelyPublish) {
        blockedFromPublishCount++;
      }
      if (mediaId) neededMediaIds.add(mediaId);
      const reason = publishSafety.canSafelyPublish
        ? 'Ready to migrate cleanly with verified status, full EN/HI sections, and historical metadata preserved.'
        : `Safe migration active: if "Published" is requested, it will be saved as "${publishSafety.resultingStatusIfPublished}" (${publishSafety.reasons.join(' ')}).`;
      items.push({
        articleId: base.id,
        slug: base.slug,
        headline: base.headline,
        headlineHi: base.headlineHi || '',
        category: base.category,
        verificationStatus: base.verificationStatus,
        publishedAt: base.publishedAt,
        publishedAtMs: parsedMs,
        mediaId,
        hindiBodySeededFromDeck: seededFromDeck,
        publishSafety,
        action: 'migrate',
        reason,
      });
    }
  }

  const mediaAssetsToRegister = staticMedia
    .filter((m) => neededMediaIds.has(m.id) || m.mediaType.startsWith('video/') || m.mediaType.startsWith('image/'))
    .map((m) => ({
      id: m.id,
      fileName: m.fileName,
      mediaType: m.mediaType,
      alreadyRegistered: firestoreMediaIds.has(m.id),
    }));

  return {
    totalStaticArticles: staticArticles.length,
    readyCount,
    blockedFromPublishCount,
    alreadyMigratedCount,
    conflictCount,
    mediaAssetsToRegister,
    items,
  };
}

/**
 * Computes the canonical /publicCatalog/legacyOverrides state so that any legacy static article
 * which has been unpublished, archived, expired, or permanently deleted in Firestore stays hidden
 * on the public website and never resurrects from static fallback arrays.
 */
export function computeLegacyOverridesState(params: {
  firestoreArticles: StoredArticleDoc[];
  staticArticles: ArticleRecord[];
  currentOverrides?: LegacyOverridesRecord | null;
  extraSuppressedIds?: string[];
  extraSuppressedSlugs?: string[];
  nowMs?: number;
}): { suppressedArticleIds: string[]; suppressedSlugs: string[] } {
  const nowMs = params.nowMs ?? Date.now();
  const suppressedIds = new Set<string>(params.currentOverrides?.suppressedArticleIds ?? []);
  const suppressedSlugs = new Set<string>(params.currentOverrides?.suppressedSlugs ?? []);

  for (const id of params.extraSuppressedIds ?? []) {
    if (id.trim()) suppressedIds.add(id.trim());
  }
  for (const slug of params.extraSuppressedSlugs ?? []) {
    if (slug.trim()) suppressedSlugs.add(slug.trim());
  }

  const byId = new Map(params.firestoreArticles.map((a) => [a.id, a]));
  const bySlug = new Map(params.firestoreArticles.map((a) => [a.slug, a]));

  for (const base of params.staticArticles) {
    const match = byId.get(base.id) ?? bySlug.get(base.slug);
    if (!match) {
      // No Firestore record exists: keep suppressed ONLY if previously/explicitly deleted
      continue;
    }
    const isLive = isArticlePubliclyVisible(match, nowMs);
    if (isLive) {
      // Currently live in Firestore: clear suppression so Firestore article serves publicly without static duplicate
      suppressedIds.delete(base.id);
      suppressedIds.delete(match.id);
      suppressedSlugs.delete(base.slug);
      suppressedSlugs.delete(match.slug);
    } else {
      // Draft / Retained / Expired / Archived / Pending Deletion in Firestore: suppress static fallback!
      suppressedIds.add(base.id);
      suppressedIds.add(match.id);
      suppressedSlugs.add(base.slug);
      suppressedSlugs.add(match.slug);
    }
  }

  return {
    suppressedArticleIds: [...suppressedIds].slice(0, 200),
    suppressedSlugs: [...suppressedSlugs].slice(0, 200),
  };
}

/**
 * Merges live Firestore articles with unmigrated & unsuppressed static ARTICLES_CATALOG entries,
 * enforcing strict deduplication by both ID and slug and immediate public reflection of
 * unpublish/archive/expiration/deletion overrides.
 */
export function filterPublicArticlesWithOverrides(
  publishedRemoteArticles: ArticleRecord[],
  staticArticles: ArticleRecord[],
  legacyOverrides: LegacyOverridesRecord | null | undefined,
  nowMs: number = Date.now(),
): ArticleRecord[] {
  const suppressedIds = new Set(legacyOverrides?.suppressedArticleIds ?? []);
  const suppressedSlugs = new Set(legacyOverrides?.suppressedSlugs ?? []);
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const combined: ArticleRecord[] = [];

  for (const remote of publishedRemoteArticles) {
    if (!isArticlePubliclyVisible(remote, nowMs)) continue;
    if (seenIds.has(remote.id) || seenSlugs.has(remote.slug)) continue;
    seenIds.add(remote.id);
    seenSlugs.add(remote.slug);
    combined.push(remote);
  }

  for (const base of staticArticles) {
    if (!isArticlePubliclyVisible(base, nowMs)) continue;
    if (suppressedIds.has(base.id) || suppressedSlugs.has(base.slug)) continue;
    if (seenIds.has(base.id) || seenSlugs.has(base.slug)) continue;
    seenIds.add(base.id);
    seenSlugs.add(base.slug);
    combined.push(base);
  }

  return combined;
}

export interface LegacyOverridesReadResolution {
  overrides: LegacyOverridesRecord | null;
  nextCacheToPersist?: LegacyOverridesRecord;
  ok: boolean;
  readPermitted: boolean;
  source:
    | 'server'
    | 'missing_doc_cache'
    | 'missing_doc_empty'
    | 'permission_denied_cache'
    | 'error_cache';
  errorMessage: string | null;
}

/**
 * Resolves authoritative Firestore legacyOverrides vs browser localStorage fallback:
 * - Authoritative server doc replaces stale localStorage cache completely.
 * - Missing override doc preserves existing localStorage cache rather than wiping suppressions.
 * - Permission denied / transient read failures keep existing cache without failing public homepage render.
 */
export function resolveLegacyOverridesReadResult(params: {
  serverExists: boolean;
  serverData?: Partial<LegacyOverridesRecord> | null;
  cached: LegacyOverridesRecord | null;
  error?: unknown;
  isPermissionDenied?: boolean;
}): LegacyOverridesReadResolution {
  if (params.error !== undefined && params.error !== null) {
    if (params.isPermissionDenied) {
      return {
        overrides: params.cached,
        ok: false,
        readPermitted: false,
        source: 'permission_denied_cache',
        errorMessage:
          'Public suppression metadata (/publicCatalog/legacyOverrides) returned PERMISSION_DENIED under deployed Firestore rules. Deploy updated public read-only override policy before public launch so archived/deleted static articles cannot reappear on fresh browsers.',
      };
    }
    return {
      overrides: params.cached,
      ok: false,
      readPermitted: true,
      source: 'error_cache',
      errorMessage: 'Public catalog override controls could not be synced cleanly.',
    };
  }

  if (!params.serverExists || !params.serverData) {
    return {
      overrides: params.cached,
      ok: true,
      readPermitted: true,
      source: params.cached ? 'missing_doc_cache' : 'missing_doc_empty',
      errorMessage: null,
    };
  }

  const raw = params.serverData;
  const normalized: LegacyOverridesRecord = {
    suppressedArticleIds: Array.isArray(raw.suppressedArticleIds)
      ? raw.suppressedArticleIds.filter((s): s is string => typeof s === 'string')
      : [],
    suppressedSlugs: Array.isArray(raw.suppressedSlugs)
      ? raw.suppressedSlugs.filter((s): s is string => typeof s === 'string')
      : [],
    updatedByUid: typeof raw.updatedByUid === 'string' ? raw.updatedByUid : undefined,
    updatedAt: raw.updatedAt,
  };

  return {
    overrides: normalized,
    nextCacheToPersist: normalized,
    ok: true,
    readPermitted: true,
    source: 'server',
    errorMessage: null,
  };
}
