import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { IPO_STATUS_LABELS } from '../data/i18n';
import type { IpoRow, IpoSegment } from '../types/sakarbazaar';
import { getVerifiedIpoCounts } from '../utils/marketFormat';

interface IpoDeskSectionProps {
  title: string;
  records: IpoRow[];
  watchlistIds: Set<string>;
  onToggleWatchlist: (id: string) => void;
}

const SEGMENTS: IpoSegment[] = ['Mainboard', 'SME'];

export function IpoDeskSection({
  title,
  records,
  watchlistIds,
  onToggleWatchlist,
}: IpoDeskSectionProps) {
  const { lang, ui } = useSakarBazaar();
  const [segment, setSegment] = useState<IpoSegment>('Mainboard');

  const counts = getVerifiedIpoCounts(records);
  const filteredRows = records.filter((r) => r.segment === segment);

  const summaryCards = [
    {
      id: 'open',
      value: String(counts.confirmedOpen),
      label: lang === 'hi' ? 'खुले IPO' : 'Open issues',
    },
    {
      id: 'upcoming',
      value: String(counts.confirmedUpcoming),
      label: lang === 'hi' ? 'आगामी IPO' : 'Upcoming issues',
    },
    {
      id: 'total',
      value: String(records.length),
      label: lang === 'hi' ? 'कुल ट्रैक किए गए इश्यू' : 'Tracked issues',
    },
  ];

  return (
    <section id="ipo" className="card ipo">
      <div className="sec-h">
        <h2>{title}</h2>
      </div>

      <div className="sumgrid">
        {summaryCards.map((stat) => (
          <div className="card sum" key={stat.id}>
            <b>{stat.value}</b>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="tabs" id="itabs" role="tablist" aria-label="IPO segments">
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

      {/* Desktop tabular presentation */}
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
          <tbody id="ibody">
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => {
                const isWatched = watchlistIds.has(row.id);
                return (
                  <tr key={row.id}>
                    <td>
                      <b>
                        <Link to={`/ipo/${row.slug}`}>{row.company}</Link>
                      </b>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: '12px' }}>
                        {row.sellingShareholder ? `Seller: ${row.sellingShareholder}` : row.segment}
                      </small>
                    </td>
                    <td className="num">{row.issueSize ?? 'Not announced'}</td>
                    <td className="num">{row.priceBand ?? 'Not announced'}</td>
                    <td>
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
                        onClick={() => onToggleWatchlist(row.id)}
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
                  No {segment} IPO dossiers currently loaded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card stack for readable small-screen layout */}
      <div className="sb-ipo-mobile-cards">
        {filteredRows.length > 0 ? (
          filteredRows.map((row) => {
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
                    onClick={() => onToggleWatchlist(row.id)}
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
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            No {segment} IPO dossiers currently loaded.
          </p>
        )}
      </div>

      <div className="gl" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <div style={{ flex: '1 1 320px' }}>
          Official filings check: automated IPO source checks read only the official SEBI Public Issues portal; unannounced opening/closing dates remain &ldquo;Not announced&rdquo; until verified.
        </div>
        <Link to="/ipo" className="btn ghost">
          {ui.openTracker} →
        </Link>
      </div>
    </section>
  );
}
