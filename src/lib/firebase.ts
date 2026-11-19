import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { MEDIA_ASSETS } from '../data/editorialData';
import type {
  AdminRole,
  AdminUserRecord,
  ArticleRecord,
  AuditLogRecord,
  AuthorizedEmailRecord,
  EditorialWorkflowStatus,
  IpoRow,
  IpoSourceReviewRecord,
  ManagedIpoRecord,
  MediaAssetRecord,
  NewsCategory,
  PaidCampaignRecord,
  SakarBazaarBackupBundle,
  StoredArticleDoc,
  StoredMediaAssetDoc,
  StoredMediaPayloadDoc,
  SystemSettingsRecord,
  VerificationStatus,
} from '../types/sakarbazaar';
import {
  BOOTSTRAPPED_OWNER_EMAIL,
  normalizeAdminRole,
  normalizeEmailKey,
} from '../utils/adminPermissions';
import { resolveMediaById } from '../utils/articleMedia';
import {
  buildSakarBazaarBackupBundle,
  prepareRestoredArticlePayload,
  prepareRestoredIpoPayload,
  prepareRestoredMediaBlobPayload,
  prepareRestoredMediaPayload,
  prepareRestoredPaidCampaignPayload,
  validateBackupBundle,
} from '../utils/backupRestore';
import {
  assertReviewPendingResolution,
  calculateIpoStatusFromDates,
  detectIpoFieldDiffs,
  findMatchingManagedIpo,
  hasDuplicateIpoReview,
  mapManagedIpoToPublicRow,
  type DetectedIpoCandidate,
} from '../utils/ipoLifecycle';
import {
  canSafelyDeleteMediaAsset,
  computeMediaVisibilityFromArticles,
  parseYouTubeVideoUrl,
} from '../utils/mediaLibrary';
import {
  ConflictError,
  assertDocumentVersionUnchanged,
  computeExpiresAtMs,
  isArticleExpired,
  isArticlePubliclyVisible,
  sanitizeArticleSlug,
} from '../utils/newsLifecycle';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAPPED_ADMIN_EMAIL = BOOTSTRAPPED_OWNER_EMAIL;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      result[k] = v;
    }
  }
  return result;
}

function safeDocId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `${fallbackPrefix}_${Date.now()}`;
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

// Session cache for Firestore media metadata and compressed photo payloads to save 50k/day Spark reads.
const mediaAssetCache = new Map<string, StoredMediaAssetDoc>();
const mediaPayloadCache = new Map<string, StoredMediaPayloadDoc>();

export function clearSessionMediaCache(mediaId?: string): void {
  if (mediaId) {
    mediaAssetCache.delete(mediaId);
    mediaPayloadCache.delete(mediaId);
  } else {
    mediaAssetCache.clear();
    mediaPayloadCache.clear();
  }
}

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export interface FirebaseSessionRefreshOutcome {
  ok: boolean;
  reason?: 'unauthenticated' | 'expired' | 'disabled' | 'network' | 'error';
  message?: string;
}

export async function refreshFirebaseSession(): Promise<FirebaseSessionRefreshOutcome> {
  const current = auth.currentUser;
  if (!current) {
    return {
      ok: false,
      reason: 'unauthenticated',
      message: 'No signed-in Google account session found. Sign in to continue.',
    };
  }
  try {
    await current.reload();
    await current.getIdToken(true);
    return { ok: true };
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code ?? '')
        : '';
    const msg = err instanceof Error ? err.message : String(err);

    if (code === 'auth/user-disabled') {
      return {
        ok: false,
        reason: 'disabled',
        message: 'This Google account has been disabled in Firebase Authentication.',
      };
    }
    if (
      code === 'auth/user-token-expired' ||
      code === 'auth/invalid-user-token' ||
      code === 'auth/user-not-found' ||
      msg.includes('TOKEN_EXPIRED') ||
      msg.includes('INVALID_ID_TOKEN')
    ) {
      return {
        ok: false,
        reason: 'expired',
        message: 'Your Google sign-in session expired. Please sign in again.',
      };
    }
    if (code === 'auth/network-request-failed') {
      return {
        ok: false,
        reason: 'network',
        message: 'Network error while contacting Firebase Authentication. Check your connection and retry.',
      };
    }
    return {
      ok: false,
      reason: 'error',
      message: msg || 'Unable to refresh authentication session.',
    };
  }
}

export async function refreshAuthSessionToken(): Promise<boolean> {
  const outcome = await refreshFirebaseSession();
  return outcome.ok;
}

export interface EditorAuthResult {
  authorized: boolean;
  role: 'admin' | 'editor' | 'none';
  adminRole: AdminRole;
}

export async function checkEditorAuthorization(user: User | null): Promise<EditorAuthResult> {
  if (!user || !user.emailVerified || !user.email) {
    return { authorized: false, role: 'none', adminRole: 'none' };
  }

  const emailLower = normalizeEmailKey(user.email);
  if (emailLower === BOOTSTRAPPED_OWNER_EMAIL.toLowerCase()) {
    // Ensure bootstrapped owner profile doc exists if missing (non-blocking)
    try {
      const ownerDocRef = doc(db, 'admins', user.uid);
      const ownerSnap = await getDoc(ownerDocRef);
      if (!ownerSnap.exists()) {
        await setDoc(ownerDocRef, {
          uid: user.uid,
          email: emailLower,
          displayName: (user.displayName || 'SakarBazaar Owner').slice(0, 120),
          role: 'owner',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Non-fatal: bootstrapped email check grants owner role directly
    }
    return { authorized: true, role: 'admin', adminRole: 'owner' };
  }

  // First check authorizedEmails/{emailLower} so explicit revocation (active === false)
  // immediately overrides any previously auto-created /admins/{uid} profile doc.
  try {
    const allowSnap = await getDoc(doc(db, 'authorizedEmails', emailLower));
    if (allowSnap.exists()) {
      const data = allowSnap.data();
      if (data.active !== true) {
        return { authorized: false, role: 'none', adminRole: 'none' };
      }
      const adminRole = normalizeAdminRole(String(data.role ?? 'publisher'), user.email);
      if (adminRole !== 'none') {
        try {
          const adminRef = doc(db, 'admins', user.uid);
          const adminSnap = await getDoc(adminRef);
          if (!adminSnap.exists()) {
            await setDoc(adminRef, {
              uid: user.uid,
              email: emailLower,
              displayName: (user.displayName || String(data.displayName || 'SakarBazaar Publisher')).slice(0, 120),
              role: adminRole,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            // authorizedEmails role takes precedence if Owner downgraded/changed an operator's role
            const existingRole = normalizeAdminRole(String(adminSnap.data().role ?? ''), user.email);
            if (existingRole !== adminRole) {
              return {
                authorized: true,
                role: adminRole === 'owner' ? 'admin' : 'editor',
                adminRole,
              };
            }
          }
        } catch {
          // Even if profile creation fails, allowlist in rules still authorizes operator
        }
        return {
          authorized: true,
          role: adminRole === 'owner' ? 'admin' : 'editor',
          adminRole,
        };
      }
    }
  } catch {
    // Fall through to admins/{uid} check
  }

  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    if (adminSnap.exists()) {
      const data = adminSnap.data();
      const adminRole = normalizeAdminRole(String(data.role ?? ''), user.email);
      if (adminRole !== 'none') {
        return {
          authorized: true,
          role: adminRole === 'owner' ? 'admin' : 'editor',
          adminRole,
        };
      }
    }
  } catch {
    // Unauthorized users receive permission denied; return none cleanly
  }

  return { authorized: false, role: 'none', adminRole: 'none' };
}

export async function writeAuditLog(params: {
  action:
    | 'create_draft'
    | 'ai_brief'
    | 'mark_awaiting_verification'
    | 'verify'
    | 'publish'
    | 'archive'
    | 'update'
    | 'extend_duration'
    | 'retain_private'
    | 'restore_article'
    | 'approve_delete'
    | 'start_delete'
    | 'complete_delete'
    | 'partial_delete_failure'
    | 'retry_delete'
    | 'ipo_source_check'
    | 'ipo_review_approve'
    | 'ipo_review_reject'
    | 'export_backup'
    | 'restore_backup'
    | 'permission_update'
    | 'paid_update'
    | 'media_upload'
    | 'media_delete';
  entityType:
    | 'article'
    | 'ipo'
    | 'ipoReview'
    | 'media'
    | 'paidCampaign'
    | 'marketInstrument'
    | 'system'
    | 'backup';
  entityId: string;
  previousStatus?: string;
  nextStatus: string;
  summary: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) return;
  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const cleanSummary = params.summary.trim().slice(0, 390) || params.action;
  const cleanNext = params.nextStatus.trim().slice(0, 48) || 'Updated';
  const payload = stripUndefined({
    action: params.action,
    entityType: params.entityType,
    entityId: safeDocId(params.entityId, 'ent'),
    actorUid: user.uid,
    actorEmail: user.email,
    previousStatus: params.previousStatus ? params.previousStatus.slice(0, 48) : undefined,
    nextStatus: cleanNext.length >= 2 ? cleanNext : 'OK',
    summary: cleanSummary.length >= 3 ? cleanSummary : `${params.action} executed`,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'auditLogs', logId), payload);
}

// Backwards-compatible legacy interface retained alongside StoredArticleDoc
export interface StoredEditorialArticle {
  id: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  enHeadline?: string;
  enSummary?: string;
  enBody?: string;
  hiHeadline?: string;
  hiSummary?: string;
  hiBody?: string;
  category: Exclude<NewsCategory, 'All'>;
  tags: string[];
  keywords: string[];
  entities: string[];
  author: string;
  status: EditorialWorkflowStatus;
  verificationStatus: VerificationStatus;
  sourceName: string;
  sourceUrl?: string;
  officialSources?: string[];
  mediaId?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  youtubeTitle?: string;
  language: 'en' | 'hi' | 'bilingual';
  durationPreset?: StoredArticleDoc['durationPreset'];
  durationHours?: number;
  publishedAt?: string;
  publishedAtMs?: number | null;
  expiresAtMs?: number | null;
  retainedPrivate?: boolean;
  featuredPlacement?: StoredArticleDoc['featuredPlacement'];
  featuredOrder?: number;
  isPaid?: boolean;
  paidCampaignId?: string;
  paidDisclosureLabel?: string;
  deletionStatus?: StoredArticleDoc['deletionStatus'];
  createdByUid: string;
}

function splitParagraphs(body: string | undefined, fallback: string): string[] {
  const parts = (body ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : fallback ? [fallback] : [];
}

export function mapFirestoreArticleToRecord(
  docData: StoredEditorialArticle | StoredArticleDoc,
  resolvedMedia?: MediaAssetRecord,
): ArticleRecord {
  const enHeadline = (docData.enHeadline || docData.title || '').trim();
  const enSummary = (docData.enSummary || docData.summary || '').trim();
  const enBody = (docData.enBody || docData.body || '').trim();
  const hiHeadline = (docData.hiHeadline || '').trim();
  const hiSummary = (docData.hiSummary || '').trim();
  const hiBody = (docData.hiBody || '').trim();

  const enParagraphs = splitParagraphs(enBody, enSummary);
  const hiParagraphs = splitParagraphs(hiBody, hiSummary);
  const entities = docData.entities ?? [];
  const keywords = docData.keywords ?? [];
  const tags = docData.tags ?? [];

  const ticker =
    entities[0]?.slice(0, 12).toUpperCase() ||
    docData.category.slice(0, 10).toUpperCase();

  const cleanSourceName = (docData.sourceName ?? '').trim();
  const cleanSourceUrl = (docData.sourceUrl ?? '').trim() || null;

  let finalMedia = resolvedMedia ?? resolveMediaById(docData.mediaId, MEDIA_ASSETS);
  if (!finalMedia && (docData.youtubeVideoId || docData.youtubeUrl)) {
    const parsedYt = parseYouTubeVideoUrl(docData.youtubeVideoId || docData.youtubeUrl);
    if (parsedYt) {
      finalMedia = {
        id: docData.mediaId || `yt-${parsedYt.videoId}`,
        fileName: `youtube-${parsedYt.videoId}`,
        storagePath: `youtube:${parsedYt.videoId}`,
        publicUrl: parsedYt.canonicalUrl,
        posterUrl: parsedYt.thumbnailUrl,
        mediaType: 'video/youtube',
        youtubeVideoId: parsedYt.videoId,
        youtubeUrl: parsedYt.canonicalUrl,
        title: docData.youtubeTitle || enHeadline,
        caption: enSummary || enHeadline,
        sourceNote: cleanSourceName || 'SakarBazaar Video Desk',
      };
    }
  }

  return {
    id: docData.id,
    slug: docData.slug,
    category: docData.category,
    company: entities[0] ?? undefined,
    headline: enHeadline || hiHeadline,
    headlineHi: hiHeadline || undefined,
    deck: enSummary || hiSummary,
    deckHi: hiSummary || undefined,
    author: docData.author,
    authorRole: 'SakarBazaar Editorial Desk',
    publishedAt: docData.publishedAt || 'Draft / Unscheduled',
    publishedAtMs: docData.publishedAtMs ?? null,
    expiresAtMs: docData.expiresAtMs ?? null,
    durationPreset: docData.durationPreset,
    durationHours: docData.durationHours,
    updatedAt: docData.publishedAt || 'Recently updated',
    time: 'Editorial',
    readTime: `${Math.max(2, Math.ceil((enBody || hiBody).split(/\s+/).length / 180))} min read`,
    ticker,
    sourceName: cleanSourceName || 'SakarBazaar Editorial Desk',
    sourceUrl: cleanSourceUrl,
    sourceNote: cleanSourceName
      ? docData.verificationStatus === 'verified'
        ? `Verified · ${cleanSourceName}`
        : `Editorial Dispatch · ${cleanSourceName}`
      : 'SakarBazaar Editorial Desk',
    verificationStatus: docData.verificationStatus,
    editorialStatus: docData.status,
    illustration:
      docData.category === 'IPO'
        ? 'ipo-book'
        : docData.category === 'RBI'
          ? 'rbi-dial'
          : docData.category === 'Markets'
            ? 'markets-pulse'
            : 'corporate-corridor',
    illustrationCaption: `SakarBazaar editorial illustration for ${enHeadline || hiHeadline}`,
    tags,
    keywords,
    entities,
    aliases: [...entities, ...keywords].slice(0, 12),
    keyPoints: enParagraphs.slice(0, 3),
    sections: [
      {
        heading: 'Editorial Dispatch',
        paragraphs: enParagraphs.length > 0 ? enParagraphs : [enSummary],
      },
    ],
    sectionsHi:
      hiParagraphs.length > 0
        ? [
            {
              heading: 'संपादकीय रिपोर्ट',
              paragraphs: hiParagraphs,
            },
          ]
        : undefined,
    citations: (docData.officialSources ?? [])
      .filter(Boolean)
      .map((src, index) => ({
        id: `cit-${docData.id}-${index}`,
        label: 'Official reference',
        portalName: src,
        url: src.startsWith('http') ? src : null,
        note: 'Submitted editorial verification source.',
      })),
    media: finalMedia,
    mediaId: docData.mediaId,
    relatedSlugs: [],
    featuredPlacement: docData.featuredPlacement ?? 'none',
    featuredOrder: docData.featuredOrder ?? 99,
    isFeatured: docData.featuredPlacement === 'main' || docData.featuredPlacement === 'secondary',
    isPaid: Boolean(docData.isPaid),
    paidDisclosureLabel: docData.isPaid
      ? docData.paidDisclosureLabel?.trim() || 'Partner Disclosure'
      : undefined,
    isHomepageFeed: docData.status === 'Published',
  };
}

async function resolveRemoteMediaRecord(mediaId: string): Promise<MediaAssetRecord | undefined> {
  const staticMatch = resolveMediaById(mediaId, MEDIA_ASSETS);
  if (staticMatch) return staticMatch;

  try {
    let meta = mediaAssetCache.get(mediaId);
    if (!meta) {
      const snap = await getDoc(doc(db, 'media', mediaId));
      if (!snap.exists()) return undefined;
      meta = { id: snap.id, ...(snap.data() as Omit<StoredMediaAssetDoc, 'id'>) };
      mediaAssetCache.set(mediaId, meta);
    }

    if (meta.mediaType === 'video/youtube') {
      const parsedYt = parseYouTubeVideoUrl(meta.youtubeVideoId || meta.youtubeUrl);
      if (!parsedYt) return undefined;
      return {
        id: meta.id,
        fileName: meta.fileName,
        storagePath: meta.storagePath || `youtube:${parsedYt.videoId}`,
        publicUrl: parsedYt.canonicalUrl,
        posterUrl: meta.poster || parsedYt.thumbnailUrl,
        mediaType: 'video/youtube',
        youtubeVideoId: parsedYt.videoId,
        youtubeUrl: parsedYt.canonicalUrl,
        title: meta.captions || meta.fileName,
        caption: meta.captions || '',
        sourceNote: meta.credit || 'SakarBazaar Video Desk',
        credit: meta.credit,
        usageRightsConfirmed: meta.usageRightsConfirmed,
        isPublic: meta.isPublic,
        expiresAtMs: meta.expiresAtMs ?? null,
        associatedArticleIds: meta.associatedArticleIds,
      };
    }

    if (meta.mediaType.startsWith('image/')) {
      let payload = mediaPayloadCache.get(mediaId);
      if (!payload) {
        const paySnap = await getDoc(doc(db, 'mediaPayloads', mediaId));
        if (!paySnap.exists()) return undefined;
        payload = { id: paySnap.id, ...(paySnap.data() as Omit<StoredMediaPayloadDoc, 'id'>) };
        mediaPayloadCache.set(mediaId, payload);
      }
      return {
        id: meta.id,
        fileName: meta.fileName,
        storagePath: meta.storagePath || `firestore:mediaPayloads/${mediaId}`,
        publicUrl: payload.dataUrl,
        mediaType: meta.mediaType,
        width: meta.width,
        height: meta.height,
        sizeBytes: meta.sizeBytes ?? payload.sizeBytes,
        title: meta.captions || meta.fileName,
        caption: meta.captions || '',
        sourceNote: meta.credit ? `Photo: ${meta.credit}` : 'SakarBazaar Media Library',
        credit: meta.credit,
        usageRightsConfirmed: meta.usageRightsConfirmed,
        isPublic: meta.isPublic,
        expiresAtMs: meta.expiresAtMs ?? null,
        associatedArticleIds: meta.associatedArticleIds,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function queryPublishedArticleDocs(minExpiresAtMs: number) {
  const q = query(
    collection(db, 'articles'),
    where('status', '==', 'Published'),
    where('deletionStatus', '==', 'none'),
    where('expiresAt', '>', Timestamp.fromMillis(minExpiresAtMs)),
    limit(40),
  );
  return getDocs(q);
}

export async function fetchPublishedEditorialArticles(): Promise<ArticleRecord[]> {
  try {
    let snap;
    try {
      // Match Firestore security rules (expiresAt > request.time) with a small forward clock skew buffer.
      snap = await queryPublishedArticleDocs(Date.now() + 30_000);
    } catch (firstErr) {
      const msg = firstErr instanceof Error ? firstErr.message.toLowerCase() : String(firstErr).toLowerCase();
      if (!msg.includes('permission') && !msg.includes('missing or insufficient')) {
        throw firstErr;
      }
      // Recover gracefully if local device clock lags behind Google server request.time
      const healthRes = await fetch('/api/health');
      if (!healthRes.ok) throw firstErr;
      const healthJson = (await healthRes.json()) as { serverTimeMs?: number };
      const syncedNow = typeof healthJson.serverTimeMs === 'number' ? healthJson.serverTimeMs : Date.now();
      snap = await queryPublishedArticleDocs(syncedNow + 10_000);
    }

    const nowMs = Date.now();
    const visibleDocs = snap.docs
      .map((d) => ({
        id: d.id,
        ...(d.data() as Omit<StoredArticleDoc, 'id'>),
      }))
      .filter((art) => isArticlePubliclyVisible(art, nowMs));

    const resolved = await Promise.all(
      visibleDocs.map(async (art) => {
        const media = art.mediaId ? await resolveRemoteMediaRecord(art.mediaId) : undefined;
        return mapFirestoreArticleToRecord(art, media);
      }),
    );
    return resolved;
  } catch {
    return [];
  }
}

export async function fetchAllStoredArticles(): Promise<StoredArticleDoc[]> {
  const path = 'articles';
  try {
    const q = query(collection(db, path), orderBy('updatedAt', 'desc'), limit(120));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<StoredArticleDoc, 'id'>),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAllEditorArticles(): Promise<StoredEditorialArticle[]> {
  return fetchAllStoredArticles();
}

export async function fetchRecentAuditLogs(maxItems: number = 50): Promise<AuditLogRecord[]> {
  const path = 'auditLogs';
  try {
    const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(maxItems));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      const createdAtTs = data.createdAt as { toMillis?: () => number } | undefined;
      return {
        id: d.id,
        action: String(data.action ?? ''),
        entityType: String(data.entityType ?? ''),
        entityId: String(data.entityId ?? ''),
        actorUid: String(data.actorUid ?? ''),
        actorEmail: String(data.actorEmail ?? ''),
        previousStatus: data.previousStatus ? String(data.previousStatus) : undefined,
        nextStatus: String(data.nextStatus ?? ''),
        summary: String(data.summary ?? ''),
        createdAtMs: createdAtTs?.toMillis ? createdAtTs.toMillis() : undefined,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveEditorialArticle(params: {
  articleId: string;
  isNew: boolean;
  previousStatus?: EditorialWorkflowStatus;
  expectedUpdatedAtMs?: number | null;
  action:
    | 'create_draft'
    | 'ai_brief'
    | 'mark_awaiting_verification'
    | 'verify'
    | 'publish'
    | 'archive'
    | 'update'
    | 'extend_duration'
    | 'retain_private'
    | 'restore_article';
  payload: Omit<StoredEditorialArticle, 'id'> | Omit<StoredArticleDoc, 'id'>;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('Authentication required to save editorial records.');
  }
  const safeId = safeDocId(params.articleId, 'art');
  const articlePath = `articles/${safeId}`;
  const rawPayload = params.payload as Record<string, unknown>;
  const nowMs = Date.now();
  const requestedStatus = String(rawPayload.status ?? 'Draft');
  let expiresAtMs =
    typeof rawPayload.expiresAtMs === 'number' && Number.isFinite(rawPayload.expiresAtMs)
      ? rawPayload.expiresAtMs
      : null;
  if (requestedStatus === 'Published' && expiresAtMs === null) {
    const fallbackHours =
      typeof rawPayload.durationHours === 'number' && Number.isFinite(rawPayload.durationHours)
        ? rawPayload.durationHours
        : 360;
    expiresAtMs = computeExpiresAtMs(nowMs, fallbackHours);
  }

  const safeSlug = sanitizeArticleSlug(
    String(rawPayload.slug || rawPayload.enHeadline || rawPayload.title || safeId),
    'dispatch',
  );

  try {
    const baseData = stripUndefined({
      ...rawPayload,
      slug: safeSlug,
      expiresAtMs,
      expiresAt: expiresAtMs !== null ? Timestamp.fromMillis(expiresAtMs) : null,
      deletionStatus: rawPayload.deletionStatus ?? 'none',
      updatedByUid: user.uid,
    });
    // Ensure disallowed document ID / immutable fields never trigger Firestore hasOnly failures
    delete baseData.id;
    delete baseData.updatedAt;

    const articleRef = doc(db, 'articles', safeId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(articleRef);
      if (params.isNew) {
        if (snap.exists()) {
          throw new ConflictError(
            `Conflict detected: Article "${safeId}" already exists in Firestore. Refresh Data before editing or choose another title.`,
          );
        }
        tx.set(articleRef, {
          ...baseData,
          createdByUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        if (!snap.exists()) {
          throw new ConflictError(
            'Conflict detected: This article was permanently deleted by another operator session. Your entered edits remain preserved in the form.',
          );
        }
        const current = snap.data() as Record<string, unknown>;
        const currentDelStatus = String(current.deletionStatus ?? 'none');
        if (
          params.action !== 'restore_article' &&
          (currentDelStatus === 'approved' || currentDelStatus === 'in_progress') &&
          requestedStatus !== 'Pending Deletion' &&
          requestedStatus !== 'Retained'
        ) {
          throw new ConflictError(
            'Conflict detected: This article is currently queued or executing deletion in another session. Cancel deletion in section 8 before editing.',
          );
        }
        assertDocumentVersionUnchanged({
          entityLabel: 'article',
          expectedUpdatedAtMs: params.expectedUpdatedAtMs,
          currentUpdatedAt: current.updatedAt,
        });
        delete baseData.createdByUid;
        delete baseData.createdAt;
        tx.update(articleRef, {
          ...baseData,
          updatedAt: serverTimestamp(),
        });
      }
    });

    await writeAuditLog({
      action: params.action,
      entityType: 'article',
      entityId: safeId,
      previousStatus: params.previousStatus,
      nextStatus: String(rawPayload.status ?? 'Updated'),
      summary: `${params.action}: ${String(rawPayload.enHeadline || rawPayload.title || safeId).slice(0, 140)}`,
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, articlePath);
  }
}

/**
 * Synchronizes media + mediaPayloads public visibility and expiry timestamps
 * against all referencing articles so expired/private article images cannot be read publicly.
 */
export async function syncMediaVisibilityAcrossArticles(
  mediaId: string,
  allArticles: StoredArticleDoc[],
): Promise<void> {
  if (!mediaId) return;
  const safeMediaId = safeDocId(mediaId, 'med');
  const mediaRef = doc(db, 'media', safeMediaId);
  const mediaSnap = await getDoc(mediaRef);
  if (!mediaSnap.exists()) return;

  const vis = computeMediaVisibilityFromArticles(safeMediaId, allArticles, Date.now());
  const expiresAtTs = vis.expiresAtMs !== null ? Timestamp.fromMillis(vis.expiresAtMs) : null;

  await updateDoc(mediaRef, {
    isPublic: vis.isPublic,
    expiresAtMs: vis.expiresAtMs,
    expiresAt: expiresAtTs,
    associatedArticleIds: vis.associatedArticleIds,
    updatedAt: serverTimestamp(),
  });
  clearSessionMediaCache(safeMediaId);

  const payloadRef = doc(db, 'mediaPayloads', safeMediaId);
  const payloadSnap = await getDoc(payloadRef);
  if (payloadSnap.exists()) {
    await updateDoc(payloadRef, {
      isPublic: vis.isPublic,
      expiresAt: expiresAtTs,
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Automatically transitions any Published article whose elapsed expiry timestamp has passed
 * into 'Expired' status (retained privately; never deleted automatically) and syncs media visibility.
 */
export async function sweepExpiredPublishedArticles(
  articles: StoredArticleDoc[],
): Promise<number> {
  const user = auth.currentUser;
  if (!user) return 0;

  const nowMs = Date.now();
  const expiredCandidates = articles.filter(
    (art) => art.status === 'Published' && isArticleExpired(art, nowMs),
  );
  if (expiredCandidates.length === 0) return 0;

  const updatedList = articles.map((a) => ({ ...a }));
  const touchedMediaIds = new Set<string>();

  for (const art of expiredCandidates) {
    const safeId = safeDocId(art.id, 'art');
    try {
      await updateDoc(doc(db, 'articles', safeId), {
        status: 'Expired',
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      const target = updatedList.find((x) => x.id === art.id);
      if (target) target.status = 'Expired';
      if (art.mediaId) touchedMediaIds.add(art.mediaId);
    } catch {
      // Continue sweeping other expired items
    }
  }

  for (const mediaId of touchedMediaIds) {
    try {
      await syncMediaVisibilityAcrossArticles(mediaId, updatedList);
    } catch {
      // Ignore non-fatal sync error
    }
  }

  return expiredCandidates.length;
}

export async function updateFeaturedPlacementsInFirestore(
  changes: Array<{ id: string; featuredPlacement: StoredArticleDoc['featuredPlacement']; featuredOrder: number }>,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  if (changes.length === 0) return;

  const batch = writeBatch(db);
  for (const ch of changes) {
    batch.update(doc(db, 'articles', safeDocId(ch.id, 'art')), {
      featuredPlacement: ch.featuredPlacement ?? 'none',
      featuredOrder: ch.featuredOrder,
      updatedByUid: user.uid,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();

  await writeAuditLog({
    action: 'update',
    entityType: 'article',
    entityId: changes[0].id,
    nextStatus: 'FeaturedUpdated',
    summary: `Updated featured homepage placement for ${changes.length} article(s).`,
  });
}

export async function approveArticleForPermanentDeletion(article: StoredArticleDoc): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Authentication required.');
  const safeId = safeDocId(article.id, 'art');
  const articleRef = doc(db, 'articles', safeId);

  const alreadyApproved = await runTransaction(db, async (tx) => {
    const snap = await tx.get(articleRef);
    if (!snap.exists()) {
      throw new ConflictError('Article no longer exists in Firestore. Refresh Data to update the list.');
    }
    const cur = snap.data() as { deletionStatus?: string };
    if (cur.deletionStatus === 'in_progress') {
      throw new ConflictError('Permanent deletion is currently executing for this article in another session.');
    }
    if (cur.deletionStatus === 'approved') {
      return true;
    }
    tx.update(articleRef, {
      status: 'Pending Deletion',
      deletionStatus: 'approved',
      deletionApprovedByUid: user.uid,
      deletionApprovedByEmail: user.email,
      deletionApprovedAtMs: Date.now(),
      deletionError: '',
      updatedByUid: user.uid,
      updatedAt: serverTimestamp(),
    });
    return false;
  });

  if (alreadyApproved) return;

  await writeAuditLog({
    action: 'approve_delete',
    entityType: 'article',
    entityId: safeId,
    previousStatus: article.status,
    nextStatus: 'Pending Deletion',
    summary: `Approved permanent deletion for "${(article.enHeadline || article.title || safeId).slice(0, 120)}"`,
  });
}

export async function cancelArticleDeletionApproval(article: StoredArticleDoc): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Authentication required.');
  const safeId = safeDocId(article.id, 'art');
  const articleRef = doc(db, 'articles', safeId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(articleRef);
    if (!snap.exists()) {
      throw new ConflictError('Article was already deleted. Refresh Data to sync workspace.');
    }
    const cur = snap.data() as { deletionStatus?: string };
    if (cur.deletionStatus === 'in_progress') {
      throw new ConflictError('Deletion is actively executing right now and cannot be cancelled mid-flight.');
    }
    tx.update(articleRef, {
      status: 'Retained',
      retainedPrivate: true,
      deletionStatus: 'none',
      deletionError: '',
      updatedByUid: user.uid,
      updatedAt: serverTimestamp(),
    });
  });

  await writeAuditLog({
    action: 'retain_private',
    entityType: 'article',
    entityId: safeId,
    previousStatus: article.status,
    nextStatus: 'Retained',
    summary: `Cancelled deletion and retained privately: "${(article.enHeadline || article.title || safeId).slice(0, 110)}"`,
  });
}

/**
 * Executes permanent deletion safely with atomic lock acquisition and partial-failure tracking:
 * 1. Atomically claims 'Deletion In Progress' via runTransaction (blocks parallel double-deletion)
 * 2. Deletes unshared media + mediaPayloads ONLY (preserves shared media used by other articles)
 * 3. Deletes the article document
 * 4. Writes immutable 'complete_delete' audit log
 * If any step fails, records 'partial_failure' with error message so the Retry button can complete cleanup.
 */
export async function executePermanentArticleDeletion(
  article: StoredArticleDoc,
  allArticles: StoredArticleDoc[],
): Promise<{ status: 'deleted' | 'partial_failure'; message: string }> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Authentication required.');
  const safeId = safeDocId(article.id, 'art');
  const articleRef = doc(db, 'articles', safeId);
  const isRetry = article.deletionStatus === 'partial_failure';
  let attempts = (article.deletionAttempts ?? 0) + 1;

  try {
    const claim = await runTransaction(db, async (tx) => {
      const snap = await tx.get(articleRef);
      if (!snap.exists()) {
        return { alreadyDeleted: true as const };
      }
      const cur = snap.data() as { deletionStatus?: string; deletionAttempts?: number };
      if (cur.deletionStatus === 'in_progress' && article.deletionStatus !== 'in_progress') {
        throw new ConflictError('Deletion is already running in another operator tab or session.');
      }
      attempts = (cur.deletionAttempts ?? article.deletionAttempts ?? 0) + 1;
      tx.update(articleRef, {
        status: 'Deletion In Progress',
        deletionStatus: 'in_progress',
        deletionAttempts: attempts,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      return { alreadyDeleted: false as const };
    });

    if (claim.alreadyDeleted) {
      return {
        status: 'deleted',
        message: 'Article was already removed from Firestore; workspace refreshed.',
      };
    }

    await writeAuditLog({
      action: isRetry ? 'retry_delete' : 'start_delete',
      entityType: 'article',
      entityId: safeId,
      previousStatus: article.status,
      nextStatus: 'Deletion In Progress',
      summary: `${isRetry ? 'Retrying' : 'Starting'} permanent deletion for ${safeId}`,
    });

    if (article.mediaId) {
      const safeMediaId = safeDocId(article.mediaId, 'med');
      const guard = canSafelyDeleteMediaAsset(safeMediaId, allArticles, article.id);
      if (guard.canDelete) {
        await deleteDoc(doc(db, 'mediaPayloads', safeMediaId));
        await deleteDoc(doc(db, 'media', safeMediaId));
        clearSessionMediaCache(safeMediaId);
      } else {
        // Shared media preserved! Update visibility/references excluding deleted article.
        const remainingArticles = allArticles.filter((a) => a.id !== article.id);
        await syncMediaVisibilityAcrossArticles(safeMediaId, remainingArticles);
      }
    }

    await deleteDoc(articleRef);

    await writeAuditLog({
      action: 'complete_delete',
      entityType: 'article',
      entityId: safeId,
      previousStatus: 'Deletion In Progress',
      nextStatus: 'Deleted',
      summary: `Permanently deleted article "${(article.enHeadline || article.title || safeId).slice(0, 120)}"`,
    });

    return {
      status: 'deleted',
      message: 'Article and unshared media permanently deleted; audit log recorded.',
    };
  } catch (err) {
    if (err instanceof ConflictError) {
      return { status: 'partial_failure', message: err.message };
    }
    const errMsg = err instanceof Error ? err.message : 'Unknown error during permanent deletion.';
    try {
      await updateDoc(articleRef, {
        status: 'Pending Deletion',
        deletionStatus: 'partial_failure',
        deletionError: errMsg.slice(0, 480),
        deletionAttempts: attempts,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        action: 'partial_delete_failure',
        entityType: 'article',
        entityId: safeId,
        previousStatus: 'Deletion In Progress',
        nextStatus: 'partial_failure',
        summary: `Partial deletion failure on ${safeId}: ${errMsg.slice(0, 200)}`,
      });
    } catch {
      // Ignore secondary failure while updating status
    }
    return {
      status: 'partial_failure',
      message: errMsg,
    };
  }
}

// ─── MEDIA LIBRARY (ZERO-BILLING FIRESTORE STORAGE) ──────────────────────────

export async function fetchAllMediaLibraryItems(): Promise<{
  media: StoredMediaAssetDoc[];
  payloadMap: Record<string, StoredMediaPayloadDoc>;
}> {
  const path = 'media';
  try {
    const [mediaSnap, payloadSnap] = await Promise.all([
      getDocs(query(collection(db, 'media'), orderBy('createdAt', 'desc'), limit(200))),
      getDocs(query(collection(db, 'mediaPayloads'), limit(200))),
    ]);

    const media = mediaSnap.docs.map((d) => {
      const item = { id: d.id, ...(d.data() as Omit<StoredMediaAssetDoc, 'id'>) };
      mediaAssetCache.set(d.id, item);
      return item;
    });

    const payloadMap: Record<string, StoredMediaPayloadDoc> = {};
    for (const p of payloadSnap.docs) {
      const pItem = { id: p.id, ...(p.data() as Omit<StoredMediaPayloadDoc, 'id'>) };
      payloadMap[p.id] = pItem;
      mediaPayloadCache.set(p.id, pItem);
    }

    return { media, payloadMap };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveCompressedPhotoAsset(params: {
  mediaId: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/webp' | 'image/png';
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  credit: string;
  usageRightsConfirmed: boolean;
  captions: string;
  isPublic: boolean;
  expiresAtMs?: number | null;
  associatedArticleIds?: string[];
  isUpdate?: boolean;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Authentication required.');
  const safeId = safeDocId(params.mediaId, 'img');
  const expiresAtTs =
    typeof params.expiresAtMs === 'number' && Number.isFinite(params.expiresAtMs)
      ? Timestamp.fromMillis(params.expiresAtMs)
      : null;

  try {
    if (params.isUpdate) {
      await updateDoc(doc(db, 'media', safeId), {
        fileName: params.fileName.slice(0, 200),
        mediaType: params.mimeType,
        width: params.width,
        height: params.height,
        sizeBytes: params.sizeBytes,
        credit: params.credit.slice(0, 200),
        usageRightsConfirmed: params.usageRightsConfirmed,
        isPublic: params.isPublic,
        expiresAtMs: params.expiresAtMs ?? null,
        expiresAt: expiresAtTs,
        captions: params.captions.slice(0, 4000),
        associatedArticleIds: params.associatedArticleIds ?? [],
        updatedAt: serverTimestamp(),
      });
      const existingPayloadSnap = await getDoc(doc(db, 'mediaPayloads', safeId));
      if (existingPayloadSnap.exists()) {
        await updateDoc(doc(db, 'mediaPayloads', safeId), {
          mimeType: params.mimeType,
          sizeBytes: params.sizeBytes,
          dataUrl: params.dataUrl,
          isPublic: params.isPublic,
          expiresAt: expiresAtTs,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'mediaPayloads', safeId), {
          mediaId: safeId,
          mimeType: params.mimeType,
          sizeBytes: params.sizeBytes,
          dataUrl: params.dataUrl,
          isPublic: params.isPublic,
          expiresAt: expiresAtTs,
          uploadedByUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      await setDoc(doc(db, 'media', safeId), {
        fileName: params.fileName.slice(0, 200),
        storagePath: `firestore:mediaPayloads/${safeId}`,
        mediaType: params.mimeType,
        width: params.width,
        height: params.height,
        sizeBytes: params.sizeBytes,
        credit: params.credit.slice(0, 200),
        usageRightsConfirmed: params.usageRightsConfirmed,
        isPublic: params.isPublic,
        expiresAtMs: params.expiresAtMs ?? null,
        expiresAt: expiresAtTs,
        captions: params.captions.slice(0, 4000),
        associatedArticleIds: params.associatedArticleIds ?? [],
        uploadedByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'mediaPayloads', safeId), {
        mediaId: safeId,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
        dataUrl: params.dataUrl,
        isPublic: params.isPublic,
        expiresAt: expiresAtTs,
        uploadedByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    clearSessionMediaCache(safeId);
    await writeAuditLog({
      action: 'media_upload',
      entityType: 'media',
      entityId: safeId,
      nextStatus: params.isPublic ? 'Public' : 'Private',
      summary: `Uploaded compressed photograph ${params.fileName} (${Math.round(params.sizeBytes / 1024)} KB)`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `media/${safeId}`);
  }
}

export async function saveYouTubeMediaAsset(params: {
  mediaId: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  title: string;
  credit: string;
  usageRightsConfirmed: boolean;
  isPublic: boolean;
  expiresAtMs?: number | null;
  associatedArticleIds?: string[];
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Authentication required.');
  const safeId = safeDocId(params.mediaId, 'yt');
  const expiresAtTs =
    typeof params.expiresAtMs === 'number' && Number.isFinite(params.expiresAtMs)
      ? Timestamp.fromMillis(params.expiresAtMs)
      : null;

  const mediaRef = doc(db, 'media', safeId);
  const existingSnap = await getDoc(mediaRef);
  const existingData = existingSnap.exists()
    ? (existingSnap.data() as { associatedArticleIds?: string[] })
    : undefined;
  const mergedAssociatedIds = [
    ...new Set([
      ...(existingData?.associatedArticleIds ?? []),
      ...(params.associatedArticleIds ?? []),
    ].filter(Boolean)),
  ].slice(0, 50);

  if (existingSnap.exists()) {
    await updateDoc(mediaRef, {
      fileName: `youtube-${params.youtubeVideoId}`.slice(0, 200),
      storagePath: `youtube:${params.youtubeVideoId}`,
      mediaType: 'video/youtube',
      youtubeVideoId: params.youtubeVideoId,
      youtubeUrl: params.youtubeUrl,
      poster: `https://i.ytimg.com/vi/${params.youtubeVideoId}/hqdefault.jpg`,
      captions: params.title.slice(0, 4000),
      credit: params.credit.slice(0, 200),
      usageRightsConfirmed: params.usageRightsConfirmed,
      isPublic: params.isPublic,
      expiresAtMs: params.expiresAtMs ?? null,
      expiresAt: expiresAtTs,
      associatedArticleIds: mergedAssociatedIds,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(mediaRef, {
      fileName: `youtube-${params.youtubeVideoId}`.slice(0, 200),
      storagePath: `youtube:${params.youtubeVideoId}`,
      mediaType: 'video/youtube',
      youtubeVideoId: params.youtubeVideoId,
      youtubeUrl: params.youtubeUrl,
      poster: `https://i.ytimg.com/vi/${params.youtubeVideoId}/hqdefault.jpg`,
      captions: params.title.slice(0, 4000),
      credit: params.credit.slice(0, 200),
      usageRightsConfirmed: params.usageRightsConfirmed,
      isPublic: params.isPublic,
      expiresAtMs: params.expiresAtMs ?? null,
      expiresAt: expiresAtTs,
      associatedArticleIds: mergedAssociatedIds,
      uploadedByUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  clearSessionMediaCache(safeId);
  await writeAuditLog({
    action: 'media_upload',
    entityType: 'media',
    entityId: safeId,
    nextStatus: params.isPublic ? 'Public' : 'Private',
    summary: `Linked YouTube video ${params.youtubeVideoId}: ${params.title.slice(0, 100)}`,
  });
}

export async function deleteMediaAssetSafely(
  mediaId: string,
  allArticles: StoredArticleDoc[],
): Promise<{ deleted: boolean; reason?: string }> {
  const safeId = safeDocId(mediaId, 'med');
  const check = canSafelyDeleteMediaAsset(safeId, allArticles);
  if (!check.canDelete) {
    return {
      deleted: false,
      reason: `Cannot delete media while referenced by ${check.remainingArticleIds.length} active or retained article(s).`,
    };
  }
  await deleteDoc(doc(db, 'mediaPayloads', safeId));
  await deleteDoc(doc(db, 'media', safeId));
  clearSessionMediaCache(safeId);
  await writeAuditLog({
    action: 'media_delete',
    entityType: 'media',
    entityId: safeId,
    nextStatus: 'Deleted',
    summary: `Deleted unreferenced media asset ${safeId}`,
  });
  return { deleted: true };
}

// Legacy helper kept for backward compatibility
export async function recordMediaMetadata(input: {
  mediaId: string;
  fileName: string;
  storagePath: string;
  mediaType: 'video/mp4' | 'video/youtube' | 'image/png' | 'image/jpeg' | 'image/webp';
  duration: number;
  width: number;
  height: number;
  captions: string;
  transcript: string;
  associatedArticleId: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  const safeId = safeDocId(input.mediaId, 'med');
  const path = `media/${safeId}`;
  try {
    const mediaRef = doc(db, 'media', safeId);
    const existingSnap = await getDoc(mediaRef);
    const cleanPayload = {
      fileName: input.fileName.slice(0, 200),
      storagePath: input.storagePath.slice(0, 300),
      mediaType: input.mediaType,
      duration: input.duration,
      width: input.width,
      height: input.height,
      captions: input.captions.slice(0, 4000),
      transcript: input.transcript.slice(0, 10000),
      associatedArticleId: input.associatedArticleId.slice(0, 128),
    };
    if (existingSnap.exists()) {
      await updateDoc(mediaRef, {
        ...cleanPayload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(mediaRef, {
        ...cleanPayload,
        uploadedByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ─── PAID PUBLICATIONS (PRIVATE COLLECTION) ───────────────────────────────────

export async function fetchPaidCampaigns(): Promise<PaidCampaignRecord[]> {
  const path = 'paidCampaigns';
  try {
    const q = query(collection(db, path), orderBy('updatedAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<PaidCampaignRecord, 'id'>),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function savePaidCampaign(
  campaign: Omit<PaidCampaignRecord, 'createdByUid' | 'createdAt' | 'updatedAt'>,
  isNew: boolean,
  expectedUpdatedAtMs?: number | null,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  const safeId = safeDocId(campaign.id, 'paid');
  const campaignRef = doc(db, 'paidCampaigns', safeId);
  const cleanData = stripUndefined({
    clientName: campaign.clientName.trim().slice(0, 160),
    articleId: campaign.articleId?.trim() || undefined,
    articleTitle: campaign.articleTitle?.trim().slice(0, 260) || undefined,
    startDate: campaign.startDate?.trim() || undefined,
    endDate: campaign.endDate?.trim() || undefined,
    durationHours: campaign.durationHours,
    placementPreference: campaign.placementPreference?.trim().slice(0, 120) || undefined,
    internalStatus: campaign.internalStatus,
    disclosureEnabled: campaign.disclosureEnabled,
    disclosureLabel: campaign.disclosureLabel?.trim().slice(0, 64) || 'Partner Disclosure',
    commercialNotes: campaign.commercialNotes?.trim().slice(0, 4000) || undefined,
  });

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(campaignRef);
    if (isNew) {
      if (snap.exists()) {
        throw new ConflictError(`Conflict detected: Campaign "${safeId}" already exists. Refresh Data before retrying.`);
      }
      tx.set(campaignRef, {
        ...cleanData,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      if (!snap.exists()) {
        throw new ConflictError('Conflict detected: This paid campaign record no longer exists.');
      }
      const cur = snap.data() as Record<string, unknown>;
      assertDocumentVersionUnchanged({
        entityLabel: 'paid campaign',
        expectedUpdatedAtMs,
        currentUpdatedAt: cur.updatedAt,
      });
      tx.update(campaignRef, {
        ...cleanData,
        updatedAt: serverTimestamp(),
      });
    }
  });

  await writeAuditLog({
    action: 'paid_update',
    entityType: 'paidCampaign',
    entityId: safeId,
    nextStatus: campaign.internalStatus,
    summary: `Saved paid campaign for ${campaign.clientName} (${campaign.internalStatus})`,
  });
}

// ─── IPO CALENDAR & OFFICIAL SOURCE REVIEWS ───────────────────────────────────

export async function fetchPublicVerifiedIpos(): Promise<IpoRow[]> {
  try {
    const q = query(
      collection(db, 'ipos'),
      where('verificationStatus', '==', 'verified'),
      limit(60),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) =>
      mapManagedIpoToPublicRow({
        id: d.id,
        ...(d.data() as Omit<ManagedIpoRecord, 'id'>),
      }),
    );
  } catch {
    return [];
  }
}

export async function fetchAllManagedIpos(): Promise<ManagedIpoRecord[]> {
  const path = 'ipos';
  try {
    const q = query(collection(db, path), orderBy('updatedAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<ManagedIpoRecord, 'id'>),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveManagedIpoRecord(
  record: Omit<ManagedIpoRecord, 'updatedByUid' | 'createdAt' | 'updatedAt'>,
  isNew: boolean,
  expectedUpdatedAtMs?: number | null,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  const safeId = safeDocId(record.id, 'ipo');
  const ipoRef = doc(db, 'ipos', safeId);
  const computedStatus = calculateIpoStatusFromDates({
    openingDate: record.openingDate,
    closingDate: record.closingDate,
    listingDate: record.listingDate,
    verificationStatus: record.verificationStatus,
  });

  const safeSlug = sanitizeArticleSlug(record.slug || record.companyName, 'ipo');
  const uniqueDocs = [...new Set((record.officialDocuments ?? []).map((u) => u.trim()).filter(Boolean))].slice(0, 6);

  const cleanData = stripUndefined({
    companyName: record.companyName.trim().slice(0, 160),
    slug: safeSlug,
    segment: record.segment,
    status: computedStatus,
    issueSize: record.issueSize?.trim() || undefined,
    priceBand: record.priceBand?.trim() || undefined,
    lotSize: record.lotSize?.trim() || undefined,
    filingDate: record.filingDate?.trim() || undefined,
    openingDate: record.openingDate?.trim() || undefined,
    closingDate: record.closingDate?.trim() || undefined,
    allotmentDate: record.allotmentDate?.trim() || undefined,
    listingDate: record.listingDate?.trim() || undefined,
    sellingShareholder: record.sellingShareholder?.trim() || undefined,
    offerType: record.offerType?.trim() || undefined,
    summary: record.summary?.trim().slice(0, 2000) || undefined,
    officialDocuments: uniqueDocs,
    sourceName: record.sourceName?.trim() || undefined,
    sourceUrl: record.sourceUrl?.trim() || undefined,
    verificationStatus: record.verificationStatus,
    lastVerifiedAt:
      record.verificationStatus === 'verified'
        ? record.lastVerifiedAt || new Date().toISOString()
        : record.lastVerifiedAt,
    updatedByUid: user.uid,
  });

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ipoRef);
    if (isNew) {
      if (snap.exists()) {
        throw new ConflictError(`Conflict detected: IPO dossier "${safeId}" already exists. Refresh Data before retrying.`);
      }
      tx.set(ipoRef, {
        ...cleanData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      if (!snap.exists()) {
        throw new ConflictError('Conflict detected: This IPO dossier no longer exists in Firestore.');
      }
      const cur = snap.data() as Record<string, unknown>;
      assertDocumentVersionUnchanged({
        entityLabel: 'IPO dossier',
        expectedUpdatedAtMs,
        currentUpdatedAt: cur.updatedAt,
      });
      tx.update(ipoRef, {
        ...cleanData,
        updatedAt: serverTimestamp(),
      });
    }
  });

  await writeAuditLog({
    action: isNew ? 'create_draft' : 'update',
    entityType: 'ipo',
    entityId: safeId,
    nextStatus: computedStatus,
    summary: `Saved IPO dossier: ${record.companyName} (${computedStatus})`,
  });
}

export async function fetchIpoSourceReviews(): Promise<IpoSourceReviewRecord[]> {
  const path = 'ipoSourceReviews';
  try {
    const q = query(collection(db, path), orderBy('updatedAt', 'desc'), limit(80));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<IpoSourceReviewRecord, 'id'>),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveIpoSourceReview(
  review: Omit<IpoSourceReviewRecord, 'createdByUid' | 'createdAt' | 'updatedAt'>,
  isNew: boolean,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  const safeId = safeDocId(review.id, 'rev');
  const cleanData = stripUndefined({
    companyName: review.companyName.trim().slice(0, 160),
    targetIpoId: review.targetIpoId,
    segment: review.segment,
    reviewStatus: review.reviewStatus,
    sourceName: review.sourceName.trim().slice(0, 160),
    sourceUrl: review.sourceUrl?.trim().slice(0, 500) || undefined,
    checkedAt: review.checkedAt,
    diffs: review.diffs.slice(0, 15),
    detectedSummary: review.detectedSummary?.slice(0, 1200),
    reviewedByUid: review.reviewedByUid,
    reviewedByEmail: review.reviewedByEmail,
    reviewedAt: review.reviewedAt,
  });

  if (isNew) {
    await setDoc(doc(db, 'ipoSourceReviews', safeId), {
      ...cleanData,
      createdByUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(doc(db, 'ipoSourceReviews', safeId), {
      ...cleanData,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function resolveIpoSourceReview(params: {
  review: IpoSourceReviewRecord;
  decision: 'Approved' | 'Rejected';
  overrideUpdates?: Partial<ManagedIpoRecord>;
  existingIpos: ManagedIpoRecord[];
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Authentication required.');
  const nowIso = new Date().toISOString();
  const safeReviewId = safeDocId(params.review.id, 'rev');
  const revRef = doc(db, 'ipoSourceReviews', safeReviewId);

  const matchedHint =
    (params.review.targetIpoId
      ? params.existingIpos.find((i) => i.id === params.review.targetIpoId)
      : undefined) ?? findMatchingManagedIpo(params.existingIpos, params.review.companyName);

  const baseId = safeDocId(
    matchedHint?.id ?? `ipo_${params.review.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    'ipo',
  );
  const ipoRef = doc(db, 'ipos', baseId);

  const appliedFields: Record<string, string> = {};
  const extraOfficialDocs: string[] = [];
  for (const diff of params.review.diffs) {
    if (diff.field === 'officialDocument' && diff.detectedValue && /^https?:\/\//i.test(diff.detectedValue)) {
      extraOfficialDocs.push(diff.detectedValue.trim());
    } else if (diff.detectedValue && diff.detectedValue !== 'Not announced') {
      appliedFields[diff.field] = diff.detectedValue;
    }
  }

  await runTransaction(db, async (tx) => {
    const revSnap = await tx.get(revRef);
    if (!revSnap.exists()) {
      throw new ConflictError('This IPO review item no longer exists in Firestore. Refresh Data to sync.');
    }
    const latestReview = revSnap.data() as { reviewStatus?: string };
    assertReviewPendingResolution(latestReview.reviewStatus, params.review.companyName);

    let ipoSnap = null;
    if (params.decision === 'Approved') {
      ipoSnap = await tx.get(ipoRef);
    }

    if (params.decision === 'Approved') {
      const existingTarget = ipoSnap?.exists()
        ? ({ id: ipoSnap.id, ...(ipoSnap.data() as Omit<ManagedIpoRecord, 'id'>) })
        : matchedHint;
      const slug = existingTarget?.slug ?? sanitizeArticleSlug(params.review.companyName, 'ipo');
      const mergedDocs = [
        ...new Set(
          [
            ...(existingTarget?.officialDocuments ?? []),
            ...extraOfficialDocs,
            ...(params.review.sourceUrl ? [params.review.sourceUrl.trim()] : []),
          ].filter(Boolean),
        ),
      ].slice(0, 6);

      const merged = {
        companyName: (existingTarget?.companyName ?? params.review.companyName).trim().slice(0, 160),
        slug: sanitizeArticleSlug(slug, 'ipo'),
        segment:
          (appliedFields.segment as 'Mainboard' | 'SME') ||
          existingTarget?.segment ||
          params.review.segment,
        issueSize: (appliedFields.issueSize ?? existingTarget?.issueSize)?.trim() || undefined,
        priceBand: (appliedFields.priceBand ?? existingTarget?.priceBand)?.trim() || undefined,
        lotSize: (appliedFields.lotSize ?? existingTarget?.lotSize)?.trim() || undefined,
        filingDate: (appliedFields.filingDate ?? existingTarget?.filingDate)?.trim() || undefined,
        openingDate: (appliedFields.openingDate ?? existingTarget?.openingDate)?.trim() || undefined,
        closingDate: (appliedFields.closingDate ?? existingTarget?.closingDate)?.trim() || undefined,
        allotmentDate: existingTarget?.allotmentDate?.trim() || undefined,
        listingDate: (appliedFields.listingDate ?? existingTarget?.listingDate)?.trim() || undefined,
        sellingShareholder: existingTarget?.sellingShareholder?.trim() || undefined,
        offerType: existingTarget?.offerType?.trim() || undefined,
        summary: (existingTarget?.summary || params.review.detectedSummary)?.trim().slice(0, 2000) || undefined,
        officialDocuments: mergedDocs,
        sourceName: (existingTarget?.sourceName || params.review.sourceName)?.trim() || undefined,
        sourceUrl: (params.review.sourceUrl ?? existingTarget?.sourceUrl)?.trim() || undefined,
        verificationStatus: 'verified' as const,
        lastVerifiedAt: nowIso,
        ...params.overrideUpdates,
      };
      const computedStatus = calculateIpoStatusFromDates({
        openingDate: merged.openingDate,
        closingDate: merged.closingDate,
        listingDate: merged.listingDate,
        verificationStatus: merged.verificationStatus,
      });
      const cleanIpoData = stripUndefined({
        ...merged,
        status: computedStatus,
        updatedByUid: user.uid,
      });

      if (ipoSnap?.exists()) {
        tx.update(ipoRef, {
          ...cleanIpoData,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(ipoRef, {
          ...cleanIpoData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    const cleanRevUpdate = stripUndefined({
      reviewStatus: params.decision,
      reviewedByUid: user.uid,
      reviewedByEmail: user.email,
      reviewedAt: nowIso,
      updatedAt: serverTimestamp(),
    });
    tx.update(revRef, cleanRevUpdate);
  });

  await writeAuditLog({
    action: params.decision === 'Approved' ? 'ipo_review_approve' : 'ipo_review_reject',
    entityType: 'ipoReview',
    entityId: safeReviewId,
    previousStatus: 'Needs Review',
    nextStatus: params.decision,
    summary: `${params.decision} official SEBI source review for ${params.review.companyName}`,
  });
}

export interface SebiPortalStatusReport {
  portalId: 'sebi';
  portalName: string;
  url: string;
  status: 'reachable' | 'blocked' | 'unavailable' | 'structure_changed';
  httpStatus?: number;
  pagesChecked?: number;
  totalRowsParsed?: number;
  message: string;
}

export interface SebiCheckQueueResult {
  checkedAt: string;
  cached: boolean;
  portals: SebiPortalStatusReport[];
  policyNote: string;
  candidatesCount: number;
  queuedCount: number;
  skippedDuplicateCount: number;
}

export async function runOfficialSebiSourceCheckAndQueue(params: {
  forceRefresh?: boolean;
  existingIpos: ManagedIpoRecord[];
  existingReviews: IpoSourceReviewRecord[];
}): Promise<SebiCheckQueueResult> {
  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    throw new Error('Authentication token unavailable. Refresh your session and try again.');
  }

  const res = await fetch('/api/ipo-sources/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ forceRefresh: Boolean(params.forceRefresh) }),
  });

  const body = (await res.json()) as {
    checkedAt?: string;
    cached?: boolean;
    portals?: SebiPortalStatusReport[];
    candidates?: DetectedIpoCandidate[];
    policyNote?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error || `Official SEBI check returned HTTP ${res.status}`);
  }

  const portals = body.portals ?? [];
  const candidates = body.candidates ?? [];
  const checkedAt = body.checkedAt || new Date().toISOString();

  // Pull fresh authoritative Firestore state right before diffing/queuing to minimize cross-operator duplicates
  const [freshIpos, freshReviews] = await Promise.all([
    fetchAllManagedIpos().catch(() => params.existingIpos),
    fetchIpoSourceReviews().catch(() => params.existingReviews),
  ]);

  let queuedCount = 0;
  let skippedDuplicateCount = 0;
  const workingReviews = [...freshReviews];

  for (const cand of candidates) {
    const existingIpo = findMatchingManagedIpo(freshIpos, cand.companyName);
    const diffs = detectIpoFieldDiffs(existingIpo, cand);
    if (diffs.length === 0) continue;

    if (hasDuplicateIpoReview(workingReviews, cand.companyName, diffs)) {
      skippedDuplicateCount++;
      continue;
    }

    const revId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const nextReview: Omit<IpoSourceReviewRecord, 'createdByUid' | 'createdAt' | 'updatedAt'> = {
      id: revId,
      companyName: cand.companyName,
      targetIpoId: existingIpo?.id,
      segment: cand.segment,
      reviewStatus: 'Needs Review',
      sourceName: cand.sourceName,
      sourceUrl: cand.sourceUrl,
      checkedAt,
      diffs,
      detectedSummary: cand.summary,
    };

    await saveIpoSourceReview(nextReview, true);
    workingReviews.push({ ...nextReview, createdByUid: auth.currentUser?.uid || '' });
    queuedCount++;
  }

  const sebiStatus = portals[0]?.status ?? 'unavailable';
  await writeAuditLog({
    action: 'ipo_source_check',
    entityType: 'ipoReview',
    entityId: `chk_${Date.now()}`,
    nextStatus: sebiStatus,
    summary: `Checked Official SEBI Public Issues (${sebiStatus}): ${candidates.length} candidate(s), ${queuedCount} queued Needs Review, ${skippedDuplicateCount} duplicate(s) skipped.`,
  });

  return {
    checkedAt,
    cached: Boolean(body.cached),
    portals,
    policyNote: body.policyNote || '',
    candidatesCount: candidates.length,
    queuedCount,
    skippedDuplicateCount,
  };
}

// ─── OWNER-ONLY PERMISSIONS, SETTINGS & BACKUP / RESTORE ──────────────────────

export async function fetchAuthorizedEmails(): Promise<AuthorizedEmailRecord[]> {
  const snap = await getDocs(collection(db, 'authorizedEmails'));
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<AuthorizedEmailRecord, 'id'>),
  }));
}

export async function upsertAuthorizedEmail(params: {
  email: string;
  displayName: string;
  role: 'owner' | 'publisher';
  active: boolean;
  isNew: boolean;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  const emailLower = normalizeEmailKey(params.email);

  if (params.isNew) {
    await setDoc(doc(db, 'authorizedEmails', emailLower), {
      email: emailLower,
      displayName: params.displayName.trim().slice(0, 120),
      role: params.role,
      active: params.active,
      addedByUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(doc(db, 'authorizedEmails', emailLower), {
      email: emailLower,
      displayName: params.displayName.trim().slice(0, 120),
      role: params.role,
      active: params.active,
      updatedAt: serverTimestamp(),
    });
  }

  await writeAuditLog({
    action: 'permission_update',
    entityType: 'system',
    entityId: emailLower.replace(/[^a-zA-Z0-9_-]/g, '_'),
    nextStatus: params.active ? params.role : 'Disabled',
    summary: `${params.active ? 'Authorized' : 'Disabled'} ${params.role} email ${emailLower}`,
  });
}

export async function fetchAdminUsers(): Promise<AdminUserRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'admins'));
    return snap.docs.map((d) => d.data() as AdminUserRecord);
  } catch {
    return [];
  }
}

export async function updateAdminUserRole(
  targetUser: AdminUserRecord,
  nextRole: 'owner' | 'publisher',
): Promise<void> {
  await updateDoc(doc(db, 'admins', safeDocId(targetUser.uid, 'usr')), {
    role: nextRole,
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog({
    action: 'permission_update',
    entityType: 'system',
    entityId: targetUser.uid,
    previousStatus: targetUser.role,
    nextStatus: nextRole,
    summary: `Updated operator role for ${targetUser.email} to ${nextRole}`,
  });
}

export async function fetchSystemSettings(): Promise<SystemSettingsRecord> {
  const fallback: SystemSettingsRecord = {
    key: 'global',
    defaultDurationPreset: '15d',
    expiringSoonThresholdHours: 48,
    maxImageSizeBytes: 180_000,
    requireBilingualPublish: true,
    updatedByUid: 'system',
  };
  try {
    const snap = await getDoc(doc(db, 'systemSettings', 'global'));
    if (!snap.exists()) return fallback;
    return {
      ...fallback,
      ...(snap.data() as Partial<SystemSettingsRecord>),
    };
  } catch {
    return fallback;
  }
}

export async function saveSystemSettings(
  settings: Omit<SystemSettingsRecord, 'key' | 'updatedByUid' | 'updatedAt'>,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  await setDoc(doc(db, 'systemSettings', 'global'), {
    key: 'global',
    defaultDurationPreset: settings.defaultDurationPreset,
    expiringSoonThresholdHours: settings.expiringSoonThresholdHours,
    maxImageSizeBytes: settings.maxImageSizeBytes,
    requireBilingualPublish: settings.requireBilingualPublish,
    updatedByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog({
    action: 'permission_update',
    entityType: 'system',
    entityId: 'global',
    nextStatus: 'SettingsSaved',
    summary: `Updated global newsroom defaults (${settings.defaultDurationPreset}, alert ${settings.expiringSoonThresholdHours}h)`,
  });
}

export async function exportFullBackupBundle(role: AdminRole): Promise<SakarBazaarBackupBundle> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Authentication required.');

  const [articles, mediaAndPayloads, paidCampaigns, ipos, ipoSourceReviews, auditLogs, globalSetting] =
    await Promise.all([
      fetchAllStoredArticles(),
      fetchAllMediaLibraryItems(),
      fetchPaidCampaigns(),
      fetchAllManagedIpos(),
      fetchIpoSourceReviews(),
      fetchRecentAuditLogs(200),
      fetchSystemSettings(),
    ]);

  let authorizedEmails: AuthorizedEmailRecord[] = [];
  if (role === 'owner') {
    try {
      authorizedEmails = await fetchAuthorizedEmails();
    } catch {
      authorizedEmails = [];
    }
  }

  const payloadDocs = Object.values(mediaAndPayloads.payloadMap);
  const bundle = buildSakarBazaarBackupBundle({
    exportedByUid: user.uid,
    exportedByEmail: user.email,
    articles,
    media: mediaAndPayloads.media,
    mediaPayloads: payloadDocs,
    paidCampaigns,
    ipos,
    ipoSourceReviews,
    auditLogs,
    authorizedEmails,
    systemSettings: [globalSetting],
  });

  await writeAuditLog({
    action: 'export_backup',
    entityType: 'backup',
    entityId: `bak_${Date.now()}`,
    nextStatus: 'Exported',
    summary: `Exported backup bundle (${articles.length} articles, ${payloadDocs.length} photo payloads, ${ipos.length} IPOs)`,
  });

  return bundle;
}

export async function restoreBackupBundleToFirestore(
  bundle: SakarBazaarBackupBundle,
): Promise<{ restoredCount: number }> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Authentication required.');
  const validation = validateBackupBundle(bundle);
  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }

  let restoredCount = 0;

  for (const art of bundle.data.articles) {
    const safeId = safeDocId(art.id, 'art');
    const ref = doc(db, 'articles', safeId);
    const existingSnap = await getDoc(ref);
    const isExisting = existingSnap.exists();
    const base = prepareRestoredArticlePayload(art, user.uid, isExisting);
    const expiresAt =
      typeof art.expiresAtMs === 'number' && Number.isFinite(art.expiresAtMs)
        ? Timestamp.fromMillis(art.expiresAtMs)
        : null;
    if (isExisting) {
      await updateDoc(ref, {
        ...base,
        expiresAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...base,
        expiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    restoredCount++;
  }

  const mediaExpiryById = new Map<string, number | null>();
  for (const med of bundle.data.media) {
    const safeId = safeDocId(med.id, 'med');
    const medExpiryMs =
      typeof med.expiresAtMs === 'number' && Number.isFinite(med.expiresAtMs) ? med.expiresAtMs : null;
    mediaExpiryById.set(safeId, medExpiryMs);
    const ref = doc(db, 'media', safeId);
    const existingSnap = await getDoc(ref);
    const isExisting = existingSnap.exists();
    const base = prepareRestoredMediaPayload(med, user.uid, isExisting);
    const expiresAt = medExpiryMs !== null ? Timestamp.fromMillis(medExpiryMs) : null;
    if (isExisting) {
      await updateDoc(ref, {
        ...base,
        expiresAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...base,
        expiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    restoredCount++;
  }

  for (const pay of bundle.data.mediaPayloads) {
    const safeId = safeDocId(pay.mediaId || pay.id, 'med');
    const matchingExpiryMs = mediaExpiryById.get(safeId) ?? null;
    const ref = doc(db, 'mediaPayloads', safeId);
    const existingSnap = await getDoc(ref);
    const isExisting = existingSnap.exists();
    const base = prepareRestoredMediaBlobPayload(pay, safeId, user.uid, isExisting);
    const expiresAt = matchingExpiryMs !== null ? Timestamp.fromMillis(matchingExpiryMs) : null;
    if (isExisting) {
      await updateDoc(ref, {
        ...base,
        expiresAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...base,
        expiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    restoredCount++;
  }

  for (const camp of bundle.data.paidCampaigns ?? []) {
    const safeId = safeDocId(camp.id, 'paid');
    const ref = doc(db, 'paidCampaigns', safeId);
    const existingSnap = await getDoc(ref);
    const isExisting = existingSnap.exists();
    const base = prepareRestoredPaidCampaignPayload(camp, user.uid, isExisting);
    if (isExisting) {
      await updateDoc(ref, {
        ...base,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...base,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    restoredCount++;
  }

  for (const ipo of bundle.data.ipos ?? []) {
    const safeId = safeDocId(ipo.id, 'ipo');
    const ref = doc(db, 'ipos', safeId);
    const existingSnap = await getDoc(ref);
    const isExisting = existingSnap.exists();
    const base = prepareRestoredIpoPayload(ipo, user.uid);
    if (isExisting) {
      await updateDoc(ref, {
        ...base,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...base,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    restoredCount++;
  }

  clearSessionMediaCache();
  await writeAuditLog({
    action: 'restore_backup',
    entityType: 'backup',
    entityId: `res_${Date.now()}`,
    nextStatus: 'Restored',
    summary: `Owner restored backup bundle (${restoredCount} records across articles, media, payloads, campaigns, IPOs).`,
  });

  return { restoredCount };
}

export async function submitContactNote(input: {
  name: string;
  email: string;
  topic: 'Editorial feedback' | 'Data correction' | 'IPO desk tip' | 'General enquiry';
  message: string;
}): Promise<string> {
  const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `contactSubmissions/${submissionId}`;
  try {
    await setDoc(doc(db, 'contactSubmissions', submissionId), {
      name: input.name.trim(),
      email: input.email.trim(),
      topic: input.topic,
      message: input.message.trim(),
      createdAt: serverTimestamp(),
    });
    return submissionId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}
