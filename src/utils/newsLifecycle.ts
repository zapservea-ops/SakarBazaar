import type {
  AdminRole,
  ArticleRecord,
  DeletionStatus,
  DurationPreset,
  EditorialWorkflowStatus,
  FeaturedPlacement,
  StoredArticleDoc,
} from '../types/sakarbazaar';

export const DURATION_PRESET_HOURS: Record<Exclude<DurationPreset, 'custom'>, number> = {
  '7d': 7 * 24,
  '15d': 15 * 24,
  '30d': 30 * 24,
  '60d': 60 * 24,
};

export const MS_PER_HOUR = 3_600_000;
export const DEFAULT_EXPIRING_SOON_HOURS = 48;

export function resolveDurationHours(
  preset: DurationPreset,
  customHours?: number | null,
): number {
  if (preset !== 'custom') {
    return DURATION_PRESET_HOURS[preset];
  }
  const parsed = Number(customHours);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 24;
  }
  return Math.min(43_800, Math.round(parsed));
}

/**
 * Computes exact elapsed-hour expiry timestamp in milliseconds.
 * Never uses calendar-day rounding.
 */
export function computeExpiresAtMs(publishedAtMs: number, durationHours: number): number {
  const safeHours = Math.max(1, Math.round(durationHours));
  return publishedAtMs + safeHours * MS_PER_HOUR;
}

export function extendDurationFromNowOrExpiry(
  currentExpiresAtMs: number | null | undefined,
  additionalHours: number,
  nowMs: number,
): number {
  const safeAdd = Math.max(1, Math.round(additionalHours)) * MS_PER_HOUR;
  const base =
    typeof currentExpiresAtMs === 'number' && Number.isFinite(currentExpiresAtMs) && currentExpiresAtMs > nowMs
      ? currentExpiresAtMs
      : nowMs;
  return base + safeAdd;
}

export function isArticleExpired(
  article: {
    status?: EditorialWorkflowStatus;
    expiresAtMs?: number | null;
    deletionStatus?: DeletionStatus;
  },
  nowMs: number = Date.now(),
): boolean {
  if (
    article.status === 'Expired' ||
    article.status === 'Retained' ||
    article.status === 'Pending Deletion' ||
    article.status === 'Deletion In Progress' ||
    article.status === 'Deleted' ||
    article.status === 'Archived'
  ) {
    return true;
  }
  if (article.deletionStatus && article.deletionStatus !== 'none') {
    return true;
  }
  if (
    article.status === 'Published' &&
    typeof article.expiresAtMs === 'number' &&
    Number.isFinite(article.expiresAtMs) &&
    nowMs >= article.expiresAtMs
  ) {
    return true;
  }
  return false;
}

export function isArticleExpiringSoon(
  article: {
    status?: EditorialWorkflowStatus;
    expiresAtMs?: number | null;
    deletionStatus?: DeletionStatus;
  },
  nowMs: number = Date.now(),
  thresholdHours: number = DEFAULT_EXPIRING_SOON_HOURS,
): boolean {
  if (article.status !== 'Published') return false;
  if (article.deletionStatus && article.deletionStatus !== 'none') return false;
  if (typeof article.expiresAtMs !== 'number' || !Number.isFinite(article.expiresAtMs)) return false;
  const remainingMs = article.expiresAtMs - nowMs;
  return remainingMs > 0 && remainingMs <= thresholdHours * MS_PER_HOUR;
}

export function isArticlePubliclyVisible(
  article: {
    status?: EditorialWorkflowStatus;
    editorialStatus?: EditorialWorkflowStatus;
    expiresAtMs?: number | null;
    deletionStatus?: DeletionStatus;
  },
  nowMs: number = Date.now(),
): boolean {
  if (article.status !== undefined) {
    if (article.status !== 'Published') return false;
  } else if (article.editorialStatus !== undefined) {
    if (
      article.editorialStatus !== 'Published' &&
      article.editorialStatus !== 'Awaiting Verification'
    ) {
      return false;
    }
  } else {
    return false;
  }
  if (article.deletionStatus && article.deletionStatus !== 'none') return false;
  if (typeof article.expiresAtMs === 'number' && Number.isFinite(article.expiresAtMs)) {
    return article.expiresAtMs > nowMs;
  }
  return true;
}

export interface BilingualArticleDraftInput {
  enHeadline: string;
  enSummary?: string;
  enBody: string;
  hiHeadline: string;
  hiSummary?: string;
  hiBody: string;
  sourceName?: string;
  sourceUrl?: string;
  durationPreset: DurationPreset;
  customHours?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function isValidOptionalHttpUrl(rawUrl: string | undefined | null): boolean {
  const clean = (rawUrl ?? '').trim();
  if (!clean) return true;
  try {
    const parsed = new URL(clean);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const ARTICLE_FIELD_LIMITS = {
  headlineMax: 260,
  summaryMax: 1200,
  bodyMax: 25000,
  sourceNameMax: 160,
  sourceUrlMax: 500,
} as const;

export function sanitizeArticleSlug(rawTitle: string, fallbackPrefix: string = 'dispatch'): string {
  const ascii = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 140);
  if (ascii.length >= 3) {
    return ascii;
  }
  const safePrefix = fallbackPrefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'dispatch';
  return `${safePrefix}-${Date.now().toString(36)}`.slice(0, 140);
}

/**
 * Drafts may be incomplete (either EN or HI headline >= 3 chars).
 * Source name and source URL are strictly optional.
 */
export function validateArticleDraftInput(input: BilingualArticleDraftInput): ValidationResult {
  const errors: string[] = [];
  const hasEn = input.enHeadline.trim().length >= 3;
  const hasHi = input.hiHeadline.trim().length >= 3;

  if (!hasEn && !hasHi) {
    errors.push('Enter at least an English or Hindi working headline (3+ characters) to save a draft.');
  }
  if (input.enHeadline.trim().length > ARTICLE_FIELD_LIMITS.headlineMax) {
    errors.push(`English headline cannot exceed ${ARTICLE_FIELD_LIMITS.headlineMax} characters.`);
  }
  if (input.hiHeadline.trim().length > ARTICLE_FIELD_LIMITS.headlineMax) {
    errors.push(`Hindi headline cannot exceed ${ARTICLE_FIELD_LIMITS.headlineMax} characters.`);
  }
  if ((input.enSummary ?? '').trim().length > ARTICLE_FIELD_LIMITS.summaryMax) {
    errors.push(`English summary cannot exceed ${ARTICLE_FIELD_LIMITS.summaryMax} characters.`);
  }
  if ((input.hiSummary ?? '').trim().length > ARTICLE_FIELD_LIMITS.summaryMax) {
    errors.push(`Hindi summary cannot exceed ${ARTICLE_FIELD_LIMITS.summaryMax} characters.`);
  }
  if (input.enBody.trim().length > ARTICLE_FIELD_LIMITS.bodyMax) {
    errors.push(`English body cannot exceed ${ARTICLE_FIELD_LIMITS.bodyMax} characters.`);
  }
  if (input.hiBody.trim().length > ARTICLE_FIELD_LIMITS.bodyMax) {
    errors.push(`Hindi body cannot exceed ${ARTICLE_FIELD_LIMITS.bodyMax} characters.`);
  }
  if ((input.sourceName ?? '').trim().length > ARTICLE_FIELD_LIMITS.sourceNameMax) {
    errors.push(`News Source Name cannot exceed ${ARTICLE_FIELD_LIMITS.sourceNameMax} characters.`);
  }
  if ((input.sourceUrl ?? '').trim().length > ARTICLE_FIELD_LIMITS.sourceUrlMax) {
    errors.push(`News Source URL cannot exceed ${ARTICLE_FIELD_LIMITS.sourceUrlMax} characters.`);
  }
  if (!isValidOptionalHttpUrl(input.sourceUrl)) {
    errors.push('Optional Source URL must begin with http:// or https:// when provided.');
  }
  if (input.durationPreset === 'custom') {
    const hours = Number(input.customHours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 43800) {
      errors.push('Custom duration must be between 1 and 43,800 hours.');
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Publishing requires BOTH English and Hindi headline + article body inside the single shared record.
 * Source name and source URL remain strictly optional and never block publishing.
 */
export function validateArticlePublishInput(input: BilingualArticleDraftInput): ValidationResult {
  const errors: string[] = [];
  if (input.enHeadline.trim().length < 5) {
    errors.push('English headline (5+ characters) is required before publishing.');
  } else if (input.enHeadline.trim().length > ARTICLE_FIELD_LIMITS.headlineMax) {
    errors.push(`English headline cannot exceed ${ARTICLE_FIELD_LIMITS.headlineMax} characters.`);
  }
  if ((input.enSummary ?? '').trim().length > ARTICLE_FIELD_LIMITS.summaryMax) {
    errors.push(`English summary cannot exceed ${ARTICLE_FIELD_LIMITS.summaryMax} characters.`);
  }
  if (input.enBody.trim().length < 20) {
    errors.push('English article body (20+ characters) is required before publishing.');
  } else if (input.enBody.trim().length > ARTICLE_FIELD_LIMITS.bodyMax) {
    errors.push(`English body cannot exceed ${ARTICLE_FIELD_LIMITS.bodyMax} characters.`);
  }
  if (input.hiHeadline.trim().length < 5) {
    errors.push('Hindi headline (5+ characters) is required before publishing.');
  } else if (input.hiHeadline.trim().length > ARTICLE_FIELD_LIMITS.headlineMax) {
    errors.push(`Hindi headline cannot exceed ${ARTICLE_FIELD_LIMITS.headlineMax} characters.`);
  }
  if ((input.hiSummary ?? '').trim().length > ARTICLE_FIELD_LIMITS.summaryMax) {
    errors.push(`Hindi summary cannot exceed ${ARTICLE_FIELD_LIMITS.summaryMax} characters.`);
  }
  if (input.hiBody.trim().length < 20) {
    errors.push('Hindi article body (20+ characters) is required before publishing.');
  } else if (input.hiBody.trim().length > ARTICLE_FIELD_LIMITS.bodyMax) {
    errors.push(`Hindi body cannot exceed ${ARTICLE_FIELD_LIMITS.bodyMax} characters.`);
  }
  if ((input.sourceName ?? '').trim().length > ARTICLE_FIELD_LIMITS.sourceNameMax) {
    errors.push(`News Source Name cannot exceed ${ARTICLE_FIELD_LIMITS.sourceNameMax} characters.`);
  }
  if ((input.sourceUrl ?? '').trim().length > ARTICLE_FIELD_LIMITS.sourceUrlMax) {
    errors.push(`News Source URL cannot exceed ${ARTICLE_FIELD_LIMITS.sourceUrlMax} characters.`);
  }
  if (!isValidOptionalHttpUrl(input.sourceUrl)) {
    errors.push('Optional Source URL must begin with http:// or https:// when provided.');
  }
  if (input.durationPreset === 'custom') {
    const hours = Number(input.customHours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 43800) {
      errors.push('Custom duration must be between 1 and 43,800 hours.');
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Applies a minor edit to an article WITHOUT resetting publishedAtMs or expiresAtMs.
 */
export function applyMinorEditPreservingExpiry<T extends Pick<StoredArticleDoc, 'publishedAtMs' | 'expiresAtMs' | 'publishedAt' | 'durationHours' | 'durationPreset'>>(
  existing: T,
  updates: Partial<T>,
): T {
  return {
    ...existing,
    ...updates,
    publishedAt: existing.publishedAt,
    publishedAtMs: existing.publishedAtMs,
    expiresAtMs: existing.expiresAtMs,
    durationHours: existing.durationHours,
    durationPreset: existing.durationPreset,
  };
}

export function formatRemainingDuration(
  expiresAtMs: number | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) {
    return 'No expiry scheduled';
  }
  const diffMs = expiresAtMs - nowMs;
  if (diffMs <= 0) {
    return 'Expired';
  }
  const totalHours = Math.floor(diffMs / MS_PER_HOUR);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) {
    return `${days}d ${hours}h left`;
  }
  const mins = Math.max(1, Math.floor((diffMs % MS_PER_HOUR) / 60_000));
  return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
}

/**
 * Manual featured selection helper: enforces at most 1 'main' story and 3 'secondary' stories.
 * Never depends on duration or paid status.
 */
export function applyManualFeaturedPlacement(
  articles: StoredArticleDoc[],
  targetId: string,
  placement: FeaturedPlacement,
  order: number = 1,
): Array<{ id: string; featuredPlacement: FeaturedPlacement; featuredOrder: number }> {
  const changes: Array<{ id: string; featuredPlacement: FeaturedPlacement; featuredOrder: number }> = [];

  if (placement === 'main') {
    for (const a of articles) {
      if (a.id !== targetId && a.featuredPlacement === 'main') {
        changes.push({ id: a.id, featuredPlacement: 'none', featuredOrder: 99 });
      }
    }
    changes.push({ id: targetId, featuredPlacement: 'main', featuredOrder: 0 });
    return changes;
  }

  if (placement === 'secondary') {
    const activeSecondary = articles
      .filter((a) => a.id !== targetId && a.featuredPlacement === 'secondary')
      .sort((a, b) => (a.featuredOrder ?? 99) - (b.featuredOrder ?? 99));

    if (activeSecondary.length >= 3) {
      for (const overflow of activeSecondary.slice(2)) {
        changes.push({ id: overflow.id, featuredPlacement: 'none', featuredOrder: 99 });
      }
    }
    changes.push({
      id: targetId,
      featuredPlacement: 'secondary',
      featuredOrder: Math.max(1, Math.min(3, order)),
    });
    return changes;
  }

  changes.push({ id: targetId, featuredPlacement: 'none', featuredOrder: 99 });
  return changes;
}

export function selectHomepageFeaturedArticles(
  articles: ArticleRecord[],
): {
  mainStory: ArticleRecord | undefined;
  secondaryStories: ArticleRecord[];
} {
  const active = articles.filter((a) => isArticlePubliclyVisible(a));
  const explicitMain = active.find((a) => a.featuredPlacement === 'main');
  const mainStory = explicitMain ?? active[0];

  const explicitSecondary = active
    .filter((a) => a.id !== mainStory?.id && a.featuredPlacement === 'secondary')
    .sort((a, b) => (a.featuredOrder ?? 99) - (b.featuredOrder ?? 99));

  const filledSecondary = [...explicitSecondary];
  for (const candidate of active) {
    if (filledSecondary.length >= 3) break;
    if (candidate.id !== mainStory?.id && !filledSecondary.some((s) => s.id === candidate.id)) {
      filledSecondary.push(candidate);
    }
  }

  return {
    mainStory,
    secondaryStories: filledSecondary.slice(0, 3),
  };
}

export interface DeletionWorkflowTransition {
  allowed: boolean;
  reason?: string;
  nextStatus: EditorialWorkflowStatus;
  nextDeletionStatus: DeletionStatus;
}

export function evaluateDeletionApproval(
  role: AdminRole,
  currentDeletionStatus?: DeletionStatus,
): DeletionWorkflowTransition {
  if (role !== 'owner' && role !== 'publisher') {
    return {
      allowed: false,
      reason: 'Only an authorized Owner or Publisher may approve permanent deletion.',
      nextStatus: 'Pending Deletion',
      nextDeletionStatus: currentDeletionStatus ?? 'none',
    };
  }
  return {
    allowed: true,
    nextStatus: 'Pending Deletion',
    nextDeletionStatus: 'approved',
  };
}

export function canRetryPermanentDeletion(
  article: { status?: EditorialWorkflowStatus; deletionStatus?: DeletionStatus },
  role: AdminRole,
): boolean {
  if (role !== 'owner' && role !== 'publisher') return false;
  return (
    article.deletionStatus === 'approved' ||
    article.deletionStatus === 'partial_failure' ||
    article.deletionStatus === 'in_progress' ||
    article.status === 'Pending Deletion' ||
    article.status === 'Deletion In Progress'
  );
}

export function extractReadableErrorMessage(err: unknown, fallback: string = 'Operation failed.'): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (!raw.trim()) return fallback;
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown; path?: unknown };
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        const pathLabel = typeof parsed.path === 'string' && parsed.path.trim() ? ` (${parsed.path})` : '';
        return `${parsed.error}${pathLabel}`;
      }
    } catch {
      // Fall back to raw message
    }
  }
  return raw;
}

export class ConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export function extractTimestampMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    const maybe = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof maybe.toMillis === 'function') {
      const ms = maybe.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof maybe.seconds === 'number' && Number.isFinite(maybe.seconds)) {
      const nanoMs = typeof maybe.nanoseconds === 'number' ? Math.floor(maybe.nanoseconds / 1_000_000) : 0;
      return maybe.seconds * 1000 + nanoMs;
    }
  }
  return null;
}

/**
 * Throws ConflictError when an authoritative Firestore record has a newer timestamp
 * than the operator's loaded baseline (with a 1,000 ms clock tolerance for same-second serverTimestamp jitter).
 */
export function assertDocumentVersionUnchanged(params: {
  entityLabel: string;
  expectedUpdatedAtMs?: number | null;
  currentUpdatedAt: unknown;
  toleranceMs?: number;
}): void {
  const { entityLabel, expectedUpdatedAtMs, currentUpdatedAt, toleranceMs = 1_000 } = params;
  if (typeof expectedUpdatedAtMs !== 'number' || !Number.isFinite(expectedUpdatedAtMs) || expectedUpdatedAtMs <= 0) {
    return;
  }
  const latestMs = extractTimestampMillis(currentUpdatedAt);
  if (latestMs !== null && latestMs > expectedUpdatedAtMs + toleranceMs) {
    throw new ConflictError(
      `Conflict detected: This ${entityLabel} was modified by another editor or session after you opened it. Your form edits are preserved—please click Refresh Data to inspect the latest version before saving again.`,
    );
  }
}


