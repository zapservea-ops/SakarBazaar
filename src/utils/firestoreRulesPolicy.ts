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
  if (auth.allowlistActive === false) return false;
  if (auth.allowlistRole && auth.allowlistRole !== 'owner') return false;
  return Boolean(auth.isAdminOwnerDoc);
}

export function isPolicyAuthorizedUser(auth: PolicyAuthContext | null): boolean {
  if (!auth || !isPolicyVerifiedUser(auth)) return false;
  if (auth.email?.toLowerCase() === BOOTSTRAPPED_OWNER_EMAIL || auth.isBootstrappedOwner) {
    return true;
  }
  if (auth.allowlistActive === false) return false;
  return Boolean(auth.isAdminOwnerDoc || auth.isAdminPublisherDoc || auth.allowlistActive === true);
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
