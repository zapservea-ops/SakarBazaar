import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EditorialArt } from '../components/EditorialArt';
import { EditorialCalendarStrip } from '../components/EditorialCalendarStrip';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { CATEGORY_LABELS, IPO_STATUS_LABELS } from '../data/i18n';
import {
  CALENDAR_SCHEDULE,
  HOMEPAGE_NEWS_CATEGORIES,
  IPO_ALL_RECORDS,
  MARKET_PULSE_ITEMS,
} from '../data/sampleData';
import type { HomepageNewsCategory } from '../types/sakarbazaar';
import { filterNewsItems } from '../utils/marketFormat';

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
    toggleBookmark,
  } = useSakarBazaar();

  const [selectedCategory, setSelectedCategory] = useState<HomepageNewsCategory>('All');
  const [shownNewsCount, setShownNewsCount] = useState(6);

  useEffect(() => {
    document.title = 'SakarBazaar – India Financial Intelligence';
  }, []);

  // Top 3 featured articles
  const topThreeArticles = articlesCatalog.slice(0, 3);
  const leadArticle = topThreeArticles[0];
  const secondArticle = topThreeArticles[1];
  const thirdArticle = topThreeArticles[2];

  const filteredNews = filterNewsItems(newsItems, selectedCategory, searchTerm);

  return (
    <>
      {/* ── EDITORIAL NEWSPAPER MASTHEAD ────────────────────────────── */}
      <section className="sb-masthead">
        <div className="wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div className="sb-masthead-eyebrow">India Financial Intelligence</div>
              <h1>SakarBazaar</h1>
              <p className="sb-masthead-tagline">
                "From financial news to financial understanding."
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Link to="/news" className="btn ghost" style={{ fontSize: '13px' }}>
                Latest News →
              </Link>
              <Link to="/intelligence" className="btn" style={{ fontSize: '13px' }}>
                Intelligence Pulse →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <main id="top" className="wrap">
        {/* ── PROMINENT TOP THREE FINANCIAL STORIES ───────────────────── */}
        <section aria-label="Lead Financial Stories" style={{ marginBottom: '32px' }}>
          <div className="sec-h" style={{ marginBottom: '16px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px' }}>
                PRIMARY <span style={{ color: 'var(--teal)' }}>DISPATCHES</span>
              </h2>
              <span className="meta">Verified editorial coverage &amp; corporate developments</span>
            </div>
            <Link to="/news" className="meta" style={{ color: 'var(--teal)', fontWeight: 600 }}>
              All News ({articlesCatalog.length}) →
            </Link>
          </div>

          <div className="sb-three-stories-grid">
            {/* Story 1: Lead Article */}
            {leadArticle && (
              <article className="card sb-story-featured">
                <Link to={`/article/${leadArticle.slug}`} aria-label={leadArticle.headline}>
                  <EditorialArt
                    variant={leadArticle.illustration}
                    label={leadArticle.illustrationCaption}
                  />
                </Link>
                <div style={{ marginTop: '14px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <span className="cat">{CATEGORY_LABELS[lang][leadArticle.category]}</span>
                    {leadArticle.verificationStatus === 'awaiting_verification' ? (
                      <span className="pill sb-pill-amber" style={{ fontSize: '11px' }}>
                        ⏳ Awaiting Verification
                      </span>
                    ) : (
                      <span className="pill sb-pill-teal" style={{ fontSize: '11px' }}>
                        ✓ Verified
                      </span>
                    )}
                    {leadArticle.media && (
                      <span className="pill" style={{ background: '#0b6b6b', color: '#fff', fontSize: '11px' }}>
                        ▶ Video Brief
                      </span>
                    )}
                    <span className="meta">{leadArticle.time} · {leadArticle.readTime}</span>
                  </div>
                  <h3 style={{ fontSize: '20px', lineHeight: '1.3', margin: '0 0 10px' }}>
                    <Link to={`/article/${leadArticle.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {lang === 'hi' && leadArticle.headlineHi ? leadArticle.headlineHi : leadArticle.headline}
                    </Link>
                  </h3>
                  <p style={{ margin: '0 0 12px', fontSize: '14px', lineHeight: '1.55', color: 'var(--muted)' }}>
                    {lang === 'hi' && leadArticle.deckHi ? leadArticle.deckHi : leadArticle.deck}
                  </p>
                  <div className="src" style={{ fontSize: '12px' }}>
                    <b>{leadArticle.ticker}</b> · {leadArticle.author}
                  </div>
                </div>
              </article>
            )}

            {/* Story 2: Second Article */}
            {secondArticle && (
              <article className="card sb-story-secondary">
                <Link to={`/article/${secondArticle.slug}`} aria-label={secondArticle.headline}>
                  <EditorialArt
                    variant={secondArticle.illustration}
                    label={secondArticle.illustrationCaption}
                    compact
                  />
                </Link>
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <span className="cat">{CATEGORY_LABELS[lang][secondArticle.category]}</span>
                    {secondArticle.verificationStatus === 'awaiting_verification' ? (
                      <span className="pill sb-pill-amber" style={{ fontSize: '11px' }}>
                        ⏳ Awaiting Verification
                      </span>
                    ) : (
                      <span className="pill sb-pill-teal" style={{ fontSize: '11px' }}>
                        ✓ Verified
                      </span>
                    )}
                    <span className="meta">{secondArticle.time}</span>
                  </div>
                  <h3 style={{ fontSize: '17px', lineHeight: '1.35', margin: '0 0 8px' }}>
                    <Link to={`/article/${secondArticle.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {lang === 'hi' && secondArticle.headlineHi ? secondArticle.headlineHi : secondArticle.headline}
                    </Link>
                  </h3>
                  <p style={{ margin: '0 0 10px', fontSize: '13px', lineHeight: '1.5', color: 'var(--muted)' }}>
                    {lang === 'hi' && secondArticle.deckHi ? secondArticle.deckHi : secondArticle.deck}
                  </p>
                  <div className="src" style={{ fontSize: '12px' }}>
                    <b>{secondArticle.ticker}</b> · {secondArticle.author}
                  </div>
                </div>
              </article>
            )}

            {/* Story 3: NHC Foods (New Article with Video) */}
            {thirdArticle && (
              <article className="card sb-story-secondary">
                <Link to={`/article/${thirdArticle.slug}`} aria-label={thirdArticle.headline}>
                  <EditorialArt
                    variant={thirdArticle.illustration}
                    label={thirdArticle.illustrationCaption}
                    compact
                  />
                </Link>
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <span className="cat">{CATEGORY_LABELS[lang][thirdArticle.category]}</span>
                    <span className="pill sb-pill-teal" style={{ fontSize: '11px' }}>
                      ✓ Official BSE Filing
                    </span>
                    {thirdArticle.media && (
                      <span className="pill" style={{ background: '#0b6b6b', color: '#fff', fontSize: '11px' }}>
                        ▶ Includes Video
                      </span>
                    )}
                    <span className="meta">{thirdArticle.time}</span>
                  </div>
                  <h3 style={{ fontSize: '17px', lineHeight: '1.35', margin: '0 0 8px' }}>
                    <Link to={`/article/${thirdArticle.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {lang === 'hi' && thirdArticle.headlineHi ? thirdArticle.headlineHi : thirdArticle.headline}
                    </Link>
                  </h3>
                  <p style={{ margin: '0 0 10px', fontSize: '13px', lineHeight: '1.5', color: 'var(--muted)' }}>
                    {lang === 'hi' && thirdArticle.deckHi ? thirdArticle.deckHi : thirdArticle.deck}
                  </p>
                  <div className="src" style={{ fontSize: '12px' }}>
                    <b>{thirdArticle.ticker}</b> · {thirdArticle.author}
                  </div>
                </div>
              </article>
            )}
          </div>
        </section>

        {/* ── TWO COLUMN EDITORIAL & INTELLIGENCE LAYOUT ──────────────── */}
        <div className="layout">
          <div>
            {/* ── THE MOST MATERIAL DEVELOPMENTS FEED ────────────────────── */}
            <section className="card" style={{ marginTop: 0 }}>
              <div className="sec-h" style={{ marginBottom: '16px' }}>
                <div>
                  <h2 style={{ margin: 0 }}>
                    THE MOST <span style={{ color: 'var(--teal)' }}>MATERIAL DEVELOPMENTS</span>
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                    Verified dispatches that alter capital allocations, valuations, or regulatory compliance.
                  </p>
                </div>
                <Link
                  to="/intelligence"
                  className="meta"
                  style={{ color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  Full Intelligence Pulse ({MARKET_PULSE_ITEMS.length}) →
                </Link>
              </div>

              <div className="sb-pulse-feed">
                {MARKET_PULSE_ITEMS.slice(0, 5).map((item) => {
                  const isVerified = item.verificationStatus === 'verified';
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
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px',
                          alignItems: 'center',
                          marginBottom: '6px',
                        }}
                      >
                        <span
                          className="pill"
                          style={{ background: catColor, color: '#fff', fontSize: '11px' }}
                        >
                          {item.category}
                        </span>
                        {isVerified ? (
                          <span
                            className="pill"
                            style={{
                              background: 'rgba(16,185,129,0.15)',
                              color: '#10b981',
                              border: '1px solid rgba(16,185,129,0.4)',
                              fontSize: '11px',
                            }}
                          >
                            ✓ Verified
                          </span>
                        ) : (
                          <span className="pill sb-pill-amber" style={{ fontSize: '11px' }}>
                            ⏳ Awaiting Official Verification
                          </span>
                        )}
                        <span className="meta" style={{ marginLeft: 'auto', fontSize: '12px' }}>
                          {item.timestamp}
                        </span>
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

                      <p
                        style={{
                          margin: '0 0 8px',
                          fontSize: '14px',
                          lineHeight: '1.55',
                          color: 'var(--text)',
                          opacity: 0.9,
                        }}
                      >
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
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                    Continuous reporting across Indian markets, corporations and policy.
                  </p>
                </div>
                <Link to="/news" className="meta" style={{ color: 'var(--teal)', fontWeight: 600 }}>
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
                  return (
                    <div className="item" key={item.id}>
                      <span className="t">{item.time}</span>
                      <div>
                        <span className="cat">{CATEGORY_LABELS[lang][item.category]}</span>
                        <Link className="h" to={`/article/${item.slug}`}>
                          {lang === 'hi' && item.headlineHi ? item.headlineHi : item.headline}
                        </Link>
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
          <aside>
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
                <Link to="/ipo" className="meta" style={{ color: 'var(--teal)', fontWeight: 600 }}>
                  View All →
                </Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {IPO_ALL_RECORDS.slice(0, 3).map((rec) => (
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '13px' }}>{rec.company}</strong>
                      <span
                        className={`pill ${rec.verificationStatus === 'awaiting_verification' ? 'sb-pill-amber' : ''}`}
                        style={{ fontSize: '10px' }}
                      >
                        {IPO_STATUS_LABELS[lang][rec.status]}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Issue: {rec.issueSize ?? 'TBD'} · {rec.segment}
                    </div>
                  </Link>
                ))}
              </div>
              <Link to="/ipo" className="btn ghost" style={{ width: '100%', marginTop: '12px', textAlign: 'center' }}>
                Open IPO Dossiers →
              </Link>
            </section>

            {/* Companies Catalogue Teaser */}
            <section className="card snap" style={{ marginBottom: '20px' }}>
              <div className="sec-h">
                <h2>COMPANIES</h2>
                <Link to="/companies" className="meta" style={{ color: 'var(--teal)', fontWeight: 600 }}>
                  Catalogue →
                </Link>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
                Searchable corporate intelligence for India's benchmark corporate issuers with official disclosures.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ITC', 'COALINDIA'].map((sym) => (
                  <Link key={sym} to={`/companies/${sym}`} className="pill sb-pill-muted" style={{ textDecoration: 'none' }}>
                    {sym}
                  </Link>
                ))}
              </div>
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
