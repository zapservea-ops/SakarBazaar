import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { CATEGORY_LABELS, IPO_STATUS_LABELS } from '../data/i18n';
import { IPO_ALL_RECORDS } from '../data/sampleData';

export function WatchlistPage() {
  const {
    lang,
    ui,
    bookmarks,
    watchlistIds,
    articlesCatalog,
    toggleBookmark,
    toggleWatchlist,
  } = useSakarBazaar();

  useEffect(() => {
    document.title = `${ui.watchlistPageTitle} – SakarBazaar`;
  }, [ui.watchlistPageTitle]);

  const savedArticles = articlesCatalog.filter((a) => bookmarks.has(a.headline));
  const trackedIpos = IPO_ALL_RECORDS.filter((ipo) => watchlistIds.has(ipo.id));
  const untrackedIpos = IPO_ALL_RECORDS.filter((ipo) => !watchlistIds.has(ipo.id));

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
                        <span className="pill">
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
              <h2>Market Resources</h2>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
              Access official Indian market and exchange resources. Live market data is not currently available on SakarBazaar.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <a
                href="https://www.nseindia.com/"
                target="_blank"
                rel="noreferrer"
                className="btn ghost"
                style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}
              >
                <span>National Stock Exchange (NSE)</span>
                <span className="meta" style={{ color: 'var(--teal)' }}>nseindia.com ↗</span>
              </a>
              <a
                href="https://www.bseindia.com/"
                target="_blank"
                rel="noreferrer"
                className="btn ghost"
                style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}
              >
                <span>BSE India</span>
                <span className="meta" style={{ color: 'var(--teal)' }}>bseindia.com ↗</span>
              </a>
              <a
                href="https://www.mcxindia.com/"
                target="_blank"
                rel="noreferrer"
                className="btn ghost"
                style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}
              >
                <span>Multi Commodity Exchange (MCX)</span>
                <span className="meta" style={{ color: 'var(--teal)' }}>mcxindia.com ↗</span>
              </a>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
