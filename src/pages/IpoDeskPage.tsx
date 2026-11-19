import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { IPO_STATUS_LABELS } from '../data/i18n';
import type { IpoSegment, IpoStatus } from '../types/sakarbazaar';
import { filterIpoRows, getVerifiedIpoCounts } from '../utils/marketFormat';

const SEGMENTS: IpoSegment[] = ['Mainboard', 'SME'];
const STATUS_FILTERS: ('All' | IpoStatus)[] = ['All', 'Proposed OFS', 'Open', 'Upcoming', 'Closed', 'Listed'];

export function IpoDeskPage() {
  const { lang, ui, ipoRecords, watchlistIds, toggleWatchlist } = useSakarBazaar();
  const [segment, setSegment] = useState<IpoSegment>('Mainboard');
  const [statusFilter, setStatusFilter] = useState<'All' | IpoStatus>('All');

  useEffect(() => {
    document.title = `${ui.ipoPageTitle} – SakarBazaar`;
  }, [ui.ipoPageTitle]);

  const counts = getVerifiedIpoCounts(ipoRecords);
  const rows = filterIpoRows(ipoRecords, segment, statusFilter);

  const summaryStats = [
    { id: 'open', value: String(counts.confirmedOpen), label: 'Open issues' },
    { id: 'upcoming', value: String(counts.confirmedUpcoming), label: 'Upcoming issues' },
    { id: 'total', value: String(ipoRecords.length), label: 'Total tracked issues' },
  ];

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/"
        parentLabel={ui.backToMarkets}
        currentLabel={ui.ipoPageTitle}
      />

      <div className="sb-page-head">
        <div>
          <h1>{ui.ipoPageTitle}</h1>
          <p>{ui.ipoPageSubtitle}</p>
        </div>
      </div>

      <div className="sumgrid">
        {summaryStats.map((stat) => (
          <div className="card sum" key={stat.id}>
            <b>{stat.value}</b>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>

      <section className="card ipo" style={{ marginTop: '16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '14px',
          }}
        >
          <div className="tabs" role="tablist" aria-label="IPO segments" style={{ margin: 0 }}>
            {SEGMENTS.map((seg) => (
              <button
                key={seg}
                type="button"
                role="tab"
                aria-selected={segment === seg}
                onClick={() => setSegment(seg)}
              >
                {seg}
              </button>
            ))}
          </div>

          <div className="tabs" role="tablist" aria-label="IPO status filter" style={{ margin: 0 }}>
            {STATUS_FILTERS.map((st) => (
              <button
                key={st}
                type="button"
                role="tab"
                aria-selected={statusFilter === st}
                onClick={() => setStatusFilter(st)}
              >
                {st === 'All' ? ui.ipoStatusAll : IPO_STATUS_LABELS[lang][st]}
              </button>
            ))}
          </div>
        </div>

        <div className="tbl sb-desktop-table">
          <table>
            <thead>
              <tr>
                <th>{ui.tableCompany}</th>
                <th>{ui.tableIssueSize}</th>
                <th>{ui.tablePriceBand}</th>
                <th>{ui.tableOpenClose}</th>
                <th>{ui.tableOfferType}</th>
                <th className="n">{ui.tableTrack}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => {
                  const isWatched = watchlistIds.has(row.id);
                  return (
                    <tr key={row.id}>
                      <td>
                        <b>
                          <Link to={`/ipo/${row.slug}`}>{row.company}</Link>
                        </b>
                        <small style={{ display: 'block', color: 'var(--muted)', fontSize: '12px' }}>
                          {row.sellingShareholder
                            ? `Selling shareholder: ${row.sellingShareholder}`
                            : row.segment}
                        </small>
                      </td>
                      <td className="num">{row.issueSize ?? 'Not announced'}</td>
                      <td className="num">{row.priceBand ?? 'Not announced'}</td>
                      <td style={{ fontSize: '13px' }}>
                        {row.openDate && row.closeDate
                          ? `${row.openDate} – ${row.closeDate}`
                          : 'Not announced'}
                      </td>
                      <td>{row.offerType ?? 'Not announced'}</td>
                      <td className="n">
                        <button
                          type="button"
                          className="bm"
                          aria-pressed={isWatched}
                          aria-label={
                            isWatched
                              ? `Remove ${row.company} from watchlist`
                              : `Add ${row.company} to watchlist`
                          }
                          onClick={() => toggleWatchlist(row.id)}
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
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
                    {ui.noResultsTitle}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sb-ipo-mobile-cards">
          {rows.length > 0 ? (
            rows.map((row) => {
              const isWatched = watchlistIds.has(row.id);
              return (
                <article className="card sb-ipo-card" key={row.id}>
                  <div className="sb-ipo-card-head">
                    <div>
                      <h3>
                        <Link to={`/ipo/${row.slug}`}>{row.company}</Link>
                      </h3>
                    </div>
                    <button
                      type="button"
                      className="bm"
                      aria-pressed={isWatched}
                      aria-label={
                        isWatched
                          ? `Remove ${row.company} from watchlist`
                          : `Add ${row.company} to watchlist`
                      }
                      onClick={() => toggleWatchlist(row.id)}
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

                  <p style={{ margin: '0 0 10px', fontSize: '14px', color: 'var(--muted)' }}>
                    {row.summary}
                  </p>

                  <dl className="sb-ipo-dl">
                    <div>
                      <dt>{ui.tableIssueSize}</dt>
                      <dd className="num">{row.issueSize ?? 'Not announced'}</dd>
                    </div>
                    <div>
                      <dt>{ui.tablePriceBand}</dt>
                      <dd className="num">{row.priceBand ?? 'Not announced'}</dd>
                    </div>
                    <div>
                      <dt>{ui.tableOpenClose}</dt>
                      <dd>
                        {row.openDate && row.closeDate
                          ? `${row.openDate} – ${row.closeDate}`
                          : 'Not announced'}
                      </dd>
                    </div>
                    <div>
                      <dt>{ui.tableOfferType}</dt>
                      <dd>{row.offerType ?? 'Not announced'}</dd>
                    </div>
                  </dl>

                  <div className="sb-ipo-card-foot">
                    <Link to={`/ipo/${row.slug}`} className="btn ghost">
                      {ui.detailsLink}
                    </Link>
                  </div>
                </article>
              );
            })
          ) : (
            <p style={{ margin: 0, color: 'var(--muted)' }}>{ui.noResultsTitle}</p>
          )}
        </div>

        <div className="sb-note-box">
          <strong>Editorial independence note:</strong> SakarBazaar does not fabricate subscription
          counts, publish unregulated GMP quotes, or issue IPO investment recommendations.
        </div>
      </section>

      <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Link to="/explainers/ipo-basics" className="btn ghost">
          IPO basics →
        </Link>
        <Link to="/explainers/ipo-subscription-explained" className="btn ghost">
          Cut-off &amp; allotment rules →
        </Link>
        <Link to="/explainers/gmp-explained" className="btn ghost">
          GMP disclaimer &amp; guide →
        </Link>
      </div>
    </main>
  );
}
