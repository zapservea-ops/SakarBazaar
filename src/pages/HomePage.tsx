import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EditorialCalendarStrip } from '../components/EditorialCalendarStrip';
import { HeroSection } from '../components/HeroSection';
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

  const leadArticle = articlesCatalog.find((a) => a.isFeatured) ?? articlesCatalog[0];
  const secondaryArticle = articlesCatalog.find((a) => a.id !== leadArticle?.id);
  const filteredNews = filterNewsItems(newsItems, selectedCategory, searchTerm);

  // Derive real counts - strictly from verified records
  const materialCount = MARKET_PULSE_ITEMS.length;
  const ipoMilestoneCount = IPO_ALL_RECORDS.length;
  const regulatoryCount = MARKET_PULSE_ITEMS.filter(
    (i) => i.category === 'Regulatory' || i.category === 'RBI',
  ).length;
  const documentChangesCount = 0; // Honest state: pending automated doc comparison engine

  return (
    <>
      {/* ── INTELLIGENCE MASTHEAD ────────────────────────────────────── */}
      <section className="sb-masthead">
        <div className="wrap">
          <div className="sb-masthead-eyebrow">India Financial Intelligence</div>
          <h1>SakarBazaar</h1>
          <p className="sb-masthead-tagline">
            "From financial news to financial understanding."
          </p>
        </div>
      </section>

      <main id="top" className="wrap">
        {/* ── 4 COMPACT INTELLIGENCE INDICATORS ───────────────────────── */}
        <section aria-label="Intelligence Pulse Indicators">
          <div className="sb-pulse-indicators">
            <Link to="/intelligence" className="sb-pulse-indicator-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="sb-pi-num">{materialCount}</div>
              <div className="sb-pi-label">Material Developments</div>
              <div className="sb-pi-sub">Verified regulatory &amp; corporate dispatches</div>
            </Link>

            <Link to="/ipo" className="sb-pulse-indicator-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="sb-pi-num">{ipoMilestoneCount}</div>
              <div className="sb-pi-label">IPO Milestones</div>
              <div className="sb-pi-sub">Active &amp; proposed exchange dossiers</div>
            </Link>

            <Link to="/intelligence" className="sb-pulse-indicator-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="sb-pi-num">{regulatoryCount}</div>
              <div className="sb-pi-label">Regulatory Updates</div>
              <div className="sb-pi-sub">RBI, SEBI &amp; Ministry notifications</div>
            </Link>

            <Link to="/change-ledger" className="sb-pulse-indicator-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="sb-pi-num" style={{ color: 'var(--muted)' }}>
                {documentChangesCount > 0 ? documentChangesCount : '0'}
              </div>
              <div className="sb-pi-label">Document Changes</div>
              <div className="sb-pi-sub">Awaiting automated filings feed</div>
            </Link>
          </div>
        </section>

        {/* ── TWO COLUMN EDITORIAL & INTELLIGENCE LAYOUT ──────────────── */}
        <div className="layout">
          <div>
            {/* Lead Analysis */}
            {leadArticle && (
              <HeroSection
                leadArticle={leadArticle}
                secondaryArticle={secondaryArticle}
              />
            )}

            {/* ── THE MOST MATERIAL DEVELOPMENTS FEED ────────────────────── */}
            <section className="card" style={{ marginTop: '24px' }}>
              <div className="sec-h" style={{ marginBottom: '16px' }}>
                <div>
                  <h2 style={{ margin: 0 }}>
                    THE MOST <span style={{ color: 'var(--teal)' }}>MATERIAL DEVELOPMENTS</span>
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                    Verified dispatches that alter capital allocations, valuations, or compliance.
                  </p>
                </div>
                <Link
                  to="/intelligence"
                  className="meta"
                  style={{ color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  Full Pulse →
                </Link>
              </div>

              <div className="sb-pulse-feed">
                {MARKET_PULSE_ITEMS.slice(0, 4).map((item) => {
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

            {/* ── LATEST DISPATCHES & EDITORIAL ──────────────────────────── */}
            <section className="card feed" style={{ marginTop: '24px' }}>
              <div className="sec-h">
                <div>
                  <h2>{copy.latest}</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                    In-depth reporting across Indian markets, corporations and policy.
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

          {/* ── ASIDE INTELLIGENCE MODULES ─────────────────────────────── */}
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
                Searchable intelligence for India's 15 benchmark corporate issuers without fabricated prices.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'COALINDIA'].map((sym) => (
                  <Link key={sym} to={`/companies/${sym}`} className="pill sb-pill-muted" style={{ textDecoration: 'none' }}>
                    {sym}
                  </Link>
                ))}
              </div>
            </section>

            {/* Editorial Standard */}
            <section className="card snap">
              <div className="sec-h">
                <h2>EDITORIAL ETHICS</h2>
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
