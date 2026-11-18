import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { CALENDAR_SCHEDULE } from '../data/sampleData';
import type {
  CalendarCategoryFilter,
  CalendarViewMode,
} from '../types/sakarbazaar';
import { filterCalendarItems } from '../utils/marketFormat';

const CATEGORY_FILTERS: CalendarCategoryFilter[] = ['All', 'IPO', 'RBI', 'Economy', 'Markets'];

export function CalendarPage() {
  const { copy, lang, ui } = useSakarBazaar();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [category, setCategory] = useState<CalendarCategoryFilter>('All');

  useEffect(() => {
    document.title = `${ui.calendarPageTitle} – SakarBazaar`;
  }, [ui.calendarPageTitle]);

  const items = filterCalendarItems(CALENDAR_SCHEDULE, viewMode, category);

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/"
        parentLabel={ui.backToMarkets}
        currentLabel={ui.calendarPageTitle}
      />

      <div className="sb-page-head">
        <div>
          <h1>{ui.calendarPageTitle}</h1>
          <p>{ui.calendarPageSubtitle}</p>
        </div>
        <span className="pill sb-pill-muted">Verified dates only</span>
      </div>

      <div className="sb-sample-banner">
        <span>
          <strong>Schedule policy:</strong> SakarBazaar excludes invented macro schedules and
          unverified IPO windows from this calendar. Proposed dates such as the supplied November
          19–23, 2026 Mahanadi Coalfields Limited (MCL) offer window remain inside the{' '}
          <Link to="/ipo/mahanadi-coalfields-limited" style={{ color: 'var(--teal)', fontWeight: 600 }}>
            MCL IPO dossier
          </Link>{' '}
          as <em>Awaiting Official Verification</em> until SEBI/NSE/BSE confirmation.
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
            {CATEGORY_FILTERS.map((cat) => (
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

        {items.length > 0 ? (
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
                  {items.map((item) => (
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
              {items.map((item) => (
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
              No verified calendar events currently loaded
            </h2>
            <p style={{ margin: '0 0 14px', maxWidth: '62ch' }}>
              Confirmed RBI MPC dates, MoSPI CPI/GDP release dates, and verified SEBI/NSE/BSE IPO
              schedules will appear here once published and verified by the newsroom.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Link to="/ipo" className="btn ghost">
                {ui.openTracker} →
              </Link>
              <Link to="/editorial" className="btn ghost">
                {copy.editorial} →
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
