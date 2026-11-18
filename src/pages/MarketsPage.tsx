import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { CATEGORY_LABELS } from '../data/i18n';
import { MARKET_PULSE_ITEMS } from '../data/sampleData';
import type { MarketDataStatus } from '../types/sakarbazaar';
import {
  formatIndianNumber,
  formatIstDisplayTimestamp,
  getArrowSymbol,
  getChangeClass,
  getExchangePhaseLabel,
  getMarketQuoteStatusLabel,
  getSignPrefix,
} from '../utils/marketFormat';

function getStatusPillClass(status: MarketDataStatus): string {
  if (status === 'stale') return 'pill sb-pill-amber';
  if (status === 'delayed') return 'pill sb-pill-amber';
  if (status === 'live') return 'pill';
  return 'pill sb-pill-muted';
}

export function MarketsPage() {
  const {
    lang,
    ui,
    ist,
    marketData,
    marketLoading,
    marketError,
    articlesCatalog,
    watchlistIds,
    bookmarks,
    toggleWatchlist,
    toggleBookmark,
    refreshMarketData,
  } = useSakarBazaar();

  useEffect(() => {
    document.title = `${ui.marketsPageTitle} – SakarBazaar`;
  }, [ui.marketsPageTitle]);

  const benchmarksAndMacro = [...marketData.indices, ...marketData.indicators];
  const formattedAsOf = formatIstDisplayTimestamp(marketData.asOf);
  const formattedRetrievedAt = formatIstDisplayTimestamp(marketData.retrievedAt);
  const sessionPhaseLabel = getExchangePhaseLabel(marketData.marketStatus, lang);

  let bannerTitle = ui.liveDataUnavailable;
  let bannerDetail = ui.liveDataUnavailableDetail;
  if (marketLoading && !marketData.providerConfigured) {
    bannerTitle = ui.loadingMarketData;
  } else if (marketData.status === 'stale') {
    bannerTitle = ui.staleDataNotice;
    bannerDetail = marketError || 'Upstream refresh delayed or failed cleanly; showing last valid quote.';
  } else if (marketData.status === 'delayed') {
    bannerTitle = ui.delayedDataNotice;
    bannerDetail = `Source: ${marketData.provider} · Auto-refresh every ${marketData.refreshIntervalSeconds}s.`;
  } else if (marketData.status === 'market_closed') {
    bannerTitle = ui.marketClosedNotice;
    bannerDetail = formattedAsOf
      ? `Last official session timestamp: ${formattedAsOf} (${sessionPhaseLabel}).`
      : `Exchange session status: ${sessionPhaseLabel}.`;
  } else if (marketData.status === 'live') {
    bannerTitle = `${marketData.provider} active (${sessionPhaseLabel})`;
    bannerDetail = `Auto-refresh interval: ${marketData.refreshIntervalSeconds}s.`;
  }

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/"
        parentLabel={ui.backToMarkets}
        currentLabel={ui.marketsPageTitle}
      />

      <div className="sb-page-head">
        <div>
          <h1>{ui.marketsPageTitle}</h1>
          <p>{ui.marketsPageSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={getStatusPillClass(marketData.status)}>
            {getMarketQuoteStatusLabel(marketData.status, lang)} · {sessionPhaseLabel}
          </span>
          <span className="pill sb-pill-muted">{ist.clockText}</span>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void refreshMarketData()}
          >
            Refresh ({marketData.refreshIntervalSeconds}s auto)
          </button>
        </div>
      </div>

      <div className="sb-sample-banner" role="status">
        <div>
          <strong>{bannerTitle}</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{bannerDetail}</span>
          <div className="meta" style={{ marginTop: '6px' }}>
            {ui.sourceLabel}: {marketData.provider} · {ui.lastUpdatedLabel}:{' '}
            {formattedAsOf ?? 'Unavailable'} · Server check: {formattedRetrievedAt ?? ist.clockText}
          </div>
        </div>
        <span className="meta">
          Verify official levels on{' '}
          <a
            href="https://www.nseindia.com"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--teal)', fontWeight: 600 }}
          >
            NSE India
          </a>{' '}
          &amp;{' '}
          <a
            href="https://www.bseindia.com"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--teal)', fontWeight: 600 }}
          >
            BSE India
          </a>
        </span>
      </div>

      <section aria-labelledby="indices-heading" style={{ marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px 24px', borderLeft: '3px solid var(--teal)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <strong style={{ fontSize: '15px' }}>Market Quotations Infrastructure</strong>
            <span className="pill sb-pill-muted">Strict Zero-Fabrication Policy</span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
            Real-time NSE and BSE quotes remain decoupled until an authorized, licensed data feed is connected.
            SakarBazaar's primary focus is <strong>Financial Intelligence, Corporate Actions, and Regulatory Tracking</strong>.
          </p>
        </div>
      </section>

      <div className="sb-two-col">
        <div>
          <section className="card snap" style={{ marginBottom: '20px' }}>
            <div className="sec-h">
              <h2>
                {ui.equitiesOverview} ({marketData.equities.length})
              </h2>
              <span className="meta">
                {getMarketQuoteStatusLabel(marketData.status, lang)}
              </span>
            </div>

            <div className="tbl sb-desktop-table">
              <table style={{ minWidth: '640px' }}>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Symbol</th>
                    <th>Price</th>
                    <th>Change</th>
                    <th>{ui.dayRangeLabel}</th>
                    <th>{ui.lastUpdatedLabel}</th>
                    <th className="n">{ui.tableTrack}</th>
                  </tr>
                </thead>
                <tbody>
                  {marketData.equities.map((eq) => {
                    const isTracked = watchlistIds.has(eq.id);
                    const hasPrice = eq.latestPrice !== null;
                    const hasChange = hasPrice && eq.absoluteChange !== null;
                    const chg = eq.absoluteChange ?? 0;
                    const pct = eq.percentChange;
                    const cls = hasChange ? getChangeClass(chg) : '';
                    const quoteUpdated = formatIstDisplayTimestamp(eq.providerTimestamp);

                    return (
                      <tr key={eq.id}>
                        <td>
                          <b>{eq.instrumentName}</b>
                          <div className="meta">{eq.source}</div>
                        </td>
                        <td className="num">
                          {eq.symbol}
                          <div className="meta">{eq.exchange}</div>
                        </td>
                        <td className="num">
                          {hasPrice
                            ? `${eq.prefix ?? ''}${formatIndianNumber(eq.latestPrice as number)}`
                            : 'Unavailable'}
                        </td>
                        <td className={`num ${cls}`}>
                          {hasChange ? (
                            <>
                              {getArrowSymbol(chg)} {getSignPrefix(chg)}
                              {formatIndianNumber(chg)}
                              {pct !== null
                                ? ` (${getSignPrefix(pct)}${formatIndianNumber(pct)}%)`
                                : ''}
                            </>
                          ) : (
                            <span className="meta">—</span>
                          )}
                        </td>
                        <td className="meta num">
                          {eq.dayHigh !== null && eq.dayLow !== null
                            ? `${eq.prefix ?? ''}${formatIndianNumber(eq.dayHigh)} / ${eq.prefix ?? ''}${formatIndianNumber(eq.dayLow)}`
                            : '—'}
                        </td>
                        <td className="meta">
                          <div>{getMarketQuoteStatusLabel(eq.availabilityStatus, lang)}</div>
                          {quoteUpdated && <div>{quoteUpdated}</div>}
                        </td>
                        <td className="n">
                          <button
                            type="button"
                            className="bm"
                            aria-pressed={isTracked}
                            aria-label={
                              isTracked
                                ? `Remove ${eq.symbol} from watchlist`
                                : `Add ${eq.symbol} to watchlist`
                            }
                            onClick={() => toggleWatchlist(eq.id)}
                          >
                            <svg
                              width="16"
                              height="18"
                              viewBox="0 0 18 20"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              aria-hidden="true"
                            >
                              <path d="M3 2h12v16l-6-4-6 4z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="sb-ipo-mobile-cards">
              {marketData.equities.map((eq) => {
                const isTracked = watchlistIds.has(eq.id);
                const hasPrice = eq.latestPrice !== null;
                const hasChange = hasPrice && eq.absoluteChange !== null;
                const chg = eq.absoluteChange ?? 0;
                const pct = eq.percentChange;
                const cls = hasChange ? getChangeClass(chg) : '';
                const quoteUpdated = formatIstDisplayTimestamp(eq.providerTimestamp);

                return (
                  <div className="card sb-ipo-card" key={eq.id}>
                    <div className="sb-ipo-card-head">
                      <div>
                        <span className="meta">
                          {eq.exchange} · {eq.symbol} ·{' '}
                          {getMarketQuoteStatusLabel(eq.availabilityStatus, lang)}
                        </span>
                        <h3 style={{ fontSize: '16px' }}>{eq.instrumentName}</h3>
                      </div>
                      <button
                        type="button"
                        className="bm"
                        aria-pressed={isTracked}
                        aria-label={
                          isTracked
                            ? `Remove ${eq.symbol} from watchlist`
                            : `Add ${eq.symbol} to watchlist`
                        }
                        onClick={() => toggleWatchlist(eq.id)}
                      >
                        <svg
                          width="16"
                          height="18"
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
                    {hasPrice ? (
                      <div className="sb-ipo-card-grid">
                        <div>
                          <span className="meta">Price</span>
                          <div className="num" style={{ fontWeight: 700 }}>
                            {eq.prefix ?? ''}
                            {formatIndianNumber(eq.latestPrice as number)}
                          </div>
                        </div>
                        {hasChange && (
                          <div>
                            <span className="meta">Change</span>
                            <div className={`num ${cls}`} style={{ fontWeight: 600 }}>
                              {getArrowSymbol(chg)} {getSignPrefix(chg)}
                              {formatIndianNumber(chg)}
                              {pct !== null
                                ? ` (${getSignPrefix(pct)}${formatIndianNumber(pct)}%)`
                                : ''}
                            </div>
                          </div>
                        )}
                        <div>
                          <span className="meta">{ui.sourceLabel}</span>
                          <div>{eq.source}</div>
                        </div>
                        {quoteUpdated && (
                          <div>
                            <span className="meta">{ui.lastUpdatedLabel}</span>
                            <div>{quoteUpdated}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="meta">{ui.liveDataUnavailable}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── MARKET INTELLIGENCE PULSE ───────────────────────────────── */}
          <section className="card" style={{ marginTop: 0 }}>
            <div className="sec-h" style={{ marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0 }}>
                  SAKARBAZAAR <span style={{ color: 'var(--teal)' }}>INTELLIGENCE PULSE</span>
                </h2>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '13px',
                    color: 'var(--muted)',
                  }}
                >
                  Regulatory, macro &amp; corporate developments. Sources: RBI, SEBI,
                  MoSPI, NSE, BSE, PIB.
                </p>
              </div>
            </div>

            <div className="sb-pulse-feed">
              {MARKET_PULSE_ITEMS.map((item) => {
                const title = lang === 'hi' && item.titleHi ? item.titleHi : item.title;
                const summary =
                  lang === 'hi' && item.summaryHi ? item.summaryHi : item.summary;

                const categoryColors: Record<string, string> = {
                  RBI: 'var(--teal)',
                  Regulatory: '#8b5cf6',
                  Corporate: '#f59e0b',
                  Economy: '#3b82f6',
                  'Commodity/FX': '#10b981',
                  Markets: '#ef4444',
                };
                const catColor = categoryColors[item.category] ?? 'var(--teal)';

                return (
                  <div
                    key={item.id}
                    className="sb-pulse-row"
                    style={{
                      borderLeft: `3px solid ${catColor}`,
                      paddingLeft: '14px',
                      marginBottom: '20px',
                      paddingBottom: '20px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {/* Header row */}
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
                      <span className="meta" style={{ marginLeft: 'auto', fontSize: '12px' }}>
                        {item.timestamp}
                      </span>
                    </div>

                    {/* Title */}
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

                    {/* Summary */}
                    <p
                      style={{
                        margin: '0 0 8px',
                        fontSize: '14px',
                        lineHeight: '1.6',
                        color: 'var(--text)',
                        opacity: 0.85,
                      }}
                    >
                      {summary}
                    </p>

                    {/* Actionable context */}
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

                    {/* Source */}
                    <div className="src" style={{ fontSize: '12px' }}>
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

          {/* ── MARKET NEWS FEED ──────────────────────────────────────────── */}
          <section className="card feed" style={{ marginTop: 0 }}>
            <div className="sec-h">
              <h2>{ui.marketNewsHeading}</h2>
              <Link to="/news" className="meta" style={{ color: 'var(--teal)', fontWeight: 600 }}>
                {ui.allStories} →
              </Link>
            </div>

            <div>
              {articlesCatalog.map((item) => {
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
                      aria-label={
                        isSaved
                          ? `Remove bookmark for ${item.headline}`
                          : `Bookmark ${item.headline}`
                      }
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
          </section>
        </div>

        <aside>
          <section className="card snap">
            <div className="sec-h">
              <h2>MARKET EXPLAINERS</h2>
            </div>
            <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: '13px', lineHeight: '1.5' }}>
              Educational breakdowns of institutional market dynamics, liquidity windows, and SEBI surveillance.
            </p>
            <Link to="/explainers" className="btn ghost" style={{ width: '100%', textAlign: 'center' }}>
              Browse Explainers →
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
