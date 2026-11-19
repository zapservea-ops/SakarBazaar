import type { ArticleRecord, MediaAssetRecord, StoredArticleDoc, StoredMediaAssetDoc } from '../types/sakarbazaar';

export const MAX_FIRESTORE_IMAGE_RAW_BYTES = 400_000;
export const TARGET_IMAGE_RAW_BYTES = 180_000;
export const MAX_FIRESTORE_DATA_URL_LENGTH = 600_000;
export const SPARK_STORAGE_LIMIT_BYTES = 1_073_741_824; // 1 GiB
export const SPARK_DAILY_READ_QUOTA = 50_000;

export interface ParsedYouTubeVideo {
  videoId: string;
  canonicalUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
}

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Strictly validates and extracts an 11-character YouTube video ID from standard URLs or raw ID.
 * Rejects arbitrary HTML, javascript: schemes, or non-YouTube domains.
 */
export function parseYouTubeVideoUrl(input: string | null | undefined): ParsedYouTubeVideo | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  if (YOUTUBE_ID_REGEX.test(raw)) {
    return buildParsedYouTube(raw);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let candidateId: string | null = null;

  if (host === 'youtu.be') {
    candidateId = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      candidateId = parsed.searchParams.get('v');
    } else {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (
        parts.length >= 2 &&
        (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'v')
      ) {
        candidateId = parts[1];
      }
    }
  } else {
    return null;
  }

  if (!candidateId || !YOUTUBE_ID_REGEX.test(candidateId)) {
    return null;
  }

  return buildParsedYouTube(candidateId);
}

function buildParsedYouTube(videoId: string): ParsedYouTubeVideo {
  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

export function estimateDataUrlByteSize(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl.length;
  const base64 = dataUrl.slice(commaIdx + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function validateCompressedImagePayload(
  dataUrl: string,
  mimeType: string,
): { valid: boolean; sizeBytes: number; error?: string } {
  const cleanMime = mimeType.toLowerCase().trim();
  if (!['image/jpeg', 'image/webp', 'image/png'].includes(cleanMime)) {
    return { valid: false, sizeBytes: 0, error: 'Only JPEG, WebP, or PNG photographs are supported.' };
  }
  if (!dataUrl.startsWith(`data:${cleanMime};base64,`)) {
    return { valid: false, sizeBytes: 0, error: 'Invalid compressed image payload encoding.' };
  }
  const sizeBytes = estimateDataUrlByteSize(dataUrl);
  if (sizeBytes <= 0) {
    return { valid: false, sizeBytes: 0, error: 'Image payload is empty.' };
  }
  if (sizeBytes > MAX_FIRESTORE_IMAGE_RAW_BYTES || dataUrl.length > MAX_FIRESTORE_DATA_URL_LENGTH) {
    return {
      valid: false,
      sizeBytes,
      error: `Compressed photo (${Math.round(sizeBytes / 1024)} KB) exceeds the zero-billing Firestore document safety ceiling (${Math.round(MAX_FIRESTORE_IMAGE_RAW_BYTES / 1024)} KB). Choose a smaller image.`,
    };
  }
  return { valid: true, sizeBytes };
}

/**
 * Browser-side client compression using <canvas> to produce a lightweight <= 180 KB photograph
 * stored separately in /mediaPayloads without Firebase Storage billing.
 */
export async function compressImageFileInBrowser(
  file: File,
  options: { maxWidth?: number; maxHeight?: number; targetBytes?: number } = {},
): Promise<{
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  sizeBytes: number;
}> {
  const maxWidth = options.maxWidth ?? 1280;
  const maxHeight = options.maxHeight ?? 960;
  const targetBytes = options.targetBytes ?? TARGET_IMAGE_RAW_BYTES;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unable to decode selected image file.'));
      el.src = objectUrl;
    });

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    const ratio = Math.min(1, maxWidth / Math.max(1, width), maxHeight / Math.max(1, height));
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas 2D context is unavailable for image compression.');
    }

    let currentWidth = width;
    let currentHeight = height;
    let bestDataUrl = '';
    let bestSize = Infinity;
    const mimeType: 'image/jpeg' | 'image/webp' = 'image/jpeg';

    for (let scaleStep = 0; scaleStep < 3; scaleStep++) {
      canvas.width = currentWidth;
      canvas.height = currentHeight;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, currentWidth, currentHeight);
      ctx.drawImage(img, 0, 0, currentWidth, currentHeight);

      for (const quality of [0.82, 0.7, 0.58, 0.45]) {
        const candidate = canvas.toDataURL(mimeType, quality);
        const bytes = estimateDataUrlByteSize(candidate);
        if (bytes < bestSize) {
          bestDataUrl = candidate;
          bestSize = bytes;
        }
        if (bytes <= targetBytes) {
          return {
            dataUrl: candidate,
            mimeType,
            width: currentWidth,
            height: currentHeight,
            sizeBytes: bytes,
          };
        }
      }
      currentWidth = Math.max(480, Math.round(currentWidth * 0.78));
      currentHeight = Math.max(320, Math.round(currentHeight * 0.78));
    }

    const validation = validateCompressedImagePayload(bestDataUrl, mimeType);
    if (!validation.valid) {
      throw new Error(validation.error || 'Image remains too large after compression.');
    }

    return {
      dataUrl: bestDataUrl,
      mimeType,
      width: currentWidth,
      height: currentHeight,
      sizeBytes: validation.sizeBytes,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Returns all article IDs (excluding a given article if deleting) that still reference this mediaId.
 */
export function getRemainingArticleReferencesForMedia(
  mediaId: string,
  allArticles: Array<Pick<StoredArticleDoc, 'id' | 'mediaId' | 'status' | 'deletionStatus'>>,
  excludingArticleId?: string,
): string[] {
  return allArticles
    .filter(
      (a) =>
        a.id !== excludingArticleId &&
        a.mediaId === mediaId &&
        a.status !== 'Deleted' &&
        a.deletionStatus !== 'deleted',
    )
    .map((a) => a.id);
}

export function canSafelyDeleteMediaAsset(
  mediaId: string,
  allArticles: Array<Pick<StoredArticleDoc, 'id' | 'mediaId' | 'status' | 'deletionStatus'>>,
  excludingArticleId?: string,
): { canDelete: boolean; remainingArticleIds: string[] } {
  const remainingArticleIds = getRemainingArticleReferencesForMedia(
    mediaId,
    allArticles,
    excludingArticleId,
  );
  return {
    canDelete: remainingArticleIds.length === 0,
    remainingArticleIds,
  };
}

/**
 * Evaluates whether an article's previous media asset can be safely deleted after being replaced or detached.
 * Shared assets and bundled static catalog assets are never deleted; only unreferenced uploaded assets are removed.
 */
export function evaluateReplacedMediaCleanup(params: {
  previousMediaId?: string | null;
  nextMediaId?: string | null;
  allArticles: Array<Pick<StoredArticleDoc, 'id' | 'mediaId' | 'status' | 'deletionStatus'>>;
  staticArticles?: Array<Pick<ArticleRecord, 'id' | 'mediaId' | 'media'>>;
  staticMediaAssets?: Array<Pick<MediaAssetRecord, 'id'>>;
}): {
  shouldSyncPrevious: boolean;
  shouldDeletePrevious: boolean;
  reason: 'unchanged' | 'bundled_static_asset' | 'still_referenced' | 'unreferenced_custom_asset';
  remainingArticleIds: string[];
} {
  const prevId = (params.previousMediaId ?? '').trim();
  const nextId = (params.nextMediaId ?? '').trim();
  if (!prevId || prevId === nextId) {
    return {
      shouldSyncPrevious: false,
      shouldDeletePrevious: false,
      reason: 'unchanged',
      remainingArticleIds: [],
    };
  }

  if (params.staticMediaAssets?.some((m) => m.id === prevId)) {
    return {
      shouldSyncPrevious: true,
      shouldDeletePrevious: false,
      reason: 'bundled_static_asset',
      remainingArticleIds: [],
    };
  }

  const firestoreRefs = getRemainingArticleReferencesForMedia(prevId, params.allArticles);
  const migratedIds = new Set(params.allArticles.map((a) => a.id));
  const staticRefs = (params.staticArticles ?? [])
    .filter(
      (s) =>
        !migratedIds.has(s.id) &&
        (s.mediaId === prevId || s.media?.id === prevId),
    )
    .map((s) => s.id);
  const remainingArticleIds = Array.from(new Set([...firestoreRefs, ...staticRefs]));

  if (remainingArticleIds.length > 0) {
    return {
      shouldSyncPrevious: true,
      shouldDeletePrevious: false,
      reason: 'still_referenced',
      remainingArticleIds,
    };
  }

  return {
    shouldSyncPrevious: true,
    shouldDeletePrevious: true,
    reason: 'unreferenced_custom_asset',
    remainingArticleIds: [],
  };
}

/**
 * Merges a newly attached article ID into a media document's associatedArticleIds array
 * atomically inside transactions so concurrent article photo attachments never drop prior links.
 */
export function mergeMediaAssociatedArticleId(
  existingIds: string[] | undefined,
  articleId: string,
): string[] {
  const set = new Set((existingIds ?? []).filter((id) => typeof id === 'string' && id.trim().length > 0));
  if (articleId.trim()) {
    set.add(articleId.trim());
  }
  return Array.from(set).slice(0, 50);
}

/**
 * Resolves all candidate article IDs that may reference a media asset across both
 * authoritative articles and media.associatedArticleIds for transactional verification before delete.
 */
export function collectCandidateReferencingArticleIds(params: {
  mediaId: string;
  allArticles: Array<Pick<StoredArticleDoc, 'id' | 'mediaId' | 'status' | 'deletionStatus'>>;
  recordedAssociatedIds?: string[];
  excludingArticleId?: string;
}): string[] {
  const fromArticles = getRemainingArticleReferencesForMedia(
    params.mediaId,
    params.allArticles,
    params.excludingArticleId,
  );
  const fromMediaDoc = (params.recordedAssociatedIds ?? []).filter(
    (id) => typeof id === 'string' && id.trim().length > 0 && id !== params.excludingArticleId,
  );
  return Array.from(new Set([...fromArticles, ...fromMediaDoc])).slice(0, 50);
}

/**
 * Computes whether a media asset should be publicly readable and its latest active expiry timestamp
 * based on all articles currently referencing it.
 */
export function computeMediaVisibilityFromArticles(
  mediaId: string,
  allArticles: Array<Pick<StoredArticleDoc, 'id' | 'mediaId' | 'status' | 'expiresAtMs' | 'deletionStatus'>>,
  nowMs: number = Date.now(),
): {
  isPublic: boolean;
  expiresAtMs: number | null;
  associatedArticleIds: string[];
} {
  const referencing = allArticles.filter(
    (a) => a.mediaId === mediaId && a.status !== 'Deleted' && a.deletionStatus !== 'deleted',
  );
  const activePublished = referencing.filter(
    (a) =>
      a.status === 'Published' &&
      (!a.deletionStatus || a.deletionStatus === 'none') &&
      (a.expiresAtMs == null || a.expiresAtMs > nowMs),
  );

  if (activePublished.length === 0) {
    return {
      isPublic: false,
      expiresAtMs: null,
      associatedArticleIds: referencing.map((a) => a.id),
    };
  }

  const maxExpiry = activePublished.reduce<number | null>((maxVal, art) => {
    if (typeof art.expiresAtMs !== 'number' || !Number.isFinite(art.expiresAtMs)) {
      return maxVal;
    }
    return maxVal === null ? art.expiresAtMs : Math.max(maxVal, art.expiresAtMs);
  }, null);

  return {
    isPublic: true,
    expiresAtMs: maxExpiry,
    associatedArticleIds: referencing.map((a) => a.id),
  };
}

export interface MediaQuotaEstimate {
  photoCount: number;
  totalStoredBytes: number;
  totalStoredMb: string;
  storageUsedPercent: number;
  dailyReadQuotaLimit: number;
  warningLevel: 'ok' | 'caution' | 'critical';
  guidanceNote: string;
}

export function estimateMediaQuotaUsage(
  mediaItems: Array<Pick<StoredMediaAssetDoc, 'mediaType' | 'sizeBytes'>>,
): MediaQuotaEstimate {
  const photos = mediaItems.filter((m) => m.mediaType.startsWith('image/'));
  const totalStoredBytes = photos.reduce((sum, m) => sum + (m.sizeBytes ?? 0), 0);
  const totalStoredMb = (totalStoredBytes / (1024 * 1024)).toFixed(2);
  const storageUsedPercent = Math.min(
    100,
    Number(((totalStoredBytes / SPARK_STORAGE_LIMIT_BYTES) * 100).toFixed(2)),
  );

  let warningLevel: 'ok' | 'caution' | 'critical' = 'ok';
  if (photos.length >= 2500 || storageUsedPercent >= 75) {
    warningLevel = 'critical';
  } else if (photos.length >= 1000 || storageUsedPercent >= 40) {
    warningLevel = 'caution';
  }

  return {
    photoCount: photos.length,
    totalStoredBytes,
    totalStoredMb,
    storageUsedPercent,
    dailyReadQuotaLimit: SPARK_DAILY_READ_QUOTA,
    warningLevel,
    guidanceNote:
      'Firestore Spark free tier provides 1 GiB stored data, but limits ALL visitors combined to 50,000 document reads/day. Each uncached photo payload view uses 1 Firestore read. Keep images compressed (~100-200 KB) and avoid heavy uncached public image traffic spikes.',
  };
}
