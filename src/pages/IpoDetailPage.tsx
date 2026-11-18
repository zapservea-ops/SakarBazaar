import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { IPO_STATUS_LABELS } from '../data/i18n';
import { IPO_ALL_RECORDS } from '../data/sampleData';

export function IpoDetailPage() {
  const { slug } = useParams();
  const { lang, ui, watchlistIds, toggleWatchlist } = useSakarBazaar();

  const ipo = IPO_ALL_RECORDS.find((item) => item.slug === slug);

  useEffect(() => {
    document.title = ipo
      ? `${ipo.company} IPO – SakarBazaar`
      : `IPO Not Found – SakarBazaar`;
  }, [ipo]);

  if (!ipo) {
    return (
      <main className="wrap sb-page">
        <PageBackNav
          parentPath="/ipo"
          parentLabel={ui.ipoPageTitle}
          currentLabel="Not found"
        />
        <div className="card" style={{ padding: '24px' }}>
          <h1 style={{ font: '700 26px var(--serif)', margin: '0 0 8px' }}>
            {ui.noResultsTitle}
          </h1>
          <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{ui.noResultsHint}</p>
          <Link to="/ipo" className="btn">
            {ui.ipoPageTitle}
          </Link>
        </div>
      </main>
    );
  }

  const isTracked = watchlistIds.has(ipo.id);

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/ipo"
        parentLabel={ui.ipoPageTitle}
        currentLabel={ipo.company}
      />

      <div className="sb-page-head">
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span className="pill">{ipo.segment}</span>
            <span className="pill">
              {IPO_STATUS_LABELS[lang][ipo.status]}
            </span>
          </div>
          <h1>{ipo.company}</h1>
          <p>{ipo.summary}</p>
        </div>
        <button
          type="button"
          className={isTracked ? 'btn ghost' : 'btn'}
          aria-pressed={isTracked}
          onClick={() => toggleWatchlist(ipo.id)}
        >
          {isTracked ? ui.saved : `+ ${ui.tableTrack}`}
        </button>
      </div>

      <div className="sumgrid">
        <div className="card sum">
          <b>{ipo.issueSize ?? 'Not disclosed'}</b>
          <span>{ui.tableIssueSize}</span>
        </div>
        <div className="card sum">
          <b>{ipo.priceBand ?? 'Not disclosed'}</b>
          <span>{ui.tablePriceBand}</span>
        </div>
        <div className="card sum">
          <b>{ipo.upperBandValuation ?? 'Not disclosed'}</b>
          <span>Upper-band implied valuation</span>
        </div>
        <div className="card sum">
          <b>{ipo.offerType ?? 'Not disclosed'}</b>
          <span>{ui.tableOfferType}</span>
        </div>
      </div>

      <div className="sb-two-col">
        <div>
          {ipo.financialMetrics && ipo.financialMetrics.length > 0 && (
            <section className="card snap" style={{ marginBottom: '20px' }}>
              <div className="sec-h">
                <h2>Offer &amp; Financial Snapshot</h2>
                <span className="meta">Supplied data</span>
              </div>
              {ipo.financialMetrics.map((row) => (
                <div className="row sb-snap-row" key={row.metric}>
                  <span>{row.metric}</span>
                  <strong className="num" style={{ textAlign: 'right' }}>
                    {row.value}
                  </strong>
                </div>
              ))}
            </section>
          )}

          {ipo.risksAndMonitorables && ipo.risksAndMonitorables.length > 0 && (
            <section className="card snap" style={{ marginBottom: '20px' }}>
              <div className="sec-h">
                <h2>Key Risks &amp; Monitorables</h2>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {ipo.risksAndMonitorables.map((risk, idx) => (
                  <li key={idx} style={{ marginBottom: '8px' }}>
                    {risk}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="sb-citation-list">
            {ipo.officialDocuments.map((doc) => (
              <div className="sb-citation-item" key={doc.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <strong>{doc.label}</strong>
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--teal)', fontWeight: 600 }}
                    >
                      {doc.portalName} ↗
                    </a>
                  )}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
                  {doc.note}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside>
          <section className="card snap">
            <div className="sec-h">
              <h2>Offer Terms &amp; Schedule</h2>
            </div>
            <div className="row sb-snap-row">
              <span>Selling shareholder</span>
              <span style={{ textAlign: 'right' }}>{ipo.sellingShareholder ?? 'TBD'}</span>
            </div>
            <div className="row sb-snap-row">
              <span>Shares offered</span>
              <span className="num" style={{ textAlign: 'right' }}>
                {ipo.sharesOffered ?? 'TBD'} ({ipo.stakePercent ?? '–'})
              </span>
            </div>
            <div className="row sb-snap-row">
              <span>Proceeds recipient</span>
              <span style={{ textAlign: 'right' }}>{ipo.proceedsRecipient ?? 'TBD'}</span>
            </div>
            <div className="row sb-snap-row">
              <span>Proposed open date</span>
              <span className="num" style={{ textAlign: 'right' }}>
                {ipo.openDate ?? 'Pending official notice'}
              </span>
            </div>
            <div className="row sb-snap-row">
              <span>Proposed close date</span>
              <span className="num" style={{ textAlign: 'right' }}>
                {ipo.closeDate ?? 'Pending official notice'}
              </span>
            </div>
            <div className="row sb-snap-row">
              <span>Allotment date</span>
              <span className="num" style={{ textAlign: 'right' }}>
                {ipo.allotmentDate ?? 'Pending official RHP'}
              </span>
            </div>
            <div className="row sb-snap-row">
              <span>Listing date</span>
              <span className="num" style={{ textAlign: 'right' }}>
                {ipo.listingDate ?? 'Pending exchange notice'}
              </span>
            </div>
          </section>
        </aside>
      </div>

      {/* ── SAKARBAZAAR IPO X-RAY ────────────────────────────────────── */}
      <section className="sb-xray-section" aria-label="IPO X-Ray Comprehensive Analysis">
        <div className="sb-xray-heading">
          SAKARBAZAAR <span style={{ color: 'var(--teal)' }}>IPO X-RAY</span> · PROSPECTUS DOSSIER
        </div>

        <div className="sb-xray-grid">
          {/* 1. Issue Structure */}
          <div className="sb-xray-panel">
            <h4>1. Issue Structure (Fresh vs OFS)</h4>
            <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
              <div><strong>Offer Type:</strong> {ipo.offerType ?? 'Not confirmed'}</div>
              <div><strong>Selling Shareholder:</strong> {ipo.sellingShareholder ?? 'Not confirmed'}</div>
              <div><strong>Shares Offered:</strong> {ipo.sharesOffered ?? 'TBD'} ({ipo.stakePercent ?? '–'})</div>
              <div><strong>Proceeds Recipient:</strong> {ipo.proceedsRecipient ?? 'TBD'}</div>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                {ipo.offerType?.toLowerCase().includes('ofs') || ipo.proceedsRecipient?.toLowerCase().includes('parent')
                  ? 'Note: 100% OFS implies the issuing entity receives zero fresh growth capital from issue proceeds.'
                  : 'Check whether fresh capital is earmarked for debt retirement, capex, or general corporate purposes.'}
              </p>
            </div>
          </div>

          {/* 2. Promoter Holdings */}
          <div className="sb-xray-panel">
            <h4>2. Promoter Holdings &amp; Governance</h4>
            <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
              <div><strong>Pre-Issue Promoter Stake:</strong> {ipo.stakePercent ? '100% (Parent company)' : 'Subject to DRHP disclosure'}</div>
              <div><strong>Post-Issue Dilution:</strong> {ipo.stakePercent ? `Diluting ${ipo.stakePercent} via proposed offer` : 'Pending final filing'}</div>
              <div><strong>Promoter Lock-in:</strong> Subject to standard SEBI minimum promoter contribution norms.</div>
            </div>
          </div>

          {/* 3. Financial Performance */}
          <div className="sb-xray-panel">
            <h4>3. Financial Performance</h4>
            {ipo.financialMetrics && ipo.financialMetrics.length > 0 ? (
              <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                {ipo.financialMetrics.map((fm) => (
                  <div key={fm.metric} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '3px 0' }}>
                    <span style={{ color: 'var(--muted)' }}>{fm.metric}:</span>
                    <strong>{fm.value}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                Detailed multi-year restated financial statements will be extracted upon official DRHP/RHP availability.
              </p>
            )}
          </div>

          {/* 4. Risk Factors */}
          <div className="sb-xray-panel">
            <h4>4. Risk Factors &amp; Monitorables</h4>
            {ipo.risksAndMonitorables && ipo.risksAndMonitorables.length > 0 ? (
              <ul className="sb-checklist">
                {ipo.risksAndMonitorables.map((r, i) => (
                  <li key={i}>
                    <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>⚠</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                Internal and external risk disclosures are detailed in Chapter III of the prospectus.
              </p>
            )}
          </div>

          {/* 5. Litigation & Material Disclosures */}
          <div className="sb-xray-panel">
            <h4>5. Litigation &amp; Material Disclosures</h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
              Outstanding tax litigations, material environmental claims, and regulatory show-cause proceedings remain subject to statutory audit disclosures in the draft red herring prospectus.
            </p>
          </div>

          {/* 6. Document Comparison */}
          <div className="sb-xray-panel">
            <h4>6. Document Comparison (DRHP vs RHP)</h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
              Automated diff comparison between initial DRHP filing and final RHP (including object clause modifications and price band additions) will activate once multi-version exchange filings are indexed.
            </p>
          </div>

          {/* 7. Filing & Regulatory Details */}
          <div className="sb-xray-panel" style={{ gridColumn: '1 / -1' }}>
            <h4>7. Regulatory &amp; Disclosure Details</h4>
            <ul className="sb-checklist">
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="sb-checklist-check">✓</span>
                <span>
                  <strong>Regulatory Filing Framework:</strong> Subject to official SEBI DRHP/RHP registration and stock exchange circulars
                </span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={ipo.priceBand ? 'sb-checklist-check' : 'sb-checklist-pending'}>
                  {ipo.priceBand ? '✓' : '⏳'}
                </span>
                <span>
                  <strong>Price Band &amp; Lot Size:</strong> {ipo.priceBand ? `${ipo.priceBand} (Subject to exchange notice)` : 'To be confirmed in RHP filing'}
                </span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={ipo.openDate ? 'sb-checklist-check' : 'sb-checklist-pending'}>
                  {ipo.openDate ? '✓' : '⏳'}
                </span>
                <span>
                  <strong>Exchange In-Principle Approval:</strong> {ipo.openDate ? `Proposed session window: ${ipo.openDate} to ${ipo.closeDate}` : 'Pending NSE/BSE listing approval circular'}
                </span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={ipo.sellingShareholder ? 'sb-checklist-check' : 'sb-checklist-pending'}>
                  {ipo.sellingShareholder ? '✓' : '⏳'}
                </span>
                <span>
                  <strong>Object of Offer / Shareholder Mandate:</strong> {ipo.sellingShareholder ? `Selling shareholder confirmed: ${ipo.sellingShareholder}` : 'Pending disclosure'}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
