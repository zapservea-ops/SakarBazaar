/**
 * Pure policy evaluator mirroring firestore.rules for automated security testing
 * when JVM Firestore Emulator is unavailable in headless environments.
 */

export interface PolicyAuthContext {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  isBootstrappedOwner?: boolean;
  isAdminOwnerDoc?: boolean;
  isAdminPublisherDoc?: boolean;
  allowlistActive?: boolean;
  allowlistRole?: 'owner' | 'publisher';
}

export const BOOTSTRAPPED_OWNER_EMAIL = 'jeetsheetalpuri@gmail.com';

export function isValidFirestoreDocId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

export function isPolicyVerifiedUser(auth: PolicyAuthContext | null): boolean {
  return Boolean(auth && auth.uid && auth.emailVerified === true);
}

export function isPolicyOwner(auth: PolicyAuthContext | null): boolean {
  if (!auth || !isPolicyVerifiedUser(auth)) return false;
  if (auth.email?.toLowerCase() === BOOTSTRAPPED_OWNER_EMAIL || auth.isBootstrappedOwner) {
    return true;
  }
  return auth.allowlistActive === true && auth.allowlistRole === 'owner';
}

export function isPolicyAuthorizedUser(auth: PolicyAuthContext | null): boolean {
  if (!auth || !isPolicyVerifiedUser(auth)) return false;
  if (auth.email?.toLowerCase() === BOOTSTRAPPED_OWNER_EMAIL || auth.isBootstrappedOwner) {
    return true;
  }
  return (
    auth.allowlistActive === true &&
    (auth.allowlistRole === 'owner' || auth.allowlistRole === 'publisher')
  );
}

export interface PolicyArticleRecord {
  status: string;
  expiresAtMs?: number | null;
  hasExpiresAtTimestamp?: boolean;
  deletionStatus?: string;
  [extraKey: string]: unknown;
}

export function canPublicOrUserGetArticle(
  auth: PolicyAuthContext | null,
  articleId: string,
  article: PolicyArticleRecord,
  requestTimeMs: number,
): boolean {
  if (!isValidFirestoreDocId(articleId)) return false;
  if (isPolicyAuthorizedUser(auth)) return true;
  return (
    article.status === 'Published' &&
    Boolean(article.hasExpiresAtTimestamp) &&
    typeof article.expiresAtMs === 'number' &&
    article.expiresAtMs > requestTimeMs &&
    article.deletionStatus === 'none'
  );
}

export function canPublicOrUserListArticle(
  auth: PolicyAuthContext | null,
  article: PolicyArticleRecord,
  requestTimeMs: number,
): boolean {
  if (isPolicyAuthorizedUser(auth)) return true;
  return (
    article.status === 'Published' &&
    Boolean(article.hasExpiresAtTimestamp) &&
    typeof article.expiresAtMs === 'number' &&
    article.expiresAtMs > requestTimeMs &&
    article.deletionStatus === 'none'
  );
}

export interface PolicyMediaRecord {
  isPublic?: boolean;
  expiresAtMs?: number | null;
  hasExpiresAtTimestamp?: boolean;
}

export function canGetMediaRecord(
  auth: PolicyAuthContext | null,
  mediaId: string,
  media: PolicyMediaRecord,
  requestTimeMs: number,
): boolean {
  if (!isValidFirestoreDocId(mediaId)) return false;
  if (isPolicyAuthorizedUser(auth)) return true;
  if (media.isPublic !== true) return false;
  if (media.expiresAtMs === undefined || media.expiresAtMs === null) return true;
  return Boolean(media.hasExpiresAtTimestamp) && media.expiresAtMs > requestTimeMs;
}

export function canListMediaMetadata(auth: PolicyAuthContext | null): boolean {
  return isPolicyAuthorizedUser(auth);
}

export function canListMediaPayloads(auth: PolicyAuthContext | null): boolean {
  return isPolicyAuthorizedUser(auth);
}

export function canReadPaidCampaign(auth: PolicyAuthContext | null): boolean {
  return isPolicyAuthorizedUser(auth);
}

export function canWriteAuthorizedEmailOrSettings(auth: PolicyAuthContext | null): boolean {
  return isPolicyOwner(auth);
}

export function canMutateOrDeleteAuditLog(): boolean {
  // allow update, delete: if false
  return false;
}

export const ARTICLE_ALLOWED_KEYS = new Set([
  'title', 'slug', 'summary', 'body',
  'enHeadline', 'enSummary', 'enBody',
  'hiHeadline', 'hiSummary', 'hiBody',
  'category', 'tags', 'keywords', 'entities', 'author',
  'status', 'verificationStatus', 'sourceName', 'sourceUrl', 'officialSources',
  'mediaId', 'youtubeUrl', 'youtubeVideoId', 'youtubeTitle', 'language',
  'durationPreset', 'durationHours', 'publishedAt', 'publishedAtMs',
  'expiresAtMs', 'expiresAt', 'retainedPrivate',
  'featuredPlacement', 'featuredOrder',
  'isPaid', 'paidCampaignId', 'paidDisclosureLabel',
  'deletionStatus', 'deletionApprovedByUid', 'deletionApprovedByEmail',
  'deletionApprovedAtMs', 'deletionError', 'deletionAttempts',
  'createdByUid', 'updatedByUid', 'updatedAt', 'createdAt',
]);

export function hasOnlyAllowedArticleKeys(doc: Record<string, unknown>): boolean {
  return Object.keys(doc).every((key) => ARTICLE_ALLOWED_KEYS.has(key));
}

export function isValidMediaPayloadSize(sizeBytes: number, dataUrl: string): boolean {
  return (
    Number.isFinite(sizeBytes) &&
    sizeBytes >= 1 &&
    sizeBytes <= 450_000 &&
    typeof dataUrl === 'string' &&
    dataUrl.length >= 30 &&
    dataUrl.length <= 620_000
  );
}

export function canGetPublicCatalog(auth: PolicyAuthContext | null, catalogId: string): boolean {
  if (isPolicyAuthorizedUser(auth)) return true;
  return catalogId === 'legacyOverrides';
}

export function canListPublicCatalog(auth: PolicyAuthContext | null): boolean {
  return isPolicyAuthorizedUser(auth);
}

export function canWritePublicLegacyOverrides(
  auth: PolicyAuthContext | null,
  catalogId: string,
  payload: Record<string, unknown>,
  authUid?: string,
): boolean {
  if (catalogId !== 'legacyOverrides') return false;
  if (!isPolicyAuthorizedUser(auth)) return false;
  const keys = Object.keys(payload);
  const allowed = new Set(['suppressedArticleIds', 'suppressedSlugs', 'updatedByUid', 'updatedAt']);
  if (!keys.every((k) => allowed.has(k))) return false;
  if (!['suppressedArticleIds', 'suppressedSlugs', 'updatedByUid', 'updatedAt'].every((k) => k in payload)) {
    return false;
  }
  if (!Array.isArray(payload.suppressedArticleIds) || payload.suppressedArticleIds.length > 200) return false;
  if (!Array.isArray(payload.suppressedSlugs) || payload.suppressedSlugs.length > 200) return false;
  if (authUid && payload.updatedByUid !== authUid) return false;
  return true;
}

export function canDeleteArticleInFirestore(
  auth: PolicyAuthContext | null,
  articleId: string,
  existingArticle?: { status?: string; deletionStatus?: string },
): boolean {
  if (!isValidFirestoreDocId(articleId)) return false;
  if (!isPolicyAuthorizedUser(auth)) return false;
  if (!existingArticle) return false;
  const validStatus =
    existingArticle.status === 'Pending Deletion' ||
    existingArticle.status === 'Deletion In Progress';
  const validDeletionStatus =
    existingArticle.deletionStatus === 'approved' ||
    existingArticle.deletionStatus === 'in_progress' ||
    existingArticle.deletionStatus === 'partial_failure';
  return validStatus && validDeletionStatus;
}

export function canDeleteMediaInFirestore(
  auth: PolicyAuthContext | null,
  mediaId: string,
  payloadStillExists: boolean,
): boolean {
  if (!isValidFirestoreDocId(mediaId)) return false;
  if (!isPolicyAuthorizedUser(auth)) return false;
  return !payloadStillExists;
}

export function canDeleteIpoInFirestore(
  auth: PolicyAuthContext | null,
  ipoId: string,
  verificationStatus?: string,
): boolean {
  if (!isValidFirestoreDocId(ipoId)) return false;
  if (!isPolicyOwner(auth)) return false;
  return verificationStatus !== 'verified';
}

export function canDeleteIpoSourceReviewInFirestore(
  auth: PolicyAuthContext | null,
  reviewId: string,
): boolean {
  if (!isValidFirestoreDocId(reviewId)) return false;
  return isPolicyOwner(auth);
}

export function canDeletePaidCampaignInFirestore(
  auth: PolicyAuthContext | null,
  campaignId: string,
  internalStatus?: string,
): boolean {
  if (!isValidFirestoreDocId(campaignId)) return false;
  if (!isPolicyOwner(auth)) return false;
  return internalStatus === 'Cancelled' || internalStatus === 'Completed' || internalStatus === 'Planned';
}
