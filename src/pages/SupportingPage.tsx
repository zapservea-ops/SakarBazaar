import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { EXPLAINERS_CATALOG, IPO_ALL_RECORDS } from '../data/sampleData';
import { submitContactNote } from '../lib/firebase';
import type { SupportingRouteKey } from '../types/sakarbazaar';
import { isValidEmailAddress } from '../utils/marketFormat';

interface SupportingPageProps {
  page: SupportingRouteKey;
}

export function SupportingPage({ page }: SupportingPageProps) {
  const { ui, articlesCatalog } = useSakarBazaar();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<
    'Editorial feedback' | 'Data correction' | 'IPO desk tip' | 'General enquiry'
  >('Editorial feedback');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [contactStatus, setContactStatus] = useState<{ text: string; tone: 'ok' | 'err' } | null>(
    null,
  );

  const activeTitle =
    page === 'about'
      ? ui.aboutLink
      : page === 'disclaimer'
        ? ui.disclaimerLink
        : page === 'privacy'
          ? ui.privacyLink
          : page === 'contact'
            ? ui.contactLink
            : page === 'rss'
              ? ui.rssLink
              : ui.sitemapLink;

  useEffect(() => {
    document.title = `${activeTitle} – SakarBazaar`;
  }, [activeTitle]);

  async function handleContactSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !isValidEmailAddress(email) || message.trim().length < 10) {
      setContactStatus({
        text: 'Please provide your name, a valid email address, and a message of at least 10 characters.',
        tone: 'err',
      });
      return;
    }

    setSubmitting(true);
    setContactStatus(null);
    try {
      const submissionId = await submitContactNote({ name, email, topic, message });
      setContactStatus({
        text: `Thank you, ${name.trim()}. Your note has been saved for editorial review (Reference: ${submissionId}).`,
        tone: 'ok',
      });
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setContactStatus({
        text: 'Unable to save your message right now. Please verify your connection and try again.',
        tone: 'err',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/"
        parentLabel={ui.backToMarkets}
        currentLabel={activeTitle}
      />

      <div className="sb-page-head">
        <div>
          <h1>{activeTitle}</h1>
          <p>SakarBazaar · {ui.siteTagline}.</p>
        </div>
      </div>

      <article className="card snap" style={{ maxWidth: '78ch', padding: '24px' }}>
        {page === 'about' && (
          <div className="sb-article-body">
            <h2>Editorial mission</h2>
            <p>
              SakarBazaar is built for Indian retail investors, analysts, and market observers who
              prefer calm, source-linked financial journalism over noisy tickers and intrusive
              popups.
            </p>
            <h2>Source-first editorial workflow</h2>
            <p>
              SakarBazaar reports are cross-checked against primary regulatory documents across SEBI, NSE, BSE, RBI, MoSPI, and PIB.
            </p>
          </div>
        )}

        {page === 'disclaimer' && (
          <div className="sb-article-body">
            <h2>No investment advice</h2>
            <p>
              SakarBazaar is an informational and educational publication. Nothing published here
              constitutes investment advice, a buy/sell/apply recommendation, or a SEBI-registered
              research report.
            </p>
            <h2>Market feeds &amp; official verification</h2>
            <p>
              SakarBazaar never fabricates live index prices, stock quotes, IPO subscription
              multipliers, or Grey Market Premium (GMP) quotes. Always verify official filings on{' '}
              <a href="https://www.nseindia.com" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                NSE India
              </a>
              ,{' '}
              <a href="https://www.bseindia.com" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                BSE India
              </a>
              ,{' '}
              <a href="https://www.sebi.gov.in" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                SEBI
              </a>
              , and{' '}
              <a href="https://www.rbi.org.in" target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                RBI
              </a>
              .
            </p>
          </div>
        )}

        {page === 'privacy' && (
          <div className="sb-article-body">
            <h2>Browser preferences</h2>
            <p>
              SakarBazaar stores your theme choice (<code>sb-theme</code>), language choice (
              <code>sb-lang</code>), saved story bookmarks (<code>sb-bookmarks</code>), and
              watchlist selections (<code>sb-watchlist</code>) locally in your browser.
            </p>
            <h2>Editorial submissions &amp; newsroom accounts</h2>
            <p>
              Notes submitted through the Contact Newsroom form are persisted to Firebase
              Firestore for administrator review. Newsroom editorial publishing access requires
              Google authentication authorized by SakarBazaar.
            </p>
          </div>
        )}

        {page === 'contact' && (
          <div>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>
              Send a correction note, IPO coverage request, or editorial feedback using the form
              below. Submissions are stored directly for newsroom review.
            </p>
            <form onSubmit={(e) => void handleContactSubmit(e)} noValidate>
              <label className="sb-form-field">
                <span>Your name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aarav Mehta"
                  required
                />
              </label>
              <label className="sb-form-field">
                <span>Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.in"
                  required
                />
              </label>
              <label className="sb-form-field">
                <span>Topic</span>
                <select
                  value={topic}
                  onChange={(e) =>
                    setTopic(
                      e.target.value as
                        | 'Editorial feedback'
                        | 'Data correction'
                        | 'IPO desk tip'
                        | 'General enquiry',
                    )
                  }
                >
                  <option value="Editorial feedback">Editorial feedback</option>
                  <option value="Data correction">Data correction</option>
                  <option value="IPO desk tip">IPO desk tip</option>
                  <option value="General enquiry">General enquiry</option>
                </select>
              </label>
              <label className="sb-form-field">
                <span>Message</span>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your note..."
                  required
                />
              </label>
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? 'Saving note…' : 'Send note'}
              </button>
              {contactStatus && (
                <div
                  className="msg"
                  role="status"
                  style={{
                    color: contactStatus.tone === 'err' ? 'var(--down)' : 'var(--teal)',
                    marginTop: '10px',
                  }}
                >
                  {contactStatus.text}
                </div>
              )}
            </form>
          </div>
        )}

        {page === 'rss' && (
          <div>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>
              Syndication XML template reflecting currently active editorial dispatches.
            </p>
            <pre className="sb-code-pre">{`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>SakarBazaar – Indian markets, IPOs and news</title>
    <language>en-in</language>
    ${articlesCatalog
      .slice(0, 5)
      .map(
        (a) => `<item>
      <title>${a.headline}</title>
      <category>${a.category}</category>
      <pubDate>${a.publishedAt}</pubDate>
      <link>/article/${a.slug}</link>
    </item>`,
      )
      .join('\n    ')}
  </channel>
</rss>`}</pre>
          </div>
        )}

        {page === 'sitemap' && (
          <div>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>
              Complete human-readable directory of active SakarBazaar routes.
            </p>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <h3 style={{ font: '700 17px var(--serif)', margin: '0 0 8px' }}>Primary Routes</h3>
                <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.9 }}>
                  <li><Link to="/">/ — Homepage</Link></li>
                  <li><Link to="/markets">/markets — Indian Markets &amp; Indicators</Link></li>
                  <li><Link to="/ipo">/ipo — IPO Desk</Link></li>
                  <li><Link to="/news">/news — Newsroom Dispatches</Link></li>
                  <li><Link to="/calendar">/calendar — Economic &amp; IPO Calendar</Link></li>
                  <li><Link to="/watchlist">/watchlist — Personal Watchlist</Link></li>
                  <li><Link to="/explainers">/explainers — Financial Explainers</Link></li>
                  <li><Link to="/editorial">/editorial — Newsroom Editorial Desk</Link></li>
                  <li><Link to="/search">/search — Site-wide Search</Link></li>
                </ul>
              </div>
              <div>
                <h3 style={{ font: '700 17px var(--serif)', margin: '0 0 8px' }}>
                  IPO Dossiers ({IPO_ALL_RECORDS.length})
                </h3>
                <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.8 }}>
                  {IPO_ALL_RECORDS.map((ipo) => (
                    <li key={ipo.id}>
                      <Link to={`/ipo/${ipo.slug}`}>{ipo.company}</Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 style={{ font: '700 17px var(--serif)', margin: '0 0 8px' }}>
                  Explainers ({EXPLAINERS_CATALOG.length})
                </h3>
                <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.8 }}>
                  {EXPLAINERS_CATALOG.map((exp) => (
                    <li key={exp.id}>
                      <Link to={`/explainers/${exp.slug}`}>{exp.title}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </article>
    </main>
  );
}
