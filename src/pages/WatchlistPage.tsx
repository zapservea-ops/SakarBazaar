import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { CATEGORY_LABELS, IPO_STATUS_LABELS } from '../data/i18n';
import { IPO_ALL_RECORDS } from '../data/sampleData';
import {
  formatIndianNumber,
  getArrowSymbol,
  getChangeClass,
  getSignPrefix,
} from '../utils/marketFormat';

export function WatchlistPage() {
  const {
    lang,
    ui,
    bookmarks,
    watchlistIds,
    articlesCatalog,
    allMarketInstruments,
    toggleBookmark,
    toggleWatchlist,
  } = useSakarBazaar();

  useEffect(() => {
    document.title = `${ui.watchlistPageTitle} – SakarBazaar`;
  }, [ui.watchlistPageTitle]);

  const savedArticles = articlesCatalog.filter((a) => bookmarks.has(a.headline));
  const trackedIpos = IPO_ALL_RECORDS.filter((ipo) => watchlistIds.has(ipo.id));
  const untrackedIpos = IPO_ALL_RECORDS.filter((ipo) => !watchlistIds.has(ipo.id));
  const trackedInstruments = allMarketInstruments.filter((inst) =>
    watchlistIds.has(inst.id),
  );
  const untrackedInstruments = allMarketInstruments.filter(
    (inst) => !watchlistIds.has(inst.id),
  );

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/"
        parentLabel={ui.backToMarkets}
        currentLabel={ui.watchlistPageTitle}
      />

      <div className="sb-page-head">
        <div>
          <h1>{ui.watchlistPageTitle}</h1>
          <p>{ui.watchlistPageSubtitle}</p>
        </div>
        <span className="pill sb-pill-muted">Browser local storage</span>
      </div>

      <div className="sb-two-col">
        <div>
          <section className="card snap" style={{ marginBottom: '20px' }}>
            <div className="sec-h">
              <h2>
                {ui.savedStoriesHeading} ({savedArticles.length})
              </h2>
              <Link to="/news" className="meta" style={{ color: 'var(--teal)', fontWeight: 600 }}>
                {ui.allStories} →
              </Link>
            </div>

            {savedArticles.length > 0 ? (
              <div>
                {savedArticles.map((article) => (
                  <div className="sb-watchlist-item" key={article.id}>
                    <div style={{ minWidth: 0 }}>
                      <span className="cat">{CATEGORY_LABELS[lang][article.category]}</span>
                      <Link
                        to={`/article/${article.slug}`}
                        style={{ display: 'block', fontWeight: 600, marginTop: '2px' }}
                      >
                        {lang === 'hi' && article.headlineHi
                          ? article.headlineHi
                          : article.headline}
                      </Link>
                      <small style={{ color: 'var(--muted)' }}>
                        {article.ticker} · {article.publishedAt} · {article.readTime}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => toggleBookmark(article.headline)}
                    >
                      {ui.removeLabel}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--muted)' }}>{ui.emptySavedStories}</p>
            )}
          </section>

          <section className="card snap">
            <div className="sec-h">
              <h2>
                {ui.trackedIposHeading} ({trackedIpos.length})
              </h2>
              <Link to="/ipo" className="meta" style={{ color: 'var(--teal)', fontWeight: 600 }}>
                {ui.ipoPageTitle} →
              </Link>
            </div>

            {trackedIpos.length > 0 ? (
              <div>
                {trackedIpos.map((ipo) => (
                  <div className="sb-watchlist-item" key={ipo.id}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span
                          className={`pill ${
                            ipo.verificationStatus === 'awaiting_verification' ? 'sb-pill-amber' : ''
                          }`}
                        >
                          {IPO_STATUS_LABELS[lang][ipo.status]}
                        </span>
                        <span className="meta">{ipo.segment}</span>
                      </div>
                      <Link to={`/ipo/${ipo.slug}`} style={{ fontWeight: 600 }}>
                        {ipo.company}
                      </Link>
                      <small style={{ display: 'block', color: 'var(--muted)' }}>
                        {ipo.priceBand ?? 'Price band TBD'} · {ipo.issueSize ?? 'Size TBD'}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => toggleWatchlist(ipo.id)}
                    >
                      {ui.removeLabel}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--muted)' }}>{ui.emptyTrackedIpos}</p>
            )}

            {untrackedIpos.length > 0 && (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
                <div className="meta" style={{ marginBottom: '8px' }}>
                  {ui.addIposHeading}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {untrackedIpos.map((ipo) => (
                    <button
                      key={ipo.id}
                      type="button"
                      className="btn ghost"
                      onClick={() => toggleWatchlist(ipo.id)}
                    >
                      + {ipo.company}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <aside>
          <section className="card snap">
            <div className="sec-h">
              <h2>
                {ui.trackedIndicesHeading} ({trackedInstruments.length})
              </h2>
              <span className="meta">NSE / BSE / MCX</span>
            </div>

            {trackedInstruments.length > 0 ? (
              <div>
                {trackedInstruments.map((inst) => {
                  const hasPrice = inst.latestPrice !== null;
                  const hasChange = hasPrice && inst.absoluteChange !== null;
                  const chg = inst.absoluteChange ?? 0;
                  const pct = inst.percentChange;
                  return (
                    <div className="sb-watchlist-item" key={inst.id}>
                      <div>
                        <strong>{inst.instrumentName}</strong>
                        <small style={{ display: 'block', color: 'var(--muted)' }}>
                          {inst.exchange} ·{' '}
                          {hasPrice
                            ? `${inst.prefix ?? ''}${formatIndianNumber(inst.latestPrice as number)}`
                            : 'Unavailable'}
                          {' · '}
                          {inst.source}
                        </small>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {hasChange && (
                          <span className={`num ${getChangeClass(chg)}`}>
                            {getArrowSymbol(chg)} {getSignPrefix(chg)}
                            {formatIndianNumber(chg)}
                            {pct !== null ? ` (${getSignPrefix(pct)}${formatIndianNumber(pct)}%)` : ''}
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => toggleWatchlist(inst.id)}
                        >
                          {ui.removeLabel}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '14px' }}>
                {ui.emptyTrackedIndices}
              </p>
            )}

            {untrackedInstruments.length > 0 && (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
                <div className="meta" style={{ marginBottom: '8px' }}>
                  {ui.addIndicesHeading}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {untrackedInstruments.map((inst) => (
                    <button
                      key={inst.id}
                      type="button"
                      className="btn ghost"
                      onClick={() => toggleWatchlist(inst.id)}
                    >
                      + {inst.symbol}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
