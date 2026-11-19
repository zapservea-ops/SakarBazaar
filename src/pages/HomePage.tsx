import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArticleMediaThumb } from '../components/ArticleMediaThumb';
import { EditorialCalendarStrip } from '../components/EditorialCalendarStrip';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { CATEGORY_LABELS, IPO_STATUS_LABELS } from '../data/i18n';
import {
  CALENDAR_SCHEDULE,
  HOMEPAGE_NEWS_CATEGORIES,
  MARKET_PULSE_ITEMS,
} from '../data/sampleData';
import type { HomepageNewsCategory } from '../types/sakarbazaar';
import { hasVideoMedia } from '../utils/articleMedia';
import { filterNewsItems } from '../utils/marketFormat';
import { selectHomepageFeaturedArticles } from '../utils/newsLifecycle';

const categoryColors: Record<string, string> = {
  RBI: '#0b6b6b',
  Regulatory: '#8b5cf6',
  Corporate: '#f59e0b',
  Economy: '#3b82f6',
  'Commodity/FX': '#10b981',
  Markets: '#ef4444',
};

export function HomePage() {
  const {
    copy,
    lang,
    bookmarks,
    searchTerm,
    articlesCatalog,
    newsItems,
    ipoRecords,
    toggleBookmark,
  } = useSakarBazaar();

  const [selectedCategory, setSelectedCategory] = useState<HomepageNewsCategory>('All');
  const [shownNewsCount, setShownNewsCount] = useState(6);

  useEffect(() => {
    document.title = 'SakarBazaar – India Financial Intelligence';
  }, []);

  // Featured articles (1 manual main story + up to 3 secondary stories)
  const { mainStory: leadArticle, secondaryStories } = selectHomepageFeaturedArticles(articlesCatalog);
  const secondArticle = secondaryStories[0];
  const thirdArticle = secondaryStories[1];
  const extraFeaturedArticle = secondaryStories[2];

  const filteredNews = filterNewsItems(newsItems, selectedCategory, searchTerm);

  return (
    <>
      {/* ── EDITORIAL NEWSPAPER MASTHEAD ────────────────────────────── */}
      <section className="sb-masthead">
        <div className="wrap">
          <div className="sb-masthead-inner">
            <div>
              <div className="sb-masthead-eyebrow">India Financial Intelligence</div>
              <h1>SakarBazaar</h1>
              <p className="sb-masthead-tagline">
                &ldquo;From financial news to financial understanding.&rdquo;
              </p>
            </div>
            <div className="sb-masthead-actions">
              <Link to="/news" className="btn ghost">
                Latest News →
              </Link>
              <Link to="/intelligence" className="btn">
                Intelligence Pulse →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <main id="top" className="wrap sb-home-main">
        {/* ── PROMINENT TOP THREE FINANCIAL STORIES ───────────────────── */}
        <section className="sb-dispatches-section" aria-label="Lead Financial Stories">
          <div className="sec-h">
            <div>
              <h2>
                PRIMARY <span style={{ color: 'var(--teal)' }}>DISPATCHES</span>
              </h2>
              <span className="meta">Editorial coverage &amp; corporate developments</span>
            </div>
            <Link to="/news" className="sb-sec-link">
              All News ({articlesCatalog.length}) →
            </Link>
          </div>

          <div className="sb-three-stories-grid">
            {/* Story 1: Lead Article */}
            {leadArticle && (
              <article className="card sb-story-card sb-story-featured">
                <Link
                  to={`/article/${leadArticle.slug}`}
                  className="sb-story-media-link"
                  aria-label={leadArticle.headline}
                >
                  <ArticleMediaThumb article={leadArticle} />
                </Link>
                <div className="sb-story-body">
                  <div className="sb-story-meta-row">
                    <span className="cat">{CATEGORY_LABELS[lang][leadArticle.category]}</span>
                    {hasVideoMedia(leadArticle) && (
                      <span className="sb-inline-video-pill">▶ Video Brief</span>
                    )}
                    {leadArticle.isPaid && (
                      <span className="pill sb-pill-muted" style={{ fontSize: '10px' }}>
                        {leadArticle.paidDisclosureLabel || 'Partner Disclosure'}
                      </span>
                    )}
                    <span className="meta">
                      {leadArticle.time} · {leadArticle.readTime}
                    </span>
                  </div>
                  <h3 className="sb-story-title sb-story-title-lead">
                    <Link to={`/article/${leadArticle.slug}`}>
                      {lang === 'hi' && leadArticle.headlineHi
                        ? leadArticle.headlineHi
                        : leadArticle.headline}
                    </Link>
                  </h3>
                  <p className="sb-story-deck sb-clamp-3">
                    {lang === 'hi' && leadArticle.deckHi ? leadArticle.deckHi : leadArticle.deck}
                  </p>
                  <div className="src sb-story-source">
                    <b>{leadArticle.ticker}</b>
                    <span>{leadArticle.author}</span>
                  </div>
                </div>
              </article>
            )}

            {/* Story 2: Second Article */}
            {secondArticle && (
              <article className="card sb-story-card sb-story-secondary">
                <Link
                  to={`/article/${secondArticle.slug}`}
                  className="sb-story-media-link"
                  aria-label={secondArticle.headline}
                >
                  <ArticleMediaThumb article={secondArticle} />
                </Link>
                <div className="sb-story-body">
                  <div className="sb-story-meta-row">
                    <span className="cat">{CATEGORY_LABELS[lang][secondArticle.category]}</span>
                    {hasVideoMedia(secondArticle) && (
                      <span className="sb-inline-video-pill">▶ Video</span>
                    )}
                    {secondArticle.isPaid && (
                      <span className="pill sb-pill-muted" style={{ fontSize: '10px' }}>
                        {secondArticle.paidDisclosureLabel || 'Partner Disclosure'}
                      </span>
                    )}
                    <span className="meta">
                      {secondArticle.time} · {secondArticle.readTime}
                    </span>
                  </div>
                  <h3 className="sb-story-title">
                    <Link to={`/article/${secondArticle.slug}`}>
                      {lang === 'hi' && secondArticle.headlineHi
                        ? secondArticle.headlineHi
                        : secondArticle.headline}
                    </Link>
                  </h3>
                  <p className="sb-story-deck sb-clamp-3">
                    {lang === 'hi' && secondArticle.deckHi
                      ? secondArticle.deckHi
                      : secondArticle.deck}
                  </p>
                  <div className="src sb-story-source">
                    <b>{secondArticle.ticker}</b>
                    <span>{secondArticle.author}</span>
                  </div>
                </div>
              </article>
            )}

            {/* Story 3: NHC Foods (Article with Video) */}
            {thirdArticle && (
              <article className="card sb-story-card sb-story-secondary">
                <Link
                  to={`/article/${thirdArticle.slug}`}
                  className="sb-story-media-link"
                  aria-label={thirdArticle.headline}
                >
                  <ArticleMediaThumb article={thirdArticle} />
                </Link>
                <div className="sb-story-body">
                  <div className="sb-story-meta-row">
                    <span className="cat">{CATEGORY_LABELS[lang][thirdArticle.category]}</span>
                    {hasVideoMedia(thirdArticle) && (
                      <span className="sb-inline-video-pill">▶ Video Report</span>
                    )}
                    {thirdArticle.isPaid && (
                      <span className="pill sb-pill-muted" style={{ fontSize: '10px' }}>
                        {thirdArticle.paidDisclosureLabel || 'Partner Disclosure'}
                      </span>
                    )}
                    <span className="meta">
                      {thirdArticle.time} · {thirdArticle.readTime}
                    </span>
                  </div>
                  <h3 className="sb-story-title">
                    <Link to={`/article/${thirdArticle.slug}`}>
                      {lang === 'hi' && thirdArticle.headlineHi
                        ? thirdArticle.headlineHi
                        : thirdArticle.headline}
                    </Link>
                  </h3>
                  <p className="sb-story-deck sb-clamp-3">
                    {lang === 'hi' && thirdArticle.deckHi ? thirdArticle.deckHi : thirdArticle.deck}
                  </p>
                  <div className="src sb-story-source">
                    <b>{thirdArticle.ticker}</b>
                    <span>{thirdArticle.author}</span>
                  </div>
                </div>
              </article>
            )}
          </div>

          {extraFeaturedArticle && (
            <div style={{ marginTop: '14px' }}>
              <article className="card sb-story-card" style={{ padding: '14px 18px' }}>
                <div className="sb-story-meta-row">
                  <span className="cat">{CATEGORY_LABELS[lang][extraFeaturedArticle.category]}</span>
                  {hasVideoMedia(extraFeaturedArticle) && (
                    <span className="sb-inline-video-pill">▶ Video</span>
                  )}
                  {extraFeaturedArticle.isPaid && (
                    <span className="pill sb-pill-muted" style={{ fontSize: '10px' }}>
                      {extraFeaturedArticle.paidDisclosureLabel || 'Partner Disclosure'}
                    </span>
                  )}
                  <span className="meta">
                    {extraFeaturedArticle.time} · {extraFeaturedArticle.readTime}
                  </span>
                </div>
                <h3 className="sb-story-title" style={{ marginTop: '4px' }}>
                  <Link to={`/article/${extraFeaturedArticle.slug}`}>
                    {lang === 'hi' && extraFeaturedArticle.headlineHi
                      ? extraFeaturedArticle.headlineHi
                      : extraFeaturedArticle.headline}
                  </Link>
                </h3>
              </article>
            </div>
          )}
        </section>

        {/* ── TWO COLUMN EDITORIAL & INTELLIGENCE LAYOUT ──────────────── */}
        <div className="layout">
          <div style={{ minWidth: 0 }}>
            {/* ── THE MOST MATERIAL DEVELOPMENTS FEED ────────────────────── */}
            <section className="card snap sb-material-card" style={{ marginTop: 0 }}>
              <div className="sec-h">
                <div>
                  <h2>
                    THE MOST <span style={{ color: 'var(--teal)' }}>MATERIAL DEVELOPMENTS</span>
                  </h2>
                  <p className="sb-sec-sub">
                    Material dispatches that alter capital allocations, valuations, or regulatory
                    compliance.
                  </p>
                </div>
                <Link to="/intelligence" className="sb-sec-link">
                  Full Intelligence Pulse ({MARKET_PULSE_ITEMS.length}) →
                </Link>
              </div>

              <div className="sb-pulse-feed">
                {MARKET_PULSE_ITEMS.slice(0, 5).map((item) => {
                  const title = lang === 'hi' && item.titleHi ? item.titleHi : item.title;
                  const summary = lang === 'hi' && item.summaryHi ? item.summaryHi : item.summary;
                  const catColor = categoryColors[item.category] ?? 'var(--teal)';

                  return (
                    <div
                      key={item.id}
                      className="sb-pulse-row"
                      style={{
                        borderLeft: `3px solid ${catColor}`,
                        paddingLeft: '14px',
                        marginBottom: '18px',
                        paddingBottom: '18px',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <div className="sb-pulse-row-head">
                        <span
                          className="pill"
                          style={{ background: catColor, color: '#fff', fontSize: '11px' }}
                        >
                          {item.category}
                        </span>
                        <span className="meta">{item.timestamp}</span>
                      </div>

                      {item.relatedPath ? (
                        <Link
                          to={item.relatedPath}
                          style={{
                            fontWeight: 700,
                            fontSize: '15px',
                            lineHeight: '1.4',
                            display: 'block',
                            marginBottom: '6px',
                            color: 'inherit',
                            textDecoration: 'none',
                          }}
                        >
                          {title}
                        </Link>
                      ) : (
                        <strong
                          style={{
                            fontWeight: 700,
                            fontSize: '15px',
                            lineHeight: '1.4',
                            display: 'block',
                            marginBottom: '6px',
                          }}
                        >
                          {title}
                        </strong>
                      )}

                      <p className="sb-pulse-summary sb-clamp-3">
                        {summary}
                      </p>

                      {item.actionableContext && (
                        <div
                          style={{
                            fontSize: '13px',
                            color: 'var(--muted)',
                            borderLeft: '2px solid var(--border)',
                            paddingLeft: '10px',
                            marginBottom: '8px',
                            fontStyle: 'italic',
                          }}
                        >
                          {item.actionableContext}
                        </div>
                      )}

                      <div style={{ fontSize: '12px' }}>
                        <span style={{ color: 'var(--muted)' }}>Source: </span>
                        {item.sourceUrl ? (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--teal)', textDecoration: 'none' }}
                          >
                            {item.source}
                          </a>
                        ) : (
                          <span>{item.source}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── ALL NEWSROOM DISPATCHES ─────────────────────────────────── */}
            <section className="card feed" style={{ marginTop: '24px' }}>
              <div className="sec-h">
                <div>
                  <h2>{copy.latest}</h2>
                  <p className="sb-sec-sub">
                    Continuous reporting across Indian markets, corporations and policy.
                  </p>
                </div>
                <Link to="/news" className="sb-sec-link">
                  All Stories →
                </Link>
              </div>

              {/* Category pills */}
              <div className="sb-filter-tabs" style={{ marginBottom: '16px' }}>
                {HOMEPAGE_NEWS_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`sb-filter-tab${selectedCategory === cat ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setShownNewsCount(6);
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div>
                {filteredNews.slice(0, shownNewsCount).map((item) => {
                  const isSaved = bookmarks.has(item.headline);
                  const matchedArticle = articlesCatalog.find((a) => a.slug === item.slug);
                  const isVideo = hasVideoMedia(matchedArticle ?? item);
                  const displayTitle =
                    lang === 'hi' && item.headlineHi ? item.headlineHi : item.headline;

                  return (
                    <div className="item sb-dispatch-item" key={item.id}>
                      {matchedArticle ? (
                        <Link
                          to={`/article/${item.slug}`}
                          className="sb-dispatch-thumb-link"
                          aria-label={displayTitle}
                        >
                          <ArticleMediaThumb article={matchedArticle} compact />
                        </Link>
                      ) : (
                        <span className="t">{item.time}</span>
                      )}
                      <div className="sb-dispatch-content">
                        <div className="sb-story-meta-row">
                          <span className="cat">{CATEGORY_LABELS[lang][item.category]}</span>
                          {isVideo && (
                            <span className="sb-inline-video-pill">▶ Video</span>
                          )}
                          {item.isPaid && (
                            <span className="pill sb-pill-muted" style={{ fontSize: '10px' }}>
                              {item.paidDisclosureLabel || 'Partner Disclosure'}
                            </span>
                          )}
                          <span className="meta">{item.time}</span>
                        </div>
                        <Link className="h" to={`/article/${item.slug}`}>
                          {displayTitle}
                        </Link>
                        {(lang === 'hi' && item.summaryHi ? item.summaryHi : item.summary) && (
                          <p className="sb-dispatch-summary sb-clamp-2">
                            {lang === 'hi' && item.summaryHi ? item.summaryHi : item.summary}
                          </p>
                        )}
                        <div className="src">
                          <b>{item.ticker}</b>
                          {item.sourceNote}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="bm"
                        aria-pressed={isSaved}
                        aria-label={isSaved ? `Remove bookmark` : `Bookmark story`}
                        onClick={() => toggleBookmark(item.headline)}
                      >
                        <svg
                          width="18"
                          height="20"
                          viewBox="0 0 18 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          aria-hidden="true"
                        >
                          <path d="M3 2h12v16l-6-4-6 4z" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>

              {shownNewsCount < filteredNews.length && (
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setShownNewsCount((prev) => prev + 6)}
                  >
                    Load More Stories
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* ── ASIDE MODULES ──────────────────────────────────────────── */}
          <aside className="sb-home-aside">
            {/* The Change Ledger Teaser */}
            <section className="card snap" style={{ marginBottom: '20px' }}>
              <div className="sec-h">
                <h2>THE CHANGE LEDGER</h2>
                <span className="pill sb-pill-teal">Signature</span>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
                A chronological ledger of what was previously known, what changed, and what is now known across Indian finance.
              </p>
              <Link to="/change-ledger" className="btn ghost" style={{ width: '100%', textAlign: 'center' }}>
                Explore Change Ledger →
              </Link>
            </section>

            {/* IPO Intelligence Teaser */}
            <section className="card snap" style={{ marginBottom: '20px' }}>
              <div className="sec-h">
                <h2>IPO INTELLIGENCE</h2>
                <Link to="/ipo" className="sb-sec-link">
                  View All →
                </Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {ipoRecords.slice(0, 3).map((rec) => (
                  <Link
                    key={rec.id}
                    to={`/ipo/${rec.slug}`}
                    style={{
                      display: 'block',
                      padding: '10px',
                      background: 'var(--bg)',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      color: 'inherit',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '13px' }}>{rec.company}</strong>
                      <span className="pill" style={{ fontSize: '10px', flexShrink: 0 }}>
                        {IPO_STATUS_LABELS[lang][rec.status]}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Issue: {rec.issueSize ?? 'Not announced'} · {rec.segment}
                    </div>
                  </Link>
                ))}
              </div>
              <Link to="/ipo" className="btn ghost" style={{ width: '100%', marginTop: '12px', textAlign: 'center' }}>
                Open IPO Dossiers →
              </Link>
            </section>

            {/* Editorial Standard */}
            <section className="card snap">
              <div className="sec-h">
                <h2>EDITORIAL POLICY</h2>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6' }}>
                SakarBazaar strictly separates confirmed regulatory/exchange filings from unverified claims. We never fabricate stock prices, indices or subscription levels.
              </p>
            </section>
          </aside>
        </div>

        {/* ── ECONOMIC & IPO CALENDAR STRIP ──────────────────────────── */}
        <div style={{ marginTop: '24px' }}>
          <EditorialCalendarStrip calendarEvents={CALENDAR_SCHEDULE} />
        </div>
      </main>
    </>
  );
}
