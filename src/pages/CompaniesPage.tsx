import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { COMPANY_DOSSIERS } from '../data/companyData';

interface CompanyListItem {
  symbol: string;
  name: string;
  sector: string;
  bseCode?: string;
  hasDossier: boolean;
}

const COMPANIES: CompanyListItem[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Limited', sector: 'Energy & Retail', bseCode: '500325', hasDossier: true },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Limited', sector: 'Banking', bseCode: '500180', hasDossier: true },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Limited', sector: 'Banking', bseCode: '532174', hasDossier: true },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'Technology', bseCode: '532540', hasDossier: true },
  { symbol: 'INFY', name: 'Infosys Limited', sector: 'Technology', bseCode: '500209', hasDossier: true },
  { symbol: 'ITC', name: 'ITC Limited', sector: 'FMCG & Hotels', bseCode: '500875', hasDossier: true },
  { symbol: 'NHCFOODS', name: 'NHC Foods Limited', sector: 'Agro-Commodities & FMCG', bseCode: '517554', hasDossier: true },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Limited', sector: 'Telecom', bseCode: '532454', hasDossier: false },
  { symbol: 'LT', name: 'Larsen & Toubro Limited', sector: 'Infrastructure', bseCode: '500510', hasDossier: false },
  { symbol: 'COALINDIA', name: 'Coal India Limited', sector: 'Mining & Energy', bseCode: '533278', hasDossier: false },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking', bseCode: '500112', hasDossier: false },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Limited', sector: 'Automobiles', bseCode: '500570', hasDossier: false },
  { symbol: 'AXISBANK', name: 'Axis Bank Limited', sector: 'Banking', bseCode: '532215', hasDossier: false },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Limited', sector: 'Banking', bseCode: '500247', hasDossier: false },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Limited', sector: 'FMCG', bseCode: '500696', hasDossier: false },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Limited', sector: 'NBFC', bseCode: '500034', hasDossier: false },
];

function CompanyDetailView({ symbol }: { symbol: string }) {
  const { lang, articlesCatalog } = useSakarBazaar();
  const normalizedSymbol = symbol.toUpperCase();
  const dossier = COMPANY_DOSSIERS[normalizedSymbol];
  const basicInfo = COMPANIES.find((c) => c.symbol.toUpperCase() === normalizedSymbol);

  useEffect(() => {
    const title = dossier ? dossier.name : basicInfo ? basicInfo.name : 'Company';
    document.title = `${title} – Corporate Intelligence · SakarBazaar`;
  }, [dossier, basicInfo]);

  if (!basicInfo && !dossier) {
    return (
      <main id="top" className="wrap sb-page">
        <PageBackNav parentPath="/companies" parentLabel="Companies" currentLabel="Not Found" />
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <h2>Company Not Found</h2>
          <p style={{ color: 'var(--muted)' }}>
            No corporate intelligence record exists for symbol "{symbol}".
          </p>
          <Link to="/companies" className="btn ghost">
            ← Back to Companies Catalogue
          </Link>
        </div>
      </main>
    );
  }

  const name = dossier?.name ?? basicInfo?.name ?? symbol;
  const sector = dossier?.sector ?? basicInfo?.sector ?? 'Corporate';
  const bseCode = dossier?.bseCode ?? basicInfo?.bseCode ?? '—';
  const nseSymbol = dossier?.nseSymbol ?? symbol;
  const isin = dossier?.isin ?? '—';

  const relatedArticles = articlesCatalog.filter(
    (a) =>
      a.headline.toLowerCase().includes(name.toLowerCase()) ||
      a.headline.toLowerCase().includes(symbol.toLowerCase()) ||
      (a.ticker && a.ticker.toUpperCase().includes(symbol.toUpperCase())),
  );

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav parentPath="/companies" parentLabel="Companies" currentLabel={symbol.toUpperCase()} />

      {/* Header */}
      <div className="sb-page-head">
        <div>
          <div className="sb-masthead-eyebrow">Corporate Intelligence Dossier</div>
          <h1 style={{ fontFamily: 'Georgia, serif', margin: '4px 0 8px' }}>{name}</h1>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="pill sb-pill-teal">{symbol.toUpperCase()}</span>
            <span className="pill sb-pill-muted">{sector}</span>
            <span className="pill sb-pill-muted">BSE: {bseCode}</span>
            <span className="pill sb-pill-muted">NSE: {nseSymbol}</span>
            {dossier && <span className="pill sb-pill-teal">✓ Official Dossier Verified</span>}
          </div>
        </div>
      </div>

      {/* Policy banner */}
      <div
        className="card"
        style={{
          padding: '14px 18px',
          marginBottom: '24px',
          fontSize: '13px',
          color: 'var(--muted)',
          borderLeft: '3px solid var(--teal)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <span>
          <strong>Corporate Intelligence Policy:</strong> Information is compiled exclusively from verified exchange filings (BSE/NSE), annual reports, and regulatory orders. Share prices are intentionally omitted.
        </span>
        {isin !== '—' && <span className="meta">ISIN: {isin}</span>}
      </div>

      {dossier ? (
        <>
          {/* Overview & Segments */}
          <section className="card" style={{ marginBottom: '24px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontFamily: 'Georgia, serif' }}>
              Company Overview
            </h3>
            <p style={{ margin: '0 0 16px', lineHeight: '1.6', fontSize: '15px' }}>
              {dossier.overview}
            </p>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <strong style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--teal)', display: 'block', marginBottom: '8px' }}>
                Primary Business Segments
              </strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                {dossier.businessSegments.map((seg, idx) => (
                  <div key={idx} style={{ padding: '8px 12px', background: 'var(--bg)', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--border)' }}>
                    • {seg}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Corporate Announcements & Board Decisions */}
          <div className="sb-xray-grid" style={{ marginBottom: '24px' }}>
            <div className="sb-xray-panel">
              <h4>Official Corporate Announcements</h4>
              {dossier.corporateAnnouncements.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {dossier.corporateAnnouncements.map((ann, idx) => (
                    <div key={idx} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '14px' }}>{ann.title}</strong>
                        <span className="meta" style={{ whiteSpace: 'nowrap' }}>{ann.date}</span>
                      </div>
                      <p style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
                        {ann.summary}
                      </p>
                      <span className="meta" style={{ fontSize: '11px' }}>
                        Source: {ann.sourceUrl ? <a href={ann.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>{ann.source} ↗</a> : ann.source}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>No material announcements recorded this quarter.</p>
              )}
            </div>

            <div className="sb-xray-panel">
              <h4>Board Decisions &amp; Governance Resolutions</h4>
              {dossier.boardDecisions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {dossier.boardDecisions.map((bd, idx) => (
                    <div key={idx} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '14px' }}>{bd.title}</strong>
                        <span className="meta" style={{ whiteSpace: 'nowrap' }}>{bd.date}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
                        {bd.details}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>No board resolutions recorded this quarter.</p>
              )}
            </div>
          </div>

          {/* Financial Disclosures & Regulatory Developments */}
          <div className="sb-xray-grid" style={{ marginBottom: '24px' }}>
            <div className="sb-xray-panel">
              <h4>Audited / Unaudited Financial Disclosures</h4>
              {dossier.financialDisclosures.map((fd, idx) => (
                <div key={idx}>
                  <div className="meta" style={{ marginBottom: '8px', fontWeight: 600 }}>{fd.period}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                    {fd.metrics.map((m, mIdx) => (
                      <div key={mIdx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '3px 0', fontSize: '13px' }}>
                        <span style={{ color: 'var(--muted)' }}>{m.label}</span>
                        <strong>{m.value}</strong>
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)' }}>{fd.notes}</p>
                </div>
              ))}
            </div>

            <div className="sb-xray-panel">
              <h4>Regulatory Developments</h4>
              {dossier.regulatoryDevelopments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {dossier.regulatoryDevelopments.map((reg, idx) => (
                    <div key={idx} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                        <strong style={{ fontSize: '13px' }}>{reg.topic}</strong>
                        <span className="meta">{reg.date}</span>
                      </div>
                      <div className="meta" style={{ fontSize: '12px', margin: '2px 0 4px', color: 'var(--teal)' }}>
                        Authority: {reg.authority}
                      </div>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>Status: {reg.status}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>In compliance with standard regulatory disclosures.</p>
              )}
            </div>
          </div>

          {/* Corporate Timeline */}
          {dossier.timeline.length > 0 && (
            <section className="card" style={{ marginBottom: '24px', padding: '20px' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--teal)' }}>
                Corporate Milestones &amp; Evolution Timeline
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {dossier.timeline.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'baseline', fontSize: '14px' }}>
                    <span className="pill sb-pill-muted" style={{ fontWeight: 700, fontSize: '12px' }}>
                      {item.year}
                    </span>
                    <span style={{ color: 'var(--text)' }}>{item.milestone}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Official Verification Links */}
          <section className="card" style={{ marginBottom: '24px', padding: '16px 20px' }}>
            <strong style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
              Primary Exchange Portals &amp; Official Disclosures
            </strong>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {dossier.officialLinks.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target={link.url.startsWith('http') ? '_blank' : '_self'}
                  rel="noreferrer"
                  className="btn ghost"
                  style={{ fontSize: '12px' }}
                >
                  {link.label} {link.url.startsWith('http') ? '↗' : '→'}
                </a>
              ))}
            </div>
          </section>
        </>
      ) : (
        /* Compact clean state for companies pending quarterly dossier expansion */
        <div className="card" style={{ padding: '28px', marginBottom: '24px', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px' }}>Quarterly Disclosures in Indexing Queue</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: '14px', maxWidth: '580px', marginLeft: 'auto', marginRight: 'auto' }}>
            Full multi-year governance timeline and balance-sheet decomposition for <strong>{name}</strong> are populated following official BSE and NSE disclosure indexing. SakarBazaar never fabricates unverified corporate statistics.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <a
              href={`https://www.bseindia.com/stock-share-price/${symbol.toLowerCase()}/${bseCode}/`}
              target="_blank"
              rel="noreferrer"
              className="btn ghost"
              style={{ fontSize: '13px' }}
            >
              Verify on BSE India ({bseCode}) ↗
            </a>
            <a
              href={`https://www.nseindia.com/get-quotes/equity?symbol=${symbol.toUpperCase()}`}
              target="_blank"
              rel="noreferrer"
              className="btn ghost"
              style={{ fontSize: '13px' }}
            >
              Verify on NSE India ({symbol.toUpperCase()}) ↗
            </a>
          </div>
        </div>
      )}

      {/* Related Intelligence Articles */}
      <section style={{ marginTop: '24px' }}>
        <div className="sec-h">
          <h2>Related Editorial &amp; Intelligence Coverage</h2>
        </div>
        {relatedArticles.length > 0 ? (
          <div>
            {relatedArticles.map((a) => (
              <div className="item" key={a.id} style={{ marginBottom: '12px' }}>
                <span className="t">{a.time}</span>
                <Link className="h" to={`/article/${a.slug}`}>
                  {lang === 'hi' && a.headlineHi ? a.headlineHi : a.headline}
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="card"
            style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}
          >
            No editorial articles currently reference {name}.
          </div>
        )}
      </section>
    </main>
  );
}

export function CompaniesPage() {
  const { symbol } = useParams<{ symbol?: string }>();
  const { ui } = useSakarBazaar();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!symbol) document.title = 'Companies – Corporate Intelligence · SakarBazaar';
  }, [symbol]);

  if (symbol) {
    return <CompanyDetailView symbol={symbol} />;
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? COMPANIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q) ||
          c.sector.toLowerCase().includes(q) ||
          (c.bseCode && c.bseCode.includes(q)),
      )
    : COMPANIES;

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav parentPath="/" parentLabel={ui.backToMarkets} currentLabel="Companies" />

      <div className="sb-masthead" style={{ marginBottom: '24px' }}>
        <div className="sb-masthead-eyebrow">SakarBazaar Corporate Intelligence</div>
        <h1>Companies Directory</h1>
        <p className="sb-masthead-tagline">
          Official disclosures, board outcomes, and governance records for India's benchmark enterprises.
        </p>
      </div>

      <div
        className="card"
        style={{
          padding: '16px 20px',
          marginBottom: '24px',
          fontSize: '13px',
          color: 'var(--muted)',
          borderLeft: '3px solid var(--teal)',
        }}
      >
        <strong>Zero-Fabrication Notice:</strong> Share prices are not displayed. This catalogue focuses on corporate intelligence, statutory disclosures, board resolutions, and business segments extracted from official regulatory portals.
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="search"
          placeholder="Search by company name, scrip symbol, BSE code, or business sector…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'var(--card)',
            color: 'var(--text)',
            fontSize: '14px',
          }}
        />
      </div>

      <div className="sb-companies-grid">
        {filtered.map((c) => (
          <Link key={c.symbol} to={`/companies/${c.symbol}`} className="sb-company-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span className="sb-company-symbol">{c.symbol}</span>
              {c.hasDossier && <span className="pill sb-pill-teal" style={{ fontSize: '10px' }}>Verified Dossier</span>}
            </div>
            <div className="sb-company-name">{c.name}</div>
            <div className="sb-company-sector">{c.sector}</div>
            {c.bseCode && <div className="meta" style={{ marginTop: '4px' }}>BSE: {c.bseCode}</div>}
            <div
              style={{
                marginTop: '12px',
                fontSize: '12px',
                color: 'var(--teal)',
                fontWeight: 600,
              }}
            >
              View Intelligence Dossier →
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div
          className="card"
          style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}
        >
          No corporate issuers match "{search}".
        </div>
      )}
    </main>
  );
}
