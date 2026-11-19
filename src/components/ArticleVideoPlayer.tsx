import type { MediaAssetRecord } from '../types/sakarbazaar';
import { getYouTubeMediaInfo } from '../utils/articleMedia';

interface ArticleVideoPlayerProps {
  media: MediaAssetRecord;
}

function getDynamicPoster(title: string, caption: string): string {
  const safeTitle = title.replace(/[<>&"]/g, '');
  const safeCaption = caption.replace(/[<>&"]/g, '');
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 576"><rect width="1024" height="576" fill="#121a22"/><rect x="48" y="48" width="928" height="480" rx="16" fill="#17232d" stroke="#0b6b6b" stroke-width="3"/><text x="84" y="136" fill="#4fb3ad" font-family="Georgia,serif" font-size="28" font-weight="bold">SAKARBAZAAR EDITORIAL VIDEO</text><text x="84" y="218" fill="#e8edf1" font-family="Georgia,serif" font-size="34" font-weight="bold">${safeTitle.slice(0, 52)}</text><text x="84" y="274" fill="#9aa6b2" font-family="sans-serif" font-size="22">${safeCaption.slice(0, 72)}...</text><rect x="84" y="340" width="280" height="52" rx="10" fill="#0b6b6b"/><text x="112" y="374" fill="#ffffff" font-family="sans-serif" font-size="20" font-weight="bold">▶ Watch Video Report</text></svg>`,
    )
  );
}

export function ArticleVideoPlayer({ media }: ArticleVideoPlayerProps) {
  const ytInfo = getYouTubeMediaInfo(media);
  const poster = media.posterUrl || ytInfo?.thumbnailUrl || getDynamicPoster(media.title, media.caption);

  return (
    <section className="card sb-video-card" aria-labelledby={`video-title-${media.id}`}>
      <div className="sb-video-head">
        <div>
          <span className="pill sb-pill-teal">{ytInfo ? 'YouTube Video Report' : 'Video Report'}</span>
          <h2 id={`video-title-${media.id}`}>{media.title}</h2>
        </div>
        {ytInfo ? (
          <span className="meta">YouTube Embed</span>
        ) : media.durationSec ? (
          <span className="meta">
            {media.width && media.height ? `${media.width}×${media.height} · ` : ''}
            {media.durationSec}s MP4
          </span>
        ) : null}
      </div>

      <div className="sb-video-frame">
        {ytInfo ? (
          <iframe
            src={ytInfo.embedUrl}
            title={media.title || 'SakarBazaar YouTube Video Report'}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            style={{ width: '100%', aspectRatio: '16 / 9', border: 0, display: 'block', borderRadius: '8px' }}
          />
        ) : (
          <video
            controls
            preload="metadata"
            playsInline
            poster={poster}
            aria-label={media.title}
          >
            <source src={media.publicUrl} type={media.mediaType} />
            Your browser does not support HTML5 MP4 video playback.
          </video>
        )}
      </div>

      {ytInfo && (
        <div
          className="meta"
          style={{
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span>If embedded playback is disabled on this video, open it directly on YouTube.</span>
          <a
            href={ytInfo.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--teal)', fontWeight: 600 }}
          >
            Watch on YouTube ↗
          </a>
        </div>
      )}

      <p className="sb-video-caption">{media.caption}</p>
      <div className="meta" style={{ marginTop: '6px' }}>
        {media.sourceNote}
      </div>

      {media.transcript && (
        <details className="sb-video-transcript">
          <summary>Read video summary &amp; transcript note</summary>
          <p>{media.transcript}</p>
        </details>
      )}
    </section>
  );
}
