import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import {
  CALENDAR_SCHEDULE,
} from '../data/sampleData';
import {
  SEBI_IPO_FILINGS,
  SEBI_PUBLIC_ISSUES_SOURCE_URL,
  SEBI_SYNC_POLICY_NOTICE,
  deduplicateSebiFilings,
  type SebiIpoFiling,
} from '../data/sebiIpoData';
import type {
  CalendarCategoryFilter,
  CalendarViewMode,
} from '../types/sakarbazaar';
import { filterCalendarItems } from '../utils/marketFormat';

type TopCalendarTab = 'sebi-filings' | 'macro-economic';
type SebiFilter = 'All' | 'Mainboard' | 'SME' | 'Upcoming' | 'Open' | 'Closed';

const SEBI_FILTERS: SebiFilter[] = ['All', 'Mainboard', 'SME', 'Upcoming', 'Open', 'Closed'];
const MACRO_CATEGORY_FILTERS: CalendarCategoryFilter[] = ['All', 'IPO', 'RBI', 'Economy', 'Markets'];

export function CalendarPage() {
  const { lang, ui, ipoRecords } = useSakarBazaar();
  const [activeTab, setActiveTab] = useState<TopCalendarTab>('sebi-filings');

  // SEBI Filings state
  const [sebiFilter, setSebiFilter] = useState<SebiFilter>('All');
  const [sebiSearch, setSebiSearch] = useState('');
  const [sebiPage, setSebiPage] = useState(1);
  const itemsPerPage = 5;

  // Macro state
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [category, setCategory] = useState<CalendarCategoryFilter>('All');

  useEffect(() => {
    document.title = 'SEBI IPO Filings & Economic Calendar – SakarBazaar';
  }, []);

  // Merge verified Firestore IPOs cleanly alongside static SEBI filings
  const baseFilings = deduplicateSebiFilings(SEBI_IPO_FILINGS);
  const seenNames = new Set(baseFilings.map((f) => f.companyName.toLowerCase()));
  const managedFilings: SebiIpoFiling[] = ipoRecords
    .filter((rec) => rec.verificationStatus === 'verified' && !seenNames.has(rec.company.toLowerCase()))
    .map((rec) => ({
      id: `cal-ipo-${rec.id}`,
      companyName: rec.company,
      documentType: rec.openDate ? 'RHP' : 'DRHP',
      category: rec.segment,
      filingDate: rec.filingDate ?? 'Not announced',
      issueSize: rec.issueSize ?? undefined,
      priceBand: rec.priceBand ?? null,
      openDate: rec.openDate ?? null,
      closeDate: rec.closeDate ?? null,
      scheduleStatus:
        rec.status === 'Open'
          ? 'Open'
          : rec.status === 'Closed'
            ? 'Closed'
            : rec.openDate
              ? 'Upcoming'
              : 'Awaiting Schedule Notice',
      leadManagers: [],
      sebiDocumentUrl: rec.sourceUrl || SEBI_PUBLIC_ISSUES_SOURCE_URL,
      lastCheckedDate: rec.lastVerifiedAt ? rec.lastVerifiedAt.slice(0, 10) : 'Verified',
      summary: rec.summary,
    }));

  const uniqueFilings = [...managedFilings, ...baseFilings];
  const filteredSebiFilings = uniqueFilings.filter((f) => {
    // Category / Schedule filter
    if (sebiFilter === 'Mainboard' && f.category !== 'Mainboard') return false;
    if (sebiFilter === 'SME' && f.category !== 'SME') return false;
    if (sebiFilter === 'Upcoming' && f.scheduleStatus !== 'Upcoming' && f.scheduleStatus !== 'Awaiting Schedule Notice') return false;
    if (sebiFilter === 'Open' && f.scheduleStatus !== 'Open') return false;
    if (sebiFilter === 'Closed' && f.scheduleStatus !== 'Closed') return false;

    // Search query
    if (sebiSearch.trim()) {
      const q = sebiSearch.toLowerCase();
      const matchName = f.companyName.toLowerCase().includes(q);
      const matchDoc = f.documentType.toLowerCase().includes(q);
      const matchCat = f.category.toLowerCase().includes(q);
      if (!matchName && !matchDoc && !matchCat) return false;
    }
    return true;
  });

  const totalSebiPages = Math.ceil(filteredSebiFilings.length / itemsPerPage) || 1;
  const paginatedSebiFilings = filteredSebiFilings.slice(
    (sebiPage - 1) * itemsPerPage,
    sebiPage * itemsPerPage,
  );

  // Macro items
  const macroItems = filterCalendarItems(CALENDAR_SCHEDULE, viewMode, category);

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/"
        parentLabel={ui.backToMarkets}
        currentLabel="Calendar"
      />

      <div className="sb-page-head">
        <div>
          <h1>Public Issues &amp; Economic Calendar</h1>
          <p>
            Official SEBI public issue filings (DRHP, RHP, Prospectuses) and macroeconomic dates.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <a
            href={SEBI_PUBLIC_ISSUES_SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="btn ghost"
            style={{ fontSize: '12px' }}
          >
            SEBI Public Issues Portal ↗
          </a>
        </div>
      </div>

      {/* Top Tab Switcher */}
      <div className="sb-filter-tabs" style={{ marginBottom: '20px' }}>
        <button
          type="button"
          className={`sb-filter-tab${activeTab === 'sebi-filings' ? ' active' : ''}`}
          onClick={() => {
            setActiveTab('sebi-filings');
            setSebiPage(1);
          }}
        >
          SEBI Public Issues &amp; Filings Tracker ({uniqueFilings.length})
        </button>
        <button
          type="button"
          className={`sb-filter-tab${activeTab === 'macro-economic' ? ' active' : ''}`}
          onClick={() => setActiveTab('macro-economic')}
        >
          Macroeconomic &amp; Monetary Policy Schedule
        </button>
      </div>

      {activeTab === 'sebi-filings' ? (
        /* ══════════════════════════════════════════════════════════════
           SEBI PUBLIC ISSUES & IPO FILINGS REGISTRY
           ══════════════════════════════════════════════════════════════ */
        <div>
          {/* Statutory Verification Policy Banner */}
          <div className="sb-sample-banner" style={{ marginBottom: '20px' }}>
            <div>
              <strong>SEBI Integration Notice:</strong> {SEBI_SYNC_POLICY_NOTICE}
            </div>
            <span className="meta" style={{ marginTop: '4px', display: 'block' }}>
              Primary repository:{' '}
              <a
                href={SEBI_PUBLIC_ISSUES_SOURCE_URL}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--teal)', fontWeight: 600 }}
              >
                sebi.gov.in/sebiweb/home/HomeAction.do
              </a>
            </span>
          </div>

          {/* Controls: Filters & Search */}
          <section className="card snap" style={{ marginBottom: '20px', padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div className="tabs" role="tablist" aria-label="SEBI Filters" style={{ margin: 0 }}>
                {SEBI_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={sebiFilter === f}
                    onClick={() => {
                      setSebiFilter(f);
                      setSebiPage(1);
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <input
                type="search"
                placeholder="Filter by company, document type (DRHP, RHP)..."
                value={sebiSearch}
                onChange={(e) => {
                  setSebiSearch(e.target.value);
                  setSebiPage(1);
                }}
                style={{
                  minWidth: '260px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Desktop Table View */}
            <div className="tbl sb-desktop-table">
              <table>
                <thead>
                  <tr>
                    <th>Company Name</th>
                    <th>Document Type</th>
                    <th>Category</th>
                    <th>SEBI Filing Date</th>
                    <th>Issue Schedule Window</th>
                    <th>Price Band</th>
                    <th className="n">Official Document</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSebiFilings.map((filing) => (
                    <tr key={filing.id}>
                      <td>
                        <strong>{filing.companyName}</strong>
                        {filing.issueSize && <div className="meta">{filing.issueSize}</div>}
                      </td>
                      <td>
                        <span className="pill sb-pill-teal">{filing.documentType}</span>
                      </td>
                      <td>
                        <span className="pill sb-pill-muted">{filing.category}</span>
                      </td>
                      <td className="num">
                        {filing.filingDate}
                      </td>
                      <td>
                        {filing.openDate && filing.closeDate ? (
                          <div style={{ fontSize: '13px' }}>
                            <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{filing.openDate}</span> to{' '}
                            <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{filing.closeDate}</span>
                            <div className="meta" style={{ fontSize: '11px' }}>Status: {filing.scheduleStatus}</div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                            Not announced
                            <div className="meta" style={{ fontSize: '11px' }}>Filing under SEBI review</div>
                          </div>
                        )}
                      </td>
                      <td className="num">
                        {filing.priceBand ? (
                          <strong>{filing.priceBand}</strong>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>Not announced</span>
                        )}
                      </td>
                      <td className="n">
                        <a
                          href={filing.sebiDocumentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn ghost"
                          style={{ fontSize: '12px' }}
                        >
                          SEBI Portal ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="sb-ipo-mobile-cards">
              {paginatedSebiFilings.map((filing) => (
                <article className="card sb-ipo-card" key={filing.id} style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                    <span className="pill sb-pill-teal">{filing.documentType}</span>
                    <span className="pill sb-pill-muted">{filing.category}</span>
                    <span className="meta" style={{ marginLeft: 'auto' }}>Filed: {filing.filingDate}</span>
                  </div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 6px' }}>{filing.companyName}</h3>
                  <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--muted)', lineHeight: '1.4' }}>
                    {filing.summary}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', borderTop: '1px solid var(--border)', paddingTop: '8px', marginBottom: '10px' }}>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Issue Dates: </span>
                      <strong>{filing.openDate ? `${filing.openDate} – ${filing.closeDate ?? 'Not announced'}` : 'Not announced'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Price Band: </span>
                      <strong>{filing.priceBand ?? 'Not announced'}</strong>
                    </div>
                  </div>
                  <a
                    href={filing.sebiDocumentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn ghost"
                    style={{ width: '100%', textAlign: 'center', fontSize: '12px' }}
                  >
                    View Official Filing on SEBI Portal ↗
                  </a>
                </article>
              ))}
            </div>

            {/* Pagination Controls */}
            {filteredSebiFilings.length > itemsPerPage && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                <span className="meta">
                  Showing {(sebiPage - 1) * itemsPerPage + 1}–{Math.min(sebiPage * itemsPerPage, filteredSebiFilings.length)} of {filteredSebiFilings.length} filings
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={sebiPage === 1}
                    onClick={() => setSebiPage((p) => Math.max(1, p - 1))}
                    style={{ fontSize: '12px' }}
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={sebiPage >= totalSebiPages}
                    onClick={() => setSebiPage((p) => Math.min(totalSebiPages, p + 1))}
                    style={{ fontSize: '12px' }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {filteredSebiFilings.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                No filings match the selected filter or search query.
              </div>
            )}
          </section>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════
           MACROECONOMIC & POLICY CALENDAR
           ══════════════════════════════════════════════════════════════ */
        <div>
          <div className="sb-sample-banner" style={{ marginBottom: '20px' }}>
            <span>
              <strong>Schedule policy:</strong> SakarBazaar excludes invented macro schedules. Confirmed RBI MPC policy meetings, MoSPI GDP and CPI statistics releases appear here.
            </span>
          </div>

          <section className="card snap">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                marginBottom: '16px',
              }}
            >
              <div className="tabs" role="tablist" aria-label="Calendar timeframe" style={{ margin: 0 }}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'day'}
                  onClick={() => setViewMode('day')}
                >
                  {ui.calendarDay}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'week'}
                  onClick={() => setViewMode('week')}
                >
                  {ui.calendarWeek}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'upcoming'}
                  onClick={() => setViewMode('upcoming')}
                >
                  {ui.calendarUpcoming}
                </button>
              </div>

              <div className="tabs" role="tablist" aria-label="Calendar category" style={{ margin: 0 }}>
                {MACRO_CATEGORY_FILTERS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={category === cat}
                    onClick={() => setCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {macroItems.length > 0 ? (
              <>
                <div className="tbl sb-desktop-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{ui.colDate}</th>
                        <th>{ui.colTime}</th>
                        <th>{ui.colCategory}</th>
                        <th>{ui.colEvent}</th>
                        <th>{ui.colDetails}</th>
                        <th className="n">{ui.colLink}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {macroItems.map((item) => (
                        <tr key={item.id}>
                          <td className="num" style={{ whiteSpace: 'nowrap' }}>
                            {item.dateLabel}
                          </td>
                          <td className="num" style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                            {item.timeLabel}
                          </td>
                          <td>
                            <span className="pill">{item.category}</span>
                          </td>
                          <td>
                            <b>{lang === 'hi' ? item.titleHi : item.title}</b>
                          </td>
                          <td style={{ color: 'var(--muted)' }}>
                            {lang === 'hi' ? item.detailHi : item.detail}
                          </td>
                          <td className="n">
                            <Link to={item.relatedPath} className="btn ghost">
                              {ui.openLink}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="sb-ipo-mobile-cards">
                  {macroItems.map((item) => (
                    <article className="card sb-ipo-card" key={item.id}>
                      <span className="pill">{item.category}</span>
                      <h3>{lang === 'hi' ? item.titleHi : item.title}</h3>
                      <div className="meta">
                        {item.dateLabel} · {item.timeLabel}
                      </div>
                      <p style={{ margin: '8px 0 10px', color: 'var(--muted)', fontSize: '14px' }}>
                        {lang === 'hi' ? item.detailHi : item.detail}
                      </p>
                      <Link to={item.relatedPath} className="btn ghost">
                        {ui.openLink}
                      </Link>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ padding: '20px 0', color: 'var(--muted)' }}>
                <h2 style={{ font: '700 20px var(--serif)', margin: '0 0 6px', color: 'var(--ink)' }}>
                  No calendar events currently scheduled
                </h2>
                <p style={{ margin: '0 0 14px', maxWidth: '62ch' }}>
                  Confirmed RBI MPC dates, MoSPI CPI/GDP release dates, and official SEBI/NSE/BSE schedules appear here once officially published.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
