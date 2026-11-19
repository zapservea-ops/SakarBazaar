import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArticleMediaThumb } from '../components/ArticleMediaThumb';
import { ArticleVideoPlayer } from '../components/ArticleVideoPlayer';
import { EditorialArt } from '../components/EditorialArt';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { CATEGORY_LABELS } from '../data/i18n';
import { getImageMedia, getVideoMedia, hasVideoMedia } from '../utils/articleMedia';

export function ArticleDetailPage() {
  const { slug } = useParams();
  const { lang, ui, articlesCatalog, bookmarks, toggleBookmark } = useSakarBazaar();
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [audioNote, setAudioNote] = useState<string | null>(null);

  const article = articlesCatalog.find((item) => item.slug === slug);

  useEffect(() => {
    if (article) {
      const headline = lang === 'hi' && article.headlineHi ? article.headlineHi : article.headline;
      document.title = `${headline} – SakarBazaar`;
    } else {
      document.title = `Article Not Found – SakarBazaar`;
    }
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setSpeaking(false);
    };
  }, [article, lang]);

  if (!article) {
    return (
      <main className="wrap sb-page">
        <PageBackNav
          parentPath="/news"
          parentLabel={ui.newsPageTitle}
          currentLabel="Not found"
        />
        <div className="card" style={{ padding: '24px' }}>
          <h1 style={{ font: '700 26px var(--serif)', margin: '0 0 8px' }}>
            {ui.noResultsTitle}
          </h1>
          <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{ui.noResultsHint}</p>
          <Link to="/news" className="btn">
            {ui.newsPageTitle}
          </Link>
        </div>
      </main>
    );
  }

  const displayHeadline =
    lang === 'hi' && article.headlineHi ? article.headlineHi : article.headline;
  const displayDeck = lang === 'hi' && article.deckHi ? article.deckHi : article.deck;
  const displaySections =
    lang === 'hi' && article.sectionsHi && article.sectionsHi.length > 0
      ? article.sectionsHi
      : article.sections;
  const isSaved = bookmarks.has(article.headline);

  const relatedArticles = article.relatedSlugs
    .map((relSlug) => articlesCatalog.find((a) => a.slug === relSlug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const otherDispatches = articlesCatalog
    .filter((item) => item.slug !== article.slug)
    .slice(0, 4);

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: displayHeadline, url: window.location.href });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      // User dismissed share sheet
    }
  }

  function handleListenToggle() {
    if (!article) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setAudioNote(ui.listenUnsupported);
      return;
    }

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      setAudioNote(null);
      return;
    }

    const bodyText = [
      displayHeadline,
      displayDeck,
      ...displaySections.flatMap((s) => [s.heading, ...s.paragraphs]),
    ].join('. ');

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(bodyText);
      utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => {
        setSpeaking(false);
        setAudioNote(ui.listenUnsupported);
      };
      setSpeaking(true);
      setAudioNote(null);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeaking(false);
      setAudioNote(ui.listenUnsupported);
    }
  }

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath={`/news/${encodeURIComponent(article.category)}`}
        parentLabel={CATEGORY_LABELS[lang][article.category]}
        grandparentPath="/news"
        grandparentLabel={ui.newsPageTitle}
        currentLabel={article.ticker}
      />

      <div className="sb-article-layout">
        <article className="sb-article-main">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link
              to={`/news/${encodeURIComponent(article.category)}`}
              className="pill"
            >
              {CATEGORY_LABELS[lang][article.category]}
            </Link>
            {article.isPaid && (
              <span className="pill sb-pill-muted">
                {article.paidDisclosureLabel || 'Partner Disclosure'}
              </span>
            )}
            <span className="meta">{article.readTime}</span>
          </div>

          <h1>{displayHeadline}</h1>

          <p className="sb-article-lead">{displayDeck}</p>

          <div className="sb-article-byline">
            <div>
              <strong>{article.author}</strong>{' '}
              <span style={{ color: 'var(--muted)' }}>· {article.authorRole}</span>
              <div className="meta" style={{ marginTop: '4px' }}>
                {ui.publishedLabel}: {article.publishedAt} · {ui.updatedLabel}:{' '}
                {article.updatedAt}
              </div>
            </div>

            <div className="sb-article-toolbar">
              <button
                type="button"
                className="btn ghost"
                aria-pressed={speaking}
                onClick={handleListenToggle}
              >
                {speaking ? ui.stopListening : ui.listen}
              </button>
              <button
                type="button"
                className="btn ghost"
                aria-pressed={isSaved}
                onClick={() => toggleBookmark(article.headline)}
              >
                {isSaved ? ui.saved : ui.saveStory}
              </button>
              <button type="button" className="btn ghost" onClick={handleShare}>
                {copied ? ui.linkCopied : ui.share}
              </button>
            </div>
          </div>

          {audioNote && (
            <div className="sb-note-box" role="status" style={{ marginTop: 0, marginBottom: '16px' }}>
              {audioNote}
            </div>
          )}

          {(() => {
            const videoMedia = getVideoMedia(article);
            const imageMedia = videoMedia ? null : getImageMedia(article);

            if (videoMedia) {
              return <ArticleVideoPlayer media={videoMedia} />;
            }
            if (imageMedia) {
              return (
                <figure className="sb-article-hero-figure">
                  <div className="sb-article-hero-media">
                    <img
                      src={imageMedia.publicUrl}
                      alt={imageMedia.title || displayHeadline}
                      className="sb-article-hero-img"
                    />
                  </div>
                  <figcaption className="meta" style={{ marginTop: '8px' }}>
                    {imageMedia.caption}
                  </figcaption>
                </figure>
              );
            }
            return (
              <figure style={{ margin: '0 0 20px' }}>
                <EditorialArt
                  variant={article.illustration}
                  label={article.illustrationCaption}
                />
                <figcaption className="meta" style={{ marginTop: '8px' }}>
                  {article.illustrationCaption}
                </figcaption>
              </figure>
            );
          })()}

          <aside className="sb-takeaways" aria-label={ui.keyTakeaways}>
            <h3>{ui.keyTakeaways}</h3>
            <ul>
              {article.keyPoints.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
          </aside>

          <div className="sb-article-body">
            {displaySections.map((section, idx) => (
              <section key={idx}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((p, pIdx) => (
                  <p key={pIdx}>{p}</p>
                ))}
              </section>
            ))}
          </div>

          {article.financialMetrics && article.financialMetrics.length > 0 && (
            <section className="card snap" style={{ marginTop: '24px' }} aria-labelledby="metrics-heading">
              <div className="sec-h">
                <h2 id="metrics-heading">Supplied Offer &amp; Financial Snapshot</h2>
              </div>
              {article.financialMetrics.map((row) => (
                <div className="row sb-snap-row" key={row.metric}>
                  <span>{row.metric}</span>
                  <strong className="num" style={{ textAlign: 'right' }}>
                    {row.value}
                  </strong>
                </div>
              ))}
            </section>
          )}

          {article.risksAndMonitorables && article.risksAndMonitorables.length > 0 && (
            <section className="card snap" style={{ marginTop: '18px' }} aria-labelledby="risks-heading">
              <div className="sec-h">
                <h2 id="risks-heading">Monitorables &amp; Disclosed Risks</h2>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {article.risksAndMonitorables.map((risk, idx) => (
                  <li key={idx} style={{ marginBottom: '6px' }}>
                    {risk}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section style={{ marginTop: '28px' }} aria-labelledby="sources-heading">
            <h2 id="sources-heading" style={{ font: '700 20px var(--serif)', margin: '0 0 6px' }}>
              {ui.sourcesAndFilings}
            </h2>
            {article.verificationChecklist && article.verificationChecklist.length > 0 && (
              <ul style={{ margin: '0 0 14px', paddingLeft: '20px', color: 'var(--muted)' }}>
                {article.verificationChecklist.map((step, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>
                    {step}
                  </li>
                ))}
              </ul>
            )}

            <div className="sb-citation-list">
              {article.citations.map((cit) => (
                <div className="sb-citation-item" key={cit.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                    <strong>{cit.label}</strong>
                    {cit.url ? (
                      <a
                        href={cit.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--teal)', fontWeight: 600 }}
                      >
                        {cit.portalName} ↗
                      </a>
                    ) : (
                      <span className="meta">{cit.portalName}</span>
                    )}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
                    {cit.note}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {article.keywords.length > 0 && (
            <section style={{ marginTop: '22px' }} aria-label="Article keywords">
              <div className="meta" style={{ marginBottom: '8px' }}>
                Related topics &amp; entities
              </div>
              <div className="sb-keyword-chips">
                {article.keywords.slice(0, 10).map((kw) => (
                  <Link
                    key={kw}
                    to={`/search?q=${encodeURIComponent(kw)}`}
                    className="sb-kw-chip"
                  >
                    {kw}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {relatedArticles.length > 0 && (
            <section style={{ marginTop: '32px' }} aria-labelledby="related-heading">
              <div className="sec-h">
                <h2 id="related-heading">{ui.relatedStories}</h2>
                <Link to="/news" className="sb-sec-link">
                  {ui.allStories} →
                </Link>
              </div>
              <div className="sb-related-grid">
                {relatedArticles.map((rel) => (
                  <Link
                    to={`/article/${rel.slug}`}
                    className="card sb-related-card"
                    key={rel.id}
                  >
                    <div className="sb-related-media">
                      <ArticleMediaThumb article={rel} />
                    </div>
                    <div className="sb-related-card-body">
                      <div className="sb-story-meta-row">
                        <span className="cat">{CATEGORY_LABELS[lang][rel.category]}</span>
                        {hasVideoMedia(rel) && (
                          <span className="sb-inline-video-pill">▶ Video</span>
                        )}
                      </div>
                      <h4 className="sb-clamp-3">
                        {lang === 'hi' && rel.headlineHi ? rel.headlineHi : rel.headline}
                      </h4>
                      <span className="meta">
                        {rel.publishedAt} · {rel.readTime}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>

        <aside>
          <section className="card snap">
            <div className="sec-h">
              <h2>{ui.popularStories}</h2>
            </div>
            {otherDispatches.map((pop) => (
              <div
                className="row"
                style={{ gridTemplateColumns: '1fr', gap: '4px' }}
                key={pop.id}
              >
                <div className="sb-story-meta-row">
                  <span className="cat">{CATEGORY_LABELS[lang][pop.category]}</span>
                  {hasVideoMedia(pop) && (
                    <span className="sb-inline-video-pill">▶ Video</span>
                  )}
                </div>
                <Link
                  to={`/article/${pop.slug}`}
                  style={{ fontWeight: 600, lineHeight: 1.35 }}
                >
                  {lang === 'hi' && pop.headlineHi ? pop.headlineHi : pop.headline}
                </Link>
                <small>
                  {pop.author} · {pop.readTime}
                </small>
              </div>
            ))}
          </section>

          <section className="card snap" style={{ marginTop: '16px' }}>
            <div className="sec-h">
              <h2>{ui.explainersPageTitle}</h2>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--muted)' }}>
              {ui.explainersPageSubtitle}
            </p>
            <Link to="/explainers" className="btn ghost" style={{ width: '100%' }}>
              {ui.browseExplainers}
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
