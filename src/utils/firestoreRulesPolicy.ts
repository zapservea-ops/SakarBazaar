/**
 * Pure TypeScript policy evaluator mirroring firestore.rules for automated unit testing
 * when JVM Firestore Emulator is unavailable in headless environments.
 * NOTE (Safeguard H5): Passing unit tests here verifies TypeScript logic alignment,
 * NOT live Firebase server rule evaluation or deployed security rules execution.
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

export interface PolicyIpoRecord {
  verificationStatus?: string;
  status?: string;
  isArchived?: boolean;
  deletionStatus?: string;
}

export function isPolicyPublicIpo(ipo: PolicyIpoRecord): boolean {
  return (
    ipo.verificationStatus === 'verified' &&
    ipo.isArchived === false &&
    ipo.deletionStatus === 'none' &&
    (ipo.status === 'Upcoming' ||
      ipo.status === 'Open' ||
      ipo.status === 'Closed' ||
      ipo.status === 'Listed')
  );
}

export function canPublicOrUserGetIpo(
  auth: PolicyAuthContext | null,
  ipoId: string,
  ipo: PolicyIpoRecord,
): boolean {
  if (!isValidFirestoreDocId(ipoId)) return false;
  if (isPolicyAuthorizedUser(auth)) return true;
  return isPolicyPublicIpo(ipo);
}

export function canPublicOrUserListIpo(
  auth: PolicyAuthContext | null,
  ipo: PolicyIpoRecord,
): boolean {
  if (isPolicyAuthorizedUser(auth)) return true;
  return isPolicyPublicIpo(ipo);
}

export function canDeleteIpoInFirestore(
  auth: PolicyAuthContext | null,
  ipoId: string,
  ipo: PolicyIpoRecord,
): boolean {
  if (!isValidFirestoreDocId(ipoId)) return false;
  if (!isPolicyAuthorizedUser(auth)) return false;
  if (isPolicyPublicIpo(ipo)) return false;
  if (ipo.deletionStatus === 'deleted' || ipo.status === 'Deleted') return false;
  if (ipo.deletionStatus === 'pending_approval') return false;
  if (ipo.status === 'Pending Deletion' && ipo.deletionStatus !== 'approved') return false;
  return (
    ipo.deletionStatus === 'approved' ||
    ipo.isArchived === true ||
    ipo.status === 'Archived' ||
    ipo.status === 'Unpublished' ||
    ipo.status === 'Awaiting Verification' ||
    ipo.status === 'Draft' ||
    ipo.status === 'Rejected' ||
    ipo.verificationStatus === 'archived' ||
    ipo.verificationStatus === 'unpublished' ||
    ipo.verificationStatus === 'awaiting_verification' ||
    ipo.verificationStatus === 'rejected' ||
    ipo.verificationStatus === 'proposed'
  );
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

export const IPO_REQUIRED_KEYS = [
  'companyName', 'slug', 'segment', 'status',
  'verificationStatus', 'isArchived', 'deletionStatus',
  'updatedByUid', 'createdAt', 'updatedAt',
] as const;

export const IPO_ALLOWED_KEYS = new Set([
  'migrationKey', 'companyName', 'slug', 'segment', 'status', 'issueSize', 'priceBand', 'lotSize',
  'filingDate', 'openingDate', 'closingDate', 'allotmentDate', 'listingDate',
  'sellingShareholder', 'offerType', 'summary', 'officialDocuments', 'sourceName',
  'sourceUrl', 'verificationStatus', 'previousVerificationStatus', 'isArchived',
  'deletionStatus', 'lastVerifiedAt', 'updatedByUid', 'createdAt', 'updatedAt',
]);

export const IPO_ALLOWED_STATUSES = new Set([
  'Draft', 'Awaiting Verification', 'Rejected', 'Upcoming', 'Open', 'Closed', 'Listed',
  'Archived', 'Unpublished', 'Pending Deletion', 'Deleted',
]);

export const IPO_ALLOWED_VERIFICATION_STATUSES = new Set([
  'awaiting_verification', 'verified', 'unpublished', 'archived', 'rejected', 'proposed',
]);

export function isValidIpoSchemaForRules(doc: Record<string, unknown>): { valid: boolean; reason?: string } {
  for (const req of IPO_REQUIRED_KEYS) {
    if (!(req in doc) || doc[req] === undefined) {
      return { valid: false, reason: `Missing required IPO field: ${req}` };
    }
  }
  for (const key of Object.keys(doc)) {
    if (!IPO_ALLOWED_KEYS.has(key)) {
      return { valid: false, reason: `Disallowed IPO field for firestore.rules: ${key}` };
    }
  }
  if (typeof doc.companyName !== 'string' || doc.companyName.length < 2 || doc.companyName.length > 160) {
    return { valid: false, reason: 'Invalid companyName length' };
  }
  if (typeof doc.slug !== 'string' || doc.slug.length < 3 || doc.slug.length > 160 || !/^[a-z0-9-]+$/.test(doc.slug)) {
    return { valid: false, reason: 'Invalid slug format' };
  }
  if (doc.segment !== 'Mainboard' && doc.segment !== 'SME') {
    return { valid: false, reason: 'Invalid segment' };
  }
  if (typeof doc.status !== 'string' || !IPO_ALLOWED_STATUSES.has(doc.status)) {
    return { valid: false, reason: `Disallowed IPO status: ${String(doc.status)}` };
  }
  if (typeof doc.verificationStatus !== 'string' || !IPO_ALLOWED_VERIFICATION_STATUSES.has(doc.verificationStatus)) {
    return { valid: false, reason: `Invalid verificationStatus: ${String(doc.verificationStatus)}` };
  }
  if (typeof doc.isArchived !== 'boolean') {
    return { valid: false, reason: 'isArchived must be boolean' };
  }
  if (
    doc.deletionStatus !== 'none' &&
    doc.deletionStatus !== 'pending_approval' &&
    doc.deletionStatus !== 'approved' &&
    doc.deletionStatus !== 'deleted'
  ) {
    return { valid: false, reason: `Invalid deletionStatus: ${String(doc.deletionStatus)}` };
  }
  if (doc.verificationStatus === 'verified') {
    const publicStatuses = new Set(['Upcoming', 'Open', 'Closed', 'Listed']);
    if (doc.isArchived !== false || !publicStatuses.has(String(doc.status)) || doc.deletionStatus !== 'none') {
      return { valid: false, reason: 'Verified IPO violates public invariants (isArchived=false, public status, deletionStatus=none)' };
    }
  }
  return { valid: true };
}

export const ARTICLE_REQUIRED_KEYS = [
  'slug', 'category', 'author', 'status', 'verificationStatus',
  'language', 'createdByUid', 'updatedAt', 'createdAt',
] as const;

export const ARTICLE_ALLOWED_STATUSES = new Set([
  'Draft', 'Awaiting Verification', 'Verified', 'Published',
  'Expired', 'Retained', 'Pending Deletion', 'Deletion In Progress', 'Deleted', 'Archived',
]);

export const ARTICLE_ALLOWED_CATEGORIES = new Set([
  'Markets', 'IPO', 'Corporate', 'Economy', 'RBI', 'Banking', 'Technology', 'Personal finance',
]);

export function isValidArticleSchemaForRules(doc: Record<string, unknown>): { valid: boolean; reason?: string } {
  for (const req of ARTICLE_REQUIRED_KEYS) {
    if (!(req in doc) || doc[req] === undefined || doc[req] === null) {
      return { valid: false, reason: `Missing required Article field: ${req}` };
    }
  }
  for (const key of Object.keys(doc)) {
    if (!ARTICLE_ALLOWED_KEYS.has(key)) {
      return { valid: false, reason: `Disallowed Article field for firestore.rules: ${key}` };
    }
  }
  if (typeof doc.slug !== 'string' || doc.slug.length < 3 || doc.slug.length > 160 || !/^[a-z0-9-]+$/.test(doc.slug)) {
    return { valid: false, reason: 'Invalid article slug format' };
  }
  if (typeof doc.category !== 'string' || !ARTICLE_ALLOWED_CATEGORIES.has(doc.category)) {
    return { valid: false, reason: `Disallowed article category: ${String(doc.category)}` };
  }
  if (typeof doc.author !== 'string' || doc.author.length < 2 || doc.author.length > 120) {
    return { valid: false, reason: 'Invalid article author length' };
  }
  if (typeof doc.status !== 'string' || !ARTICLE_ALLOWED_STATUSES.has(doc.status)) {
    return { valid: false, reason: `Disallowed article status: ${String(doc.status)}` };
  }
  if (
    doc.verificationStatus !== 'awaiting_verification' &&
    doc.verificationStatus !== 'verified' &&
    doc.verificationStatus !== 'unverified'
  ) {
    return { valid: false, reason: `Disallowed article verificationStatus: ${String(doc.verificationStatus)}` };
  }
  if (doc.language !== 'en' && doc.language !== 'hi' && doc.language !== 'bilingual') {
    return { valid: false, reason: `Disallowed article language: ${String(doc.language)}` };
  }
  if (
    'deletionStatus' in doc &&
    doc.deletionStatus !== null &&
    doc.deletionStatus !== undefined &&
    !['none', 'pending_approval', 'approved', 'in_progress', 'partial_failure', 'deleted'].includes(String(doc.deletionStatus))
  ) {
    return { valid: false, reason: `Disallowed article deletionStatus: ${String(doc.deletionStatus)}` };
  }
  return { valid: true };
}

export const MEDIA_ASSET_ALLOWED_KEYS = new Set([
  'fileName', 'storagePath', 'mediaType', 'duration', 'width', 'height',
  'sizeBytes', 'credit', 'usageRightsConfirmed', 'isPublic', 'expiresAtMs', 'expiresAt',
  'poster', 'captions', 'transcript', 'associatedArticleId', 'associatedArticleIds',
  'youtubeVideoId', 'youtubeUrl', 'uploadedByUid', 'createdAt', 'updatedAt',
]);

export const MEDIA_PAYLOAD_ALLOWED_KEYS = new Set([
  'mediaId', 'mimeType', 'sizeBytes', 'dataUrl', 'isPublic',
  'expiresAt', 'uploadedByUid', 'createdAt', 'updatedAt',
]);

export const AUDIT_LOG_ALLOWED_ACTIONS = new Set([
  'create_draft', 'mark_awaiting_verification', 'verify',
  'publish', 'archive', 'update', 'extend_duration', 'retain_private',
  'restore_article', 'approve_delete', 'start_delete', 'complete_delete',
  'partial_delete_failure', 'retry_delete', 'ipo_source_check',
  'ipo_review_approve', 'ipo_review_reject', 'export_backup',
  'restore_backup', 'permission_update', 'paid_update', 'media_upload', 'media_delete',
]);

export function isValidAuditLogPayloadForRules(doc: Record<string, unknown>): { valid: boolean; reason?: string } {
  const required = ['action', 'entityType', 'entityId', 'actorUid', 'actorEmail', 'nextStatus', 'summary', 'createdAt'];
  const allowed = new Set([...required, 'previousStatus']);
  for (const r of required) {
    if (!(r in doc) || doc[r] === undefined) {
      return { valid: false, reason: `Missing auditLog field: ${r}` };
    }
  }
  for (const k of Object.keys(doc)) {
    if (!allowed.has(k)) {
      return { valid: false, reason: `Disallowed auditLog field: ${k}` };
    }
  }
  if (typeof doc.action !== 'string' || !AUDIT_LOG_ALLOWED_ACTIONS.has(doc.action)) {
    return { valid: false, reason: `Disallowed audit action: ${String(doc.action)}` };
  }
  if (!isValidFirestoreDocId(String(doc.entityId ?? ''))) {
    return { valid: false, reason: 'Invalid audit entityId' };
  }
  if (typeof doc.summary !== 'string' || doc.summary.length < 3 || doc.summary.length > 400) {
    return { valid: false, reason: 'Invalid audit summary length' };
  }
  return { valid: true };
}

