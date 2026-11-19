import type {
  AdminRole,
  ArticleLifecycleClassification,
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

export interface ArticleLifecycleInput {
  status?: EditorialWorkflowStatus;
  editorialStatus?: EditorialWorkflowStatus;
  expiresAtMs?: number | null;
  deletionStatus?: DeletionStatus;
}

/**
 * Authoritative single-source lifecycle & deletion precedence matrix used across
 * public selectors, dashboard KPIs, Manage News, Expired/Archive, News Desk edit locks,
 * and Pending Deletion workflows.
 *
 * Precedence (highest -> lowest):
 * 1. deleted                  (status == Deleted OR deletionStatus == deleted)
 * 2. deletion_in_progress     (status == Deletion In Progress OR deletionStatus == in_progress)
 * 3. deletion_partial_failure (deletionStatus == partial_failure)
 * 4. deletion_approved        (deletionStatus == approved)
 * 5. deletion_pending_approval(deletionStatus == pending_approval OR status/editorialStatus == Pending Deletion)
 * 6. expired_private          (Expired/Retained/Archived OR Published with elapsed expiresAtMs <= nowMs)
 * 7. published_live           (Published with active or unscheduled expiry)
 * 8. draft_review             (Draft / Awaiting Verification / Verified / unknown)
 */
export function classifyArticleLifecycle(
  article: ArticleLifecycleInput,
  nowMs: number = Date.now(),
): ArticleLifecycleClassification {
  const effectiveStatus = article.status ?? article.editorialStatus;
  const del = article.deletionStatus;

  if (effectiveStatus === 'Deleted' || del === 'deleted') {
    return {
      stage: 'deleted',
      precedenceRank: 1,
      statusLabel: 'Deleted',
      isDeleted: true,
      inDeletionQueue: false,
      isPublic: false,
      isExpiredArchive: false,
      isDraftReview: false,
      canEdit: false,
      canRequestDeletion: false,
      canApproveDeletion: false,
      canExecuteDeletion: false,
      canRetryDeletion: false,
      canCancelDeletion: false,
    };
  }

  if (effectiveStatus === 'Deletion In Progress' || del === 'in_progress') {
    return {
      stage: 'deletion_in_progress',
      precedenceRank: 2,
      statusLabel: 'Deletion In Progress',
      isDeleted: false,
      inDeletionQueue: true,
      isPublic: false,
      isExpiredArchive: false,
      isDraftReview: false,
      canEdit: false,
      canRequestDeletion: false,
      canApproveDeletion: false,
      canExecuteDeletion: true,
      canRetryDeletion: true,
      canCancelDeletion: false,
    };
  }

  if (del === 'partial_failure') {
    return {
      stage: 'deletion_partial_failure',
      precedenceRank: 3,
      statusLabel: 'Partial Deletion Failure',
      isDeleted: false,
      inDeletionQueue: true,
      isPublic: false,
      isExpiredArchive: false,
      isDraftReview: false,
      canEdit: false,
      canRequestDeletion: false,
      canApproveDeletion: false,
      canExecuteDeletion: true,
      canRetryDeletion: true,
      canCancelDeletion: true,
    };
  }

  if (del === 'approved') {
    return {
      stage: 'deletion_approved',
      precedenceRank: 4,
      statusLabel: 'Approved for Permanent Deletion',
      isDeleted: false,
      inDeletionQueue: true,
      isPublic: false,
      isExpiredArchive: false,
      isDraftReview: false,
      canEdit: false,
      canRequestDeletion: false,
      canApproveDeletion: false,
      canExecuteDeletion: true,
      canRetryDeletion: false,
      canCancelDeletion: true,
    };
  }

  if (del === 'pending_approval' || effectiveStatus === 'Pending Deletion') {
    return {
      stage: 'deletion_pending_approval',
      precedenceRank: 5,
      statusLabel: 'Pending Deletion Approval',
      isDeleted: false,
      inDeletionQueue: true,
      isPublic: false,
      isExpiredArchive: false,
      isDraftReview: false,
      canEdit: false,
      canRequestDeletion: false,
      canApproveDeletion: true,
      canExecuteDeletion: false,
      canRetryDeletion: false,
      canCancelDeletion: true,
    };
  }

  const hasFiniteExpiry =
    typeof article.expiresAtMs === 'number' && Number.isFinite(article.expiresAtMs);
  const elapsedExpired =
    effectiveStatus === 'Published' && hasFiniteExpiry && nowMs >= (article.expiresAtMs as number);

  if (
    effectiveStatus === 'Expired' ||
    effectiveStatus === 'Retained' ||
    effectiveStatus === 'Archived' ||
    elapsedExpired
  ) {
    return {
      stage: 'expired_private',
      precedenceRank: 6,
      statusLabel: elapsedExpired ? 'Expired' : (effectiveStatus ?? 'Expired'),
      isDeleted: false,
      inDeletionQueue: false,
      isPublic: false,
      isExpiredArchive: true,
      isDraftReview: false,
      canEdit: true,
      canRequestDeletion: true,
      canApproveDeletion: true,
      canExecuteDeletion: false,
      canRetryDeletion: false,
      canCancelDeletion: false,
    };
  }

  const staticAwaitingVisible =
    article.status === undefined && article.editorialStatus === 'Awaiting Verification';
  if (effectiveStatus === 'Published' || staticAwaitingVisible) {
    return {
      stage: 'published_live',
      precedenceRank: 7,
      statusLabel: effectiveStatus ?? 'Published',
      isDeleted: false,
      inDeletionQueue: false,
      isPublic: true,
      isExpiredArchive: false,
      isDraftReview: false,
      canEdit: true,
      canRequestDeletion: true,
      canApproveDeletion: true,
      canExecuteDeletion: false,
      canRetryDeletion: false,
      canCancelDeletion: false,
    };
  }

  return {
    stage: 'draft_review',
    precedenceRank: 8,
    statusLabel: effectiveStatus ?? 'Draft',
    isDeleted: false,
    inDeletionQueue: false,
    isPublic: false,
    isExpiredArchive: false,
    isDraftReview: true,
    canEdit: true,
    canRequestDeletion: true,
    canApproveDeletion: true,
    canExecuteDeletion: false,
    canRetryDeletion: false,
    canCancelDeletion: false,
  };
}

export function isArticleExpired(
  article: ArticleLifecycleInput,
  nowMs: number = Date.now(),
): boolean {
  const cls = classifyArticleLifecycle(article, nowMs);
  return cls.isExpiredArchive || cls.inDeletionQueue || cls.isDeleted;
}

export function isArticleExpiringSoon(
  article: ArticleLifecycleInput,
  nowMs: number = Date.now(),
  thresholdHours: number = DEFAULT_EXPIRING_SOON_HOURS,
): boolean {
  const cls = classifyArticleLifecycle(article, nowMs);
  if (cls.stage !== 'published_live' || article.status !== 'Published') return false;
  if (typeof article.expiresAtMs !== 'number' || !Number.isFinite(article.expiresAtMs)) return false;
  const remainingMs = article.expiresAtMs - nowMs;
  return remainingMs > 0 && remainingMs <= thresholdHours * MS_PER_HOUR;
}

export function isArticlePubliclyVisible(
  article: ArticleLifecycleInput,
  nowMs: number = Date.now(),
): boolean {
  return classifyArticleLifecycle(article, nowMs).isPublic;
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

export interface NewsComposerValidationInput extends BilingualArticleDraftInput {
  author: string;
  targetMode: 'draft' | 'minor_edit' | 'publish';
  mediaMode: 'none' | 'existing' | 'photo' | 'youtube';
  photoDataUrl?: string;
  mediaCredit?: string;
  usageRightsConfirmed?: boolean;
  youtubeInput?: string;
  hasValidYouTube?: boolean;
  selectedExistingMediaId?: string;
}

export interface NewsComposerValidationFields {
  author: boolean;
  enHeadline: boolean;
  enBody: boolean;
  hiHeadline: boolean;
  hiBody: boolean;
  sourceUrl: boolean;
  customHours: boolean;
  photoFile: boolean;
  mediaCredit: boolean;
  usageRightsConfirmed: boolean;
  youtubeUrl: boolean;
  existingMedia: boolean;
}

export interface NewsComposerValidationResult {
  valid: boolean;
  errors: string[];
  message: string | null;
  fields: NewsComposerValidationFields;
}

/**
 * Validates article text, optional source metadata, and media attachment requirements
 * together so the News Desk UI can display both an action-bar summary and exact
 * inline field-level highlights (including photo credit & usage-rights confirmation).
 */
export function validateNewsComposerInput(
  input: NewsComposerValidationInput,
): NewsComposerValidationResult {
  const fields: NewsComposerValidationFields = {
    author: false,
    enHeadline: false,
    enBody: false,
    hiHeadline: false,
    hiBody: false,
    sourceUrl: false,
    customHours: false,
    photoFile: false,
    mediaCredit: false,
    usageRightsConfirmed: false,
    youtubeUrl: false,
    existingMedia: false,
  };
  const errors: string[] = [];

  const authorLen = input.author.trim().length;
  if (authorLen < 2 || authorLen > 120) {
    fields.author = true;
    errors.push('Author / Byline must be between 2 and 120 characters.');
  }

  if (input.targetMode === 'publish') {
    const publishCheck = validateArticlePublishInput(input);
    if (!publishCheck.valid) {
      errors.push(...publishCheck.errors);
      if (input.enHeadline.trim().length < 5 || input.enHeadline.trim().length > ARTICLE_FIELD_LIMITS.headlineMax) {
        fields.enHeadline = true;
      }
      if (input.enBody.trim().length < 20 || input.enBody.trim().length > ARTICLE_FIELD_LIMITS.bodyMax) {
        fields.enBody = true;
      }
      if (input.hiHeadline.trim().length < 5 || input.hiHeadline.trim().length > ARTICLE_FIELD_LIMITS.headlineMax) {
        fields.hiHeadline = true;
      }
      if (input.hiBody.trim().length < 20 || input.hiBody.trim().length > ARTICLE_FIELD_LIMITS.bodyMax) {
        fields.hiBody = true;
      }
    }
  } else {
    const draftCheck = validateArticleDraftInput(input);
    if (!draftCheck.valid) {
      errors.push(...draftCheck.errors);
      if (input.enHeadline.trim().length < 3 && input.hiHeadline.trim().length < 3) {
        fields.enHeadline = true;
        fields.hiHeadline = true;
      }
    }
  }

  if (!isValidOptionalHttpUrl(input.sourceUrl)) {
    fields.sourceUrl = true;
  }
  if (input.durationPreset === 'custom') {
    const hours = Number(input.customHours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 43800) {
      fields.customHours = true;
    }
  }

  if (input.mediaMode === 'photo') {
    const hasPhoto = Boolean((input.photoDataUrl ?? '').trim());
    const hasCredit = Boolean((input.mediaCredit ?? '').trim());
    const hasRights = Boolean(input.usageRightsConfirmed);
    if (!hasPhoto) {
      fields.photoFile = true;
      errors.push(
        'Select a photograph file to upload, or switch media mode to Reuse Media Library / No Media.',
      );
    }
    if (!hasCredit) {
      fields.mediaCredit = true;
      errors.push(
        'Photographer / Source Credit is required before saving or republishing an uploaded photograph.',
      );
    }
    if (!hasRights) {
      fields.usageRightsConfirmed = true;
      errors.push(
        'Please confirm legal usage rights ("I confirm legal usage rights for this photograph") before saving or republishing.',
      );
    }
  } else if (input.mediaMode === 'youtube') {
    if (!(input.youtubeInput ?? '').trim() || !input.hasValidYouTube) {
      fields.youtubeUrl = true;
      errors.push('Enter a valid YouTube video URL or 11-character YouTube video ID.');
    }
  } else if (input.mediaMode === 'existing') {
    if (!(input.selectedExistingMediaId ?? '').trim()) {
      fields.existingMedia = true;
      errors.push('Select an existing asset from the Media Library or switch media mode to No Media.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    message: errors.length > 0 ? errors.join(' ') : null,
    fields,
  };
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

export function evaluateDeletionRequest(
  role: AdminRole,
  currentArticle?: ArticleLifecycleInput,
): DeletionWorkflowTransition {
  if (role !== 'owner' && role !== 'publisher') {
    return {
      allowed: false,
      reason: 'Only an authorized Owner or Publisher may request article deletion.',
      nextStatus: currentArticle?.status ?? 'Retained',
      nextDeletionStatus: currentArticle?.deletionStatus ?? 'none',
    };
  }
  if (currentArticle) {
    const cls = classifyArticleLifecycle(currentArticle);
    if (cls.stage === 'deletion_in_progress' || cls.isDeleted) {
      return {
        allowed: false,
        reason: 'Article is already deleted or deletion is currently executing.',
        nextStatus: currentArticle.status ?? 'Deletion In Progress',
        nextDeletionStatus: currentArticle.deletionStatus ?? 'in_progress',
      };
    }
    if (cls.stage === 'deletion_approved') {
      return {
        allowed: true,
        nextStatus: 'Pending Deletion',
        nextDeletionStatus: 'approved',
      };
    }
  }
  return {
    allowed: true,
    nextStatus: 'Pending Deletion',
    nextDeletionStatus: 'pending_approval',
  };
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
  if (currentDeletionStatus === 'in_progress' || currentDeletionStatus === 'deleted') {
    return {
      allowed: false,
      reason: 'Permanent deletion is already running or completed.',
      nextStatus: currentDeletionStatus === 'deleted' ? 'Deleted' : 'Deletion In Progress',
      nextDeletionStatus: currentDeletionStatus,
    };
  }
  return {
    allowed: true,
    nextStatus: 'Pending Deletion',
    nextDeletionStatus: 'approved',
  };
}

export function evaluateDeletionCancellation(
  role: AdminRole,
  currentArticle: ArticleLifecycleInput,
): DeletionWorkflowTransition {
  if (role !== 'owner' && role !== 'publisher') {
    return {
      allowed: false,
      reason: 'Only an authorized Owner or Publisher may cancel a deletion request.',
      nextStatus: currentArticle.status ?? 'Pending Deletion',
      nextDeletionStatus: currentArticle.deletionStatus ?? 'none',
    };
  }
  const cls = classifyArticleLifecycle(currentArticle);
  if (!cls.canCancelDeletion) {
    return {
      allowed: false,
      reason:
        cls.stage === 'deletion_in_progress'
          ? 'Deletion is actively executing and cannot be cancelled mid-flight.'
          : 'Article is not in a cancellable deletion queue state.',
      nextStatus: currentArticle.status ?? 'Retained',
      nextDeletionStatus: currentArticle.deletionStatus ?? 'none',
    };
  }
  return {
    allowed: true,
    nextStatus: 'Retained',
    nextDeletionStatus: 'none',
  };
}

export function isArticleInDeletionQueue(article: ArticleLifecycleInput): boolean {
  return classifyArticleLifecycle(article).inDeletionQueue;
}

export function isArticlePermanentlyDeleted(article: ArticleLifecycleInput): boolean {
  return classifyArticleLifecycle(article).isDeleted;
}

export function isDeletionQueueEditLocked(article: ArticleLifecycleInput): boolean {
  const cls = classifyArticleLifecycle(article);
  return cls.inDeletionQueue || cls.isDeleted;
}

export function canRetryPermanentDeletion(
  article: ArticleLifecycleInput,
  role: AdminRole,
): boolean {
  if (role !== 'owner' && role !== 'publisher') return false;
  return classifyArticleLifecycle(article).canExecuteDeletion;
}

export function shouldAllowAbandonedDeletionRecovery(
  updatedAtMs: number | null,
  nowMs: number = Date.now(),
  staleThresholdMs: number = 90_000,
): boolean {
  if (updatedAtMs === null || !Number.isFinite(updatedAtMs)) return true;
  return nowMs - updatedAtMs >= staleThresholdMs;
}

export function extractReadableErrorMessage(err: unknown, fallback: string = 'Operation failed.'): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (!raw.trim()) return fallback;
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown; path?: unknown; operationType?: unknown };
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        const hasPath = typeof parsed.path === 'string' && parsed.path.trim();
        const hasOp = typeof parsed.operationType === 'string' && parsed.operationType.trim();
        const pathLabel = hasPath
          ? hasOp
            ? ` [${parsed.operationType} on ${parsed.path}]`
            : ` (${parsed.path})`
          : '';
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


