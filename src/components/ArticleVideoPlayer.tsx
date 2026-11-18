import type { MediaAssetRecord } from '../types/sakarbazaar';

interface ArticleVideoPlayerProps {
  media: MediaAssetRecord;
}

const VIDEO_POSTER_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 576"><rect width="1024" height="576" fill="#121a22"/><rect x="48" y="48" width="928" height="480" rx="16" fill="#17232d" stroke="#0b6b6b" stroke-width="3"/><text x="84" y="136" fill="#4fb3ad" font-family="Georgia,serif" font-size="28" font-weight="bold">SAKARBAZAAR EDITORIAL BRIEF</text><text x="84" y="218" fill="#e8edf1" font-family="Georgia,serif" font-size="44" font-weight="bold">Mahanadi Coalfields Limited (MCL) IPO</text><text x="84" y="274" fill="#9aa6b2" font-family="sans-serif" font-size="24">Proposed 100% OFS by Coal India Limited · Supplied brief (20s MP4)</text><rect x="84" y="340" width="380" height="54" rx="10" fill="#d99a00"/><text x="108" y="375" fill="#1c2733" font-family="sans-serif" font-size="22" font-weight="bold">Awaiting Official Verification</text></svg>',
  );

export function ArticleVideoPlayer({ media }: ArticleVideoPlayerProps) {
  return (
    <section className="card sb-video-card" aria-labelledby={`video-title-${media.id}`}>
      <div className="sb-video-head">
        <div>
          <span className="pill sb-pill-amber">Video Brief · Supplied Material</span>
          <h2 id={`video-title-${media.id}`}>{media.title}</h2>
        </div>
        {media.durationSec ? (
          <span className="meta">
            {media.width && media.height ? `${media.width}×${media.height} · ` : ''}
            {media.durationSec}s MP4
          </span>
        ) : null}
      </div>

      <div className="sb-video-frame">
        <video
          controls
          preload="metadata"
          playsInline
          poster={VIDEO_POSTER_DATA_URI}
          aria-label={media.title}
        >
          <source src={media.publicUrl} type={media.mediaType} />
          Your browser does not support HTML5 MP4 video playback.
        </video>
      </div>

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
