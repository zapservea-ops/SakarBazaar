import type { MediaAssetRecord } from '../types/sakarbazaar';
import { parseYouTubeVideoUrl } from './mediaLibrary';

export interface MediaBearingItem {
  media?: MediaAssetRecord | null;
}

/**
 * Determines whether an article or news item contains a valid playable video asset (MP4 or YouTube).
 * Strictly data-driven: checks mediaType and publicUrl/youtubeVideoId rather than title or position.
 */
export function hasVideoMedia(item?: MediaBearingItem | null): boolean {
  return getVideoMedia(item) !== null;
}

/**
 * Returns the MediaAssetRecord if the item has a valid video asset (MP4 or YouTube), otherwise null.
 */
export function getVideoMedia(item?: MediaBearingItem | null): MediaAssetRecord | null {
  const media = item?.media;
  if (!media) return null;
  const mediaType = typeof media.mediaType === 'string' ? media.mediaType.trim().toLowerCase() : '';
  if (!mediaType.startsWith('video/')) {
    return null;
  }
  if (mediaType === 'video/youtube') {
    const yt = parseYouTubeVideoUrl(media.youtubeVideoId || media.youtubeUrl || media.publicUrl);
    if (!yt) return null;
    return {
      ...media,
      youtubeVideoId: media.youtubeVideoId || yt.videoId,
      youtubeUrl: media.youtubeUrl || yt.canonicalUrl,
      posterUrl: media.posterUrl || yt.thumbnailUrl,
      publicUrl: media.publicUrl || yt.canonicalUrl,
    };
  }
  const publicUrl = typeof media.publicUrl === 'string' ? media.publicUrl.trim() : '';
  if (!publicUrl) {
    return null;
  }
  return media;
}

export function getYouTubeMediaInfo(media?: MediaAssetRecord | null) {
  if (!media || media.mediaType !== 'video/youtube') return null;
  return parseYouTubeVideoUrl(media.youtubeVideoId || media.youtubeUrl || media.publicUrl);
}

/**
 * Determines whether an article or news item contains a valid image asset.
 */
export function hasImageMedia(item?: MediaBearingItem | null): boolean {
  return getImageMedia(item) !== null;
}

/**
 * Returns the MediaAssetRecord if the item has a valid image asset, otherwise null.
 */
export function getImageMedia(item?: MediaBearingItem | null): MediaAssetRecord | null {
  const media = item?.media;
  if (!media) return null;
  const publicUrl = typeof media.publicUrl === 'string' ? media.publicUrl.trim() : '';
  const mediaType = typeof media.mediaType === 'string' ? media.mediaType.trim().toLowerCase() : '';
  if (!publicUrl || !mediaType.startsWith('image/')) {
    return null;
  }
  return media;
}

/**
 * Resolves a stored mediaId (e.g. from Firestore editorial records) against the catalog.
 */
export function resolveMediaById(
  mediaId: string | undefined | null,
  catalog: readonly MediaAssetRecord[],
): MediaAssetRecord | undefined {
  if (!mediaId) return undefined;
  const normalized = mediaId.trim();
  if (!normalized) return undefined;
  return catalog.find((asset) => asset.id === normalized);
}

/**
 * Formats a media duration in seconds into a compact display label (e.g. "20s", "1:15").
 */
export function formatMediaDuration(durationSec?: number): string | null {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return null;
  const totalSeconds = Math.round(durationSec);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
