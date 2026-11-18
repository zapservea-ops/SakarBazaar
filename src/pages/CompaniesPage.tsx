import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';

const COMPANIES = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Limited', sector: 'Energy & Retail' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Limited', sector: 'Banking' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Limited', sector: 'Banking' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'Technology' },
  { symbol: 'INFY', name: 'Infosys Limited', sector: 'Technology' },
  { symbol: 'ITC', name: 'ITC Limited', sector: 'FMCG & Hotels' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Limited', sector: 'Telecom' },
  { symbol: 'LT', name: 'Larsen & Toubro Limited', sector: 'Infrastructure' },
  { symbol: 'COALINDIA', name: 'Coal India Limited', sector: 'Mining' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Limited', sector: 'Automobiles' },
  { symbol: 'AXISBANK', name: 'Axis Bank Limited', sector: 'Banking' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Limited', sector: 'Banking' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Limited', sector: 'FMCG' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Limited', sector: 'NBFC' },
];

function CompanyDetailView({ symbol }: { symbol: string }) {
  const { lang, articlesCatalog } = useSakarBazaar();
  const company = COMPANIES.find((c) => c.symbol.toLowerCase() === symbol.toLowerCase());

  useEffect(() => {
    document.title = company
      ? `${company.name} – SakarBazaar`
      : 'Company Not Found – SakarBazaar';
  }, [company]);

  if (!company) {
    return (
      <main id="top" className="wrap sb-page">
        <PageBackNav parentPath="/companies" parentLabel="Companies" currentLabel="Not Found" />
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <h2>Company Not Found</h2>
          <p style={{ color: 'var(--muted)' }}>
            No intelligence record for symbol "{symbol}".
          </p>
          <Link to="/companies" className="btn ghost">
            ← Back to Companies
          </Link>
        </div>
      </main>
    );
  }

  const relatedArticles = articlesCatalog.filter(
    (a) =>
      a.headline.toLowerCase().includes(company.name.toLowerCase()) ||
      a.headline.toLowerCase().includes(company.symbol.toLowerCase()) ||
      (a.ticker && a.ticker.toUpperCase().includes(company.symbol)),
  );

  const emptySection = (label: string) => (
    <div className="sb-xray-panel">
      <h4>{label}</h4>
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
        No verified {label.toLowerCase()} available. Intelligence is populated as official filings and announcements are verified.
      </p>
    </div>
  );

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav parentPath="/companies" parentLabel="Companies" currentLabel={company.symbol} />

      <div className="sb-page-head">
        <div>
          <div className="sb-masthead-eyebrow">Company Intelligence</div>
          <h1 style={{ fontFamily: 'Georgia, serif' }}>{company.name}</h1>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            <span className="pill sb-pill-teal">{company.symbol}</span>
            <span className="pill sb-pill-muted">{company.sector}</span>
            <span className="pill sb-pill-muted">NSE</span>
          </div>
        </div>
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
        Company intelligence is being populated. Share prices are not displayed — this catalogue
        focuses on corporate developments, announcements and regulatory events. Financial data
        requires an authorised data provider.
      </div>

      <div className="sb-xray-grid" style={{ marginBottom: '24px' }}>
        {emptySection('Corporate Announcements')}
        {emptySection('Board Decisions')}
        {emptySection('Financial Disclosures')}
        {emptySection('Regulatory Developments')}
      </div>

      {emptySection('Company Timeline')}

      <section style={{ marginTop: '24px' }}>
        <div className="sec-h">
          <h2>Related Intelligence Articles</h2>
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
            No articles related to {company.name} are available yet.
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
    if (!symbol) document.title = 'Companies – SakarBazaar';
  }, [symbol]);

  if (symbol) {
    return <CompanyDetailView symbol={symbol} />;
  }

  const q = search.toLowerCase();
  const filtered = q
    ? COMPANIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q) ||
          c.sector.toLowerCase().includes(q),
      )
    : COMPANIES;

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav parentPath="/" parentLabel={ui.backToMarkets} currentLabel="Companies" />

      <div className="sb-masthead" style={{ marginBottom: '24px' }}>
        <div className="sb-masthead-eyebrow">SakarBazaar</div>
        <h1>Corporate Intelligence</h1>
        <p className="sb-masthead-tagline">
          Intelligence catalogue for India's most tracked listed companies.
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
        Share prices are not displayed. This catalogue focuses on corporate intelligence,
        announcements and developments.
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="search"
          placeholder="Search companies by name, symbol or sector…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
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
            <div className="sb-company-symbol">{c.symbol}</div>
            <div className="sb-company-name">{c.name}</div>
            <div className="sb-company-sector">{c.sector}</div>
            <div
              style={{
                marginTop: '12px',
                fontSize: '12px',
                color: 'var(--teal)',
                fontWeight: 600,
              }}
            >
              View Intelligence →
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div
          className="card"
          style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}
        >
          No companies match "{search}".
        </div>
      )}
    </main>
  );
}
