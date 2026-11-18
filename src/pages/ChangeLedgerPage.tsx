import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { MARKET_PULSE_ITEMS } from '../data/sampleData';

const categoryColors: Record<string, string> = {
  RBI: '#0b6b6b',
  Regulatory: '#8b5cf6',
  Corporate: '#f59e0b',
  Economy: '#3b82f6',
  'Commodity/FX': '#10b981',
  Markets: '#ef4444',
};

export function ChangeLedgerPage() {
  const { lang, ui } = useSakarBazaar();

  useEffect(() => {
    document.title = 'Change Ledger – SakarBazaar';
  }, []);

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav parentPath="/intelligence" parentLabel="Intelligence" currentLabel="Change Ledger" />

      <div className="sb-masthead" style={{ marginBottom: '32px' }}>
        <div className="sb-masthead-eyebrow">SakarBazaar</div>
        <h1>The Change Ledger</h1>
        <p className="sb-masthead-tagline">
          A chronological record of what changed, when, and why it matters.
        </p>
      </div>

      <div
        className="card"
        style={{
          padding: '16px 20px',
          marginBottom: '32px',
          fontSize: '13px',
          color: 'var(--muted)',
          borderLeft: '3px solid var(--teal)',
        }}
      >
        The Change Ledger records material document and policy changes across Indian finance.
        Full before/after document comparison is pending official source integration. The entries
        below represent significant and developing change events.
      </div>

      <div className="sb-ledger-timeline">
        {MARKET_PULSE_ITEMS.map((item) => {
          const title = lang === 'hi' && item.titleHi ? item.titleHi : item.title;
          const summary = lang === 'hi' && item.summaryHi ? item.summaryHi : item.summary;
          const catColor = categoryColors[item.category] ?? 'var(--teal)';

          return (
            <div key={item.id} className="sb-ledger-entry">
              <div className="sb-ledger-dot" style={{ background: catColor }} />

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  alignItems: 'center',
                  marginBottom: '8px',
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
                    fontSize: '16px',
                    lineHeight: '1.35',
                    display: 'block',
                    marginBottom: '10px',
                    color: 'inherit',
                    textDecoration: 'none',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {title}
                </Link>
              ) : (
                <strong
                  style={{
                    fontSize: '16px',
                    display: 'block',
                    marginBottom: '10px',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {title}
                </strong>
              )}

              {/* What Changed */}
              <div className="card" style={{ padding: '14px', marginBottom: '10px', background: 'var(--bg)' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--teal)',
                    marginBottom: '6px',
                  }}
                >
                  What Changed
                </div>
                <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.55' }}>{summary}</p>
              </div>

              {/* Why It Matters */}
              {item.actionableContext && (
                <div className="card" style={{ padding: '14px', marginBottom: '10px', background: 'var(--bg)' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: '#f59e0b',
                      marginBottom: '6px',
                    }}
                  >
                    Why It Matters
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.55', color: 'var(--muted)' }}>
                    {item.actionableContext}
                  </p>
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
        })}
      </div>

      <section className="card" style={{ marginTop: '32px', padding: '24px', textAlign: 'center' }}>
        <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: '14px' }}>
          Full before/after document comparison will be available when official source
          integration is complete.
        </p>
        <Link to="/intelligence" className="btn ghost">
          ← Back to Intelligence Pulse
        </Link>
      </section>
    </main>
  );
}
