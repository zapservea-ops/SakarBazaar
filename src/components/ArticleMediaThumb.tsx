import { useState } from 'react';
import type { ArticleRecord } from '../types/sakarbazaar';
import { formatMediaDuration, getImageMedia, getVideoMedia } from '../utils/articleMedia';
import { EditorialArt } from './EditorialArt';

interface ArticleMediaThumbProps {
  article: Pick<ArticleRecord, 'headline' | 'illustration' | 'illustrationCaption' | 'media'>;
  compact?: boolean;
  className?: string;
}

export function ArticleMediaThumb({
  article,
  compact = false,
  className = '',
}: ArticleMediaThumbProps) {
  const videoMedia = getVideoMedia(article);
  const imageMedia = videoMedia ? null : getImageMedia(article);
  const [posterError, setPosterError] = useState(false);

  if (!videoMedia && imageMedia) {
    return (
      <div
        className={`sb-image-thumb${compact ? ' sb-image-thumb-compact' : ''}${className ? ` ${className}` : ''}`}
        data-image-thumb="true"
      >
        <img
          src={imageMedia.publicUrl}
          alt={imageMedia.title || article.headline}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  if (!videoMedia) {
    return (
      <EditorialArt
        variant={article.illustration}
        label={article.illustrationCaption}
        compact={compact}
      />
    );
  }

  const durationLabel = formatMediaDuration(videoMedia.durationSec);
  const isYouTube = videoMedia.mediaType === 'video/youtube';
  const resolvedPoster = videoMedia.posterUrl || (isYouTube && videoMedia.youtubeVideoId ? `https://i.ytimg.com/vi/${videoMedia.youtubeVideoId}/hqdefault.jpg` : '');
  const usePosterImg = Boolean(resolvedPoster) && !posterError;

  return (
    <div
      className={`sb-video-thumb${compact ? ' sb-video-thumb-compact' : ''}${className ? ` ${className}` : ''}`}
      data-video-thumb="true"
    >
      {usePosterImg ? (
        <img
          src={resolvedPoster}
          alt={videoMedia.title || article.headline}
          loading="lazy"
          decoding="async"
          onError={() => setPosterError(true)}
        />
      ) : isYouTube ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, #121a22, #0b3c3d)',
          }}
          aria-label={videoMedia.title || article.headline}
        />
      ) : (
        <video
          src={`${videoMedia.publicUrl}#t=1.5`}
          preload="metadata"
          muted
          playsInline
          aria-label={videoMedia.title || article.headline}
        />
      )}

      <span className="sb-video-thumb-scrim" aria-hidden="true" />

      <span className="sb-video-badge" aria-label="Video report">
        <span className="sb-video-badge-dot" aria-hidden="true" />
        <span>{compact ? 'VIDEO' : durationLabel ? `VIDEO · ${durationLabel}` : 'WATCH VIDEO'}</span>
      </span>

      <span className="sb-video-play-btn" aria-hidden="true">
        <svg viewBox="0 0 24 24" width={compact ? 18 : 24} height={compact ? 18 : 24} fill="currentColor">
          <path d="M8 5.14v14l11-7-11-7z" />
        </svg>
      </span>
    </div>
  );
}
