import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
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
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  ArticleRecord,
  EditorialWorkflowStatus,
  NewsCategory,
  VerificationStatus,
} from '../types/sakarbazaar';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAPPED_ADMIN_EMAIL = 'jeetsheetalpuri@gmail.com';

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

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function checkEditorAuthorization(user: User | null): Promise<{
  authorized: boolean;
  role: 'admin' | 'editor' | 'none';
}> {
  if (!user || !user.emailVerified) {
    return { authorized: false, role: 'none' };
  }
  if (user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return { authorized: true, role: 'admin' };
  }
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    if (adminSnap.exists()) {
      const data = adminSnap.data();
      const role = data.role === 'admin' ? 'admin' : 'editor';
      return { authorized: true, role };
    }
  } catch {
    // Non-authorized users are denied on /admins/{uid} read; treat cleanly as unauthorized.
  }
  return { authorized: false, role: 'none' };
}

export interface StoredEditorialArticle {
  id: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
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
  language: 'en' | 'hi';
  createdByUid: string;
  publishedAt?: string;
}

export function mapFirestoreArticleToRecord(docData: StoredEditorialArticle): ArticleRecord {
  const paragraphs = docData.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const ticker =
    docData.entities[0]?.slice(0, 12).toUpperCase() ||
    docData.category.slice(0, 10).toUpperCase();

  return {
    id: docData.id,
    slug: docData.slug,
    category: docData.category,
    company: docData.entities[0] ?? undefined,
    headline: docData.title,
    deck: docData.summary,
    author: docData.author,
    authorRole: 'SakarBazaar Editorial Desk',
    publishedAt: docData.publishedAt || 'Draft / Unscheduled',
    updatedAt: docData.publishedAt || 'Recently updated',
    time: 'Editorial',
    readTime: `${Math.max(2, Math.ceil(docData.body.split(/\s+/).length / 180))} min read`,
    ticker,
    sourceName: docData.sourceName,
    sourceUrl: docData.sourceUrl ?? null,
    sourceNote:
      docData.verificationStatus === 'verified'
        ? `Verified · ${docData.sourceName}`
        : `Awaiting Official Verification · ${docData.sourceName}`,
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
    illustrationCaption: `SakarBazaar editorial illustration for ${docData.title}`,
    tags: docData.tags,
    keywords: docData.keywords,
    entities: docData.entities,
    aliases: [...docData.entities, ...docData.keywords].slice(0, 12),
    keyPoints: paragraphs.slice(0, 3),
    sections: [
      {
        heading: 'Editorial Dispatch',
        paragraphs: paragraphs.length > 0 ? paragraphs : [docData.summary],
      },
    ],
    citations: (docData.officialSources ?? []).map((src, index) => ({
      id: `cit-${docData.id}-${index}`,
      label: 'Official reference',
      portalName: src,
      url: src.startsWith('http') ? src : null,
      note: 'Submitted editorial verification source.',
    })),
    relatedSlugs: [],
    isHomepageFeed: docData.status === 'Published',
  };
}

export async function fetchPublishedEditorialArticles(): Promise<ArticleRecord[]> {
  try {
    const q = query(
      collection(db, 'articles'),
      where('status', '==', 'Published'),
      limit(25),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) =>
      mapFirestoreArticleToRecord({
        id: d.id,
        ...(d.data() as Omit<StoredEditorialArticle, 'id'>),
      }),
    );
  } catch {
    return [];
  }
}

export async function fetchAllEditorArticles(): Promise<StoredEditorialArticle[]> {
  const path = 'articles';
  try {
    const q = query(collection(db, path), orderBy('updatedAt', 'desc'), limit(40));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<StoredEditorialArticle, 'id'>),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchRecentAuditLogs(): Promise<
  Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorEmail: string;
    nextStatus: string;
    summary: string;
  }>
> {
  const path = 'auditLogs';
  try {
    const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        action: String(data.action ?? ''),
        entityType: String(data.entityType ?? ''),
        entityId: String(data.entityId ?? ''),
        actorEmail: String(data.actorEmail ?? ''),
        nextStatus: String(data.nextStatus ?? ''),
        summary: String(data.summary ?? ''),
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
    | 'update';
  payload: Omit<StoredEditorialArticle, 'id'>;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('Authentication required to save editorial records.');
  }
  const articlePath = `articles/${params.articleId}`;
  try {
    if (params.isNew) {
      await setDoc(doc(db, 'articles', params.articleId), {
        ...params.payload,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        doc(db, 'articles', params.articleId),
        {
          ...params.payload,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await setDoc(doc(db, 'auditLogs', logId), {
      action: params.action,
      entityType: 'article',
      entityId: params.articleId,
      actorUid: user.uid,
      actorEmail: user.email,
      ...(params.previousStatus ? { previousStatus: params.previousStatus } : {}),
      nextStatus: params.payload.status,
      summary: `${params.action}: ${params.payload.title.slice(0, 140)}`,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, articlePath);
  }
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

export async function recordMediaMetadata(input: {
  mediaId: string;
  fileName: string;
  storagePath: string;
  mediaType: 'video/mp4' | 'image/png' | 'image/jpeg' | 'image/webp';
  duration: number;
  width: number;
  height: number;
  captions: string;
  transcript: string;
  associatedArticleId: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required.');
  const path = `media/${input.mediaId}`;
  try {
    await setDoc(
      doc(db, 'media', input.mediaId),
      {
        ...input,
        uploadedByUid: user.uid,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
