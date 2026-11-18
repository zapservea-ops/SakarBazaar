import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { MARKET_PULSE_ITEMS } from '../data/sampleData';

type PulseFilter = 'All' | 'RBI' | 'Regulatory' | 'Corporate' | 'Economy' | 'Commodity/FX';
const FILTERS: PulseFilter[] = ['All', 'RBI', 'Regulatory', 'Corporate', 'Economy', 'Commodity/FX'];

const categoryColors: Record<string, string> = {
  RBI: '#0b6b6b',
  Regulatory: '#8b5cf6',
  Corporate: '#f59e0b',
  Economy: '#3b82f6',
  'Commodity/FX': '#10b981',
  Markets: '#ef4444',
};

export function IntelligencePage() {
  const { lang, ui } = useSakarBazaar();
  const [activeFilter, setActiveFilter] = useState<PulseFilter>('All');

  useEffect(() => {
    document.title = 'Intelligence Pulse – SakarBazaar';
  }, []);

  const filtered =
    activeFilter === 'All'
      ? MARKET_PULSE_ITEMS
      : MARKET_PULSE_ITEMS.filter((item) => item.category === activeFilter);

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav parentPath="/" parentLabel={ui.backToMarkets} currentLabel="Intelligence" />

      <div className="sb-masthead" style={{ marginBottom: '32px' }}>
        <div className="sb-masthead-eyebrow">SakarBazaar</div>
        <h1>Intelligence Pulse</h1>
        <p className="sb-masthead-tagline">
          Regulatory, macro &amp; corporate developments across Indian finance.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="sb-filter-tabs">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`sb-filter-tab${activeFilter === f ? ' active' : ''}`}
            onClick={() => setActiveFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="sb-pulse-feed">
        {filtered.length === 0 ? (
          <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', margin: 0 }}>
              No developments in this category.
            </p>
          </div>
        ) : (
          filtered.map((item) => {
            const title = lang === 'hi' && item.titleHi ? item.titleHi : item.title;
            const summary = lang === 'hi' && item.summaryHi ? item.summaryHi : item.summary;
            const catColor = categoryColors[item.category] ?? 'var(--teal)';

            return (
              <div
                key={item.id}
                className="sb-pulse-row"
                style={{
                  borderLeft: `3px solid ${catColor}`,
                  paddingLeft: '14px',
                  marginBottom: '20px',
                  paddingBottom: '20px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <span className="pill" style={{ background: catColor, color: '#fff', fontSize: '11px' }}>
                    {item.category}
                  </span>
                  <span className="meta" style={{ marginLeft: 'auto', fontSize: '12px' }}>
                    {item.timestamp}
                  </span>
                </div>

                {item.relatedPath ? (
                  <Link
                    to={item.relatedPath}
                    style={{
                      fontWeight: 700,
                      fontSize: '15px',
                      lineHeight: '1.4',
                      display: 'block',
                      marginBottom: '6px',
                      color: 'inherit',
                      textDecoration: 'none',
                    }}
                  >
                    {title}
                  </Link>
                ) : (
                  <strong style={{ fontSize: '15px', display: 'block', marginBottom: '6px' }}>
                    {title}
                  </strong>
                )}

                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: 'var(--text)',
                    opacity: 0.85,
                  }}
                >
                  {summary}
                </p>

                {item.actionableContext && (
                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--muted)',
                      borderLeft: '2px solid var(--border)',
                      paddingLeft: '10px',
                      marginBottom: '8px',
                      fontStyle: 'italic',
                    }}
                  >
                    {item.actionableContext}
                  </div>
                )}

                <div style={{ fontSize: '12px' }}>
                  <span style={{ color: 'var(--muted)' }}>Source: </span>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--teal)', textDecoration: 'none' }}
                    >
                      {item.source}
                    </a>
                  ) : (
                    <span>{item.source}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Change Ledger teaser */}
      <section className="card" style={{ marginTop: '32px', padding: '24px' }}>
        <div className="sb-masthead-eyebrow" style={{ marginBottom: '8px' }}>
          Featured
        </div>
        <h3 style={{ margin: '0 0 8px', fontFamily: 'Georgia, serif' }}>The Change Ledger</h3>
        <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: '14px' }}>
          A chronological record of what changed, when, and why it matters across Indian finance.
        </p>
        <Link to="/change-ledger" className="btn ghost">
          View Change Ledger →
        </Link>
      </section>

    </main>
  );
}
