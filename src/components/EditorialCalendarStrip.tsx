import { Link } from 'react-router-dom';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import type { CalendarScheduleItem } from '../types/sakarbazaar';

interface EditorialCalendarStripProps {
  calendarEvents: CalendarScheduleItem[];
}

export function EditorialCalendarStrip({ calendarEvents }: EditorialCalendarStripProps) {
  const { lang, ui } = useSakarBazaar();

  return (
    <section className="news" id="calendar" aria-label="Verification standards and calendar watch">
      <div>
        <h2>{lang === 'hi' ? 'संपादकीय मानक' : 'Editorial standards'}</h2>
        <p>
          {lang === 'hi'
            ? 'सकारबाज़ार में कोई भी काल्पनिक शेयर भाव, सब्सक्रिप्शन या GMP आँकड़ा प्रकाशित नहीं किया जाता।'
            : 'SakarBazaar provides clear, plain-language reporting on Indian finance. Explore plain-language explainers on IPO prospectuses, ASBA allotment rules, and exchange dynamics.'}
        </p>
        <div className="nf">
          <Link to="/explainers/ipo-basics" className="btn">
            {lang === 'hi' ? 'IPO गाइड पढ़ें' : 'IPO Basics Guide'}
          </Link>
          <Link to="/explainers" className="btn ghost">
            {ui.browseExplainers}
          </Link>
        </div>
      </div>

      <div className="cal" aria-label={ui.todayCalendar}>
        <b>{ui.todayCalendar}</b>
        {calendarEvents.length > 0 ? (
          calendarEvents.map((evt) => (
            <div key={evt.id}>
              <small>
                {evt.dateLabel} · {evt.timeLabel}
              </small>
              <Link to={evt.relatedPath}>{lang === 'hi' ? evt.titleHi : evt.title}</Link>
            </div>
          ))
        ) : (
          <div style={{ borderColor: 'var(--teal)' }}>
            <small>{lang === 'hi' ? 'कार्यक्रम' : 'Schedule'}</small>
            <span>
              {lang === 'hi'
                ? 'वर्तमान में कोई आगामी कैलेंडर तिथि लोड नहीं है।'
                : 'No upcoming regulatory or IPO schedule dates loaded yet.'}
            </span>
          </div>
        )}
        <div style={{ borderLeft: 'none', paddingLeft: 0, marginTop: '12px', marginBottom: 0 }}>
          <Link to="/calendar" className="meta" style={{ color: 'var(--teal)', fontWeight: 600 }}>
            {ui.calendarPageTitle} →
          </Link>
        </div>
      </div>
    </section>
  );
}
