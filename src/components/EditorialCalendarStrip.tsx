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
        <h2>{lang === 'hi' ? 'संपादकीय सत्यापन मानक' : 'Editorial verification standards'}</h2>
        <p>
          {lang === 'hi'
            ? 'सकारबाज़ार में कोई भी काल्पनिक शेयर भाव, सब्सक्रिप्शन या GMP आँकड़ा प्रकाशित नहीं किया जाता। अपुष्ट प्रदत्त सामग्री स्पष्ट रूप से "आधिकारिक सत्यापन लंबित" चिह्नित रहती है।'
            : 'SakarBazaar separates unverified source material from confirmed regulatory disclosures. Explore plain-language explainers on IPO prospectuses, ASBA allotment rules, and why unregulated GMP quotes are excluded.'}
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
            <small>{lang === 'hi' ? 'सत्यापित कार्यक्रम' : 'Confirmed schedule'}</small>
            <span>
              {lang === 'hi'
                ? 'वर्तमान में कोई सत्यापित कैलेंडर तिथि लोड नहीं है। अपुष्ट तिथियाँ आधिकारिक पुष्टि तक अलग रखी जाती हैं।'
                : 'No verified regulatory or confirmed IPO schedule dates loaded yet. Unconfirmed dates are held out until official exchange confirmation.'}
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
