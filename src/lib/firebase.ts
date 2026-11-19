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
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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
import { buildSakarBazaarBackupBundle, validateBackupBundle } from '../utils/backupRestore';
import { calculateIpoStatusFromDates, mapManagedIpoToPublicRow } from '../utils/ipoLifecycle';
import {
  canSafelyDeleteMediaAsset,
  computeMediaVisibilityFromArticles,
  parseYouTubeVideoUrl,
} from '../utils/mediaLibrary';
import { isArticleExpired, isArticlePubliclyVisible } from '../utils/newsLifecycle';

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

export async function refreshAuthSessionToken(): Promise<boolean> {
  const current = auth.currentUser;
  if (!current) return false;
  await current.getIdToken(true);
  return true;
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
    // Fall through to allowlisted email check
  }

  try {
    const allowSnap = await getDoc(doc(db, 'authorizedEmails', emailLower));
    if (allowSnap.exists()) {
      const data = allowSnap.data();
      if (data.active === true) {
        const adminRole = normalizeAdminRole(String(data.role ?? 'publisher'), user.email);
        if (adminRole !== 'none') {
          // Auto-bootstrap /admins/{uid} doc per firestore.rules
          try {
            await setDoc(doc(db, 'admins', user.uid), {
              uid: user.uid,
              email: emailLower,
              displayName: (user.displayName || String(data.displayName || 'SakarBazaar Publisher')).slice(0, 120),
              role: adminRole,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
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

export async function fetchPublishedEditorialArticles(): Promise<ArticleRecord[]> {
  try {
    const q = query(
      collection(db, 'articles'),
      where('status', '==', 'Published'),
      limit(40),
    );
    const snap = await getDocs(q);
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
  const expiresAtMs =
    typeof rawPayload.expiresAtMs === 'number' && Number.isFinite(rawPayload.expiresAtMs)
      ? rawPayload.expiresAtMs
      : null;

  try {
    const baseData = stripUndefined({
      ...rawPayload,
      expiresAtMs,
      expiresAt: expiresAtMs !== null ? Timestamp.fromMillis(expiresAtMs) : null,
      updatedByUid: user.uid,
    });

    if (params.isNew) {
      await setDoc(doc(db, 'articles', safeId), {
        ...baseData,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      delete baseData.createdByUid;
      delete baseData.createdAt;
      await updateDoc(doc(db, 'articles', safeId), {
        ...baseData,
        updatedAt: serverTimestamp(),
      });
    }

    await writeAuditLog({
      action: params.action,
      entityType: 'article',
      entityId: safeId,
      previousStatus: params.previousStatus,
      nextStatus: String(rawPayload.status ?? 'Updated'),
      summary: `${params.action}: ${String(rawPayload.enHeadline || rawPayload.title || safeId).slice(0, 140)}`,
    });
  } catch (err) {
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
  for (const ch of changes) {
    await updateDoc(doc(db, 'articles', safeDocId(ch.id, 'art')), {
      featuredPlacement: ch.featuredPlacement ?? 'none',
      featuredOrder: ch.featuredOrder,
      updatedByUid: user.uid,
      updatedAt: serverTimestamp(),
    });
  }
  if (changes.length > 0) {
    await writeAuditLog({
      action: 'update',
      entityType: 'article',
      entityId: changes[0].id,
      nextStatus: 'FeaturedUpdated',
      summary: `Updated featured homepage placement for ${changes.length} article(s).`,
    });
  }
}

export async function approveArticleForPermanentDeletion(article: StoredArticleDoc): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Authentication required.');
  const safeId = safeDocId(article.id, 'art');

  await updateDoc(doc(db, 'articles', safeId), {
    status: 'Pending Deletion',
    deletionStatus: 'approved',
    deletionApprovedByUid: user.uid,
    deletionApprovedByEmail: user.email,
    deletionApprovedAtMs: Date.now(),
    deletionError: '',
    updatedByUid: user.uid,
    updatedAt: serverTimestamp(),
  });

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

  await updateDoc(doc(db, 'articles', safeId), {
    status: 'Retained',
    retainedPrivate: true,
    deletionStatus: 'none',
    deletionError: '',
    updatedByUid: user.uid,
    updatedAt: serverTimestamp(),
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
 * Executes permanent deletion safely with partial-failure tracking:
 * 1. Marks 'Deletion In Progress'
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
  const isRetry = article.deletionStatus === 'partial_failure';
  const attempts = (article.deletionAttempts ?? 0) + 1;

  try {
    await updateDoc(doc(db, 'articles', safeId), {
      status: 'Deletion In Progress',
      deletionStatus: 'in_progress',
      deletionAttempts: attempts,
      updatedByUid: user.uid,
      updatedAt: serverTimestamp(),
    });

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

    await deleteDoc(doc(db, 'articles', safeId));

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
    const errMsg = err instanceof Error ? err.message : 'Unknown error during permanent deletion.';
    try {
      await updateDoc(doc(db, 'articles', safeId), {
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

  await setDoc(
    doc(db, 'media', safeId),
    {
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
      associatedArticleIds: params.associatedArticleIds ?? [],
      uploadedByUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

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
    await setDoc(
      doc(db, 'media', safeId),
      {
        ...input,
        uploadedByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
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
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  const safeId = safeDocId(campaign.id, 'paid');
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

  if (isNew) {
    await setDoc(doc(db, 'paidCampaigns', safeId), {
      ...cleanData,
      createdByUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(doc(db, 'paidCampaigns', safeId), {
      ...cleanData,
      updatedAt: serverTimestamp(),
    });
  }

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
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  const safeId = safeDocId(record.id, 'ipo');
  const computedStatus = calculateIpoStatusFromDates({
    openingDate: record.openingDate,
    closingDate: record.closingDate,
    listingDate: record.listingDate,
    verificationStatus: record.verificationStatus,
  });

  const cleanData = stripUndefined({
    companyName: record.companyName.trim().slice(0, 160),
    slug: record.slug.trim().toLowerCase().slice(0, 160),
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
    officialDocuments: (record.officialDocuments ?? []).filter(Boolean).slice(0, 6),
    sourceName: record.sourceName?.trim() || undefined,
    sourceUrl: record.sourceUrl?.trim() || undefined,
    verificationStatus: record.verificationStatus,
    lastVerifiedAt:
      record.verificationStatus === 'verified'
        ? record.lastVerifiedAt || new Date().toISOString()
        : record.lastVerifiedAt,
    updatedByUid: user.uid,
  });

  if (isNew) {
    await setDoc(doc(db, 'ipos', safeId), {
      ...cleanData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(doc(db, 'ipos', safeId), {
      ...cleanData,
      updatedAt: serverTimestamp(),
    });
  }

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

  if (params.decision === 'Approved') {
    const existingTarget = params.review.targetIpoId
      ? params.existingIpos.find((i) => i.id === params.review.targetIpoId)
      : params.existingIpos.find(
          (i) => i.companyName.toLowerCase() === params.review.companyName.toLowerCase(),
        );

    const appliedFields: Record<string, string> = {};
    for (const diff of params.review.diffs) {
      if (diff.detectedValue && diff.detectedValue !== 'Not announced') {
        appliedFields[diff.field] = diff.detectedValue;
      }
    }

    const baseId =
      existingTarget?.id ??
      safeDocId(
        `ipo_${params.review.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        'ipo',
      );
    const slug =
      existingTarget?.slug ??
      (params.review.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || `ipo-${Date.now()}`);

    const merged: Omit<ManagedIpoRecord, 'updatedByUid' | 'createdAt' | 'updatedAt'> = {
      id: baseId,
      companyName: existingTarget?.companyName ?? params.review.companyName,
      slug,
      segment: (appliedFields.segment as 'Mainboard' | 'SME') || existingTarget?.segment || params.review.segment,
      status: existingTarget?.status ?? 'Upcoming',
      issueSize: appliedFields.issueSize ?? existingTarget?.issueSize,
      priceBand: appliedFields.priceBand ?? existingTarget?.priceBand,
      lotSize: appliedFields.lotSize ?? existingTarget?.lotSize,
      filingDate: appliedFields.filingDate ?? existingTarget?.filingDate,
      openingDate: appliedFields.openingDate ?? existingTarget?.openingDate,
      closingDate: appliedFields.closingDate ?? existingTarget?.closingDate,
      allotmentDate: existingTarget?.allotmentDate,
      listingDate: appliedFields.listingDate ?? existingTarget?.listingDate,
      sellingShareholder: existingTarget?.sellingShareholder,
      offerType: existingTarget?.offerType,
      summary: existingTarget?.summary ?? params.review.detectedSummary,
      officialDocuments: existingTarget?.officialDocuments ?? (params.review.sourceUrl ? [params.review.sourceUrl] : []),
      sourceName: params.review.sourceName,
      sourceUrl: params.review.sourceUrl ?? existingTarget?.sourceUrl,
      verificationStatus: 'verified',
      lastVerifiedAt: nowIso,
      ...params.overrideUpdates,
    };

    await saveManagedIpoRecord(merged, !existingTarget);
  }

  await saveIpoSourceReview(
    {
      ...params.review,
      reviewStatus: params.decision,
      reviewedByUid: user.uid,
      reviewedByEmail: user.email,
      reviewedAt: nowIso,
    },
    false,
  );

  await writeAuditLog({
    action: params.decision === 'Approved' ? 'ipo_review_approve' : 'ipo_review_reject',
    entityType: 'ipoReview',
    entityId: params.review.id,
    previousStatus: 'Needs Review',
    nextStatus: params.decision,
    summary: `${params.decision} official IPO source review for ${params.review.companyName}`,
  });
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
    const clean = stripUndefined({
      ...art,
      id: undefined,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUid: art.createdByUid || user.uid,
      updatedByUid: user.uid,
      expiresAt:
        typeof art.expiresAtMs === 'number' && Number.isFinite(art.expiresAtMs)
          ? Timestamp.fromMillis(art.expiresAtMs)
          : null,
    });
    await setDoc(doc(db, 'articles', safeId), clean, { merge: true });
    restoredCount++;
  }

  for (const med of bundle.data.media) {
    const safeId = safeDocId(med.id, 'med');
    const clean = stripUndefined({
      ...med,
      id: undefined,
      uploadedByUid: med.uploadedByUid || user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt:
        typeof med.expiresAtMs === 'number' && Number.isFinite(med.expiresAtMs)
          ? Timestamp.fromMillis(med.expiresAtMs)
          : null,
    });
    await setDoc(doc(db, 'media', safeId), clean, { merge: true });
    restoredCount++;
  }

  for (const pay of bundle.data.mediaPayloads) {
    const safeId = safeDocId(pay.mediaId || pay.id, 'med');
    await setDoc(
      doc(db, 'mediaPayloads', safeId),
      {
        mediaId: safeId,
        mimeType: pay.mimeType,
        sizeBytes: pay.sizeBytes,
        dataUrl: pay.dataUrl,
        isPublic: Boolean(pay.isPublic),
        expiresAt: null,
        uploadedByUid: pay.uploadedByUid || user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    restoredCount++;
  }

  for (const camp of bundle.data.paidCampaigns ?? []) {
    const safeId = safeDocId(camp.id, 'paid');
    await setDoc(
      doc(db, 'paidCampaigns', safeId),
      stripUndefined({
        ...camp,
        id: undefined,
        createdByUid: camp.createdByUid || user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      { merge: true },
    );
    restoredCount++;
  }

  for (const ipo of bundle.data.ipos ?? []) {
    const safeId = safeDocId(ipo.id, 'ipo');
    await setDoc(
      doc(db, 'ipos', safeId),
      stripUndefined({
        ...ipo,
        id: undefined,
        updatedByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      { merge: true },
    );
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
