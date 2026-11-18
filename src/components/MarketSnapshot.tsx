import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { MARKET_PULSE_ITEMS } from '../data/sampleData';
import type { MarketDataResponse, MarketInstrument } from '../types/sakarbazaar';
import {
  formatIndianNumber,
  formatIstDisplayTimestamp,
  getArrowSymbol,
  getChangeClass,
  getExchangePhaseLabel,
  getMarketQuoteStatusLabel,
  getSignPrefix,
} from '../utils/marketFormat';

interface MarketSnapshotProps {
  title: string;
  benchmarks: MarketInstrument[];
  equities: MarketInstrument[];
  marketData: MarketDataResponse;
  isLoading: boolean;
}

export function MarketSnapshot({
  title,
  benchmarks,
  equities,
  marketData,
  isLoading,
}: MarketSnapshotProps) {
  const { lang, ui, ist } = useSakarBazaar();
  const [activeTab, setActiveTab] = useState<'pulse' | 'benchmarks' | 'equities'>('pulse');

  const rows = activeTab === 'benchmarks' ? benchmarks : equities.slice(0, 8);
  const formattedAsOf = formatIstDisplayTimestamp(marketData.asOf);
  const sessionPhase = getExchangePhaseLabel(marketData.marketStatus, lang);

  let statusHeadline = ui.liveDataUnavailable;
  let statusDetail = ui.liveDataUnavailableDetail;

  if (isLoading && marketData.status === 'unavailable' && !marketData.providerConfigured) {
    statusHeadline = ui.loadingMarketData;
    statusDetail = ui.liveDataUnavailableDetail;
  } else if (marketData.status === 'stale') {
    statusHeadline = ui.staleDataNotice;
    statusDetail = formattedAsOf
      ? `${marketData.provider} · ${formattedAsOf}`
      : marketData.provider;
  } else if (marketData.status === 'delayed') {
    statusHeadline = ui.delayedDataNotice;
    statusDetail = formattedAsOf
      ? `${marketData.provider} · ${formattedAsOf}`
      : marketData.provider;
  } else if (marketData.status === 'market_closed') {
    statusHeadline = ui.marketClosedNotice;
    statusDetail = formattedAsOf
      ? `${marketData.provider} · ${formattedAsOf}`
      : `Exchange session: ${sessionPhase}`;
  } else if (marketData.status === 'live') {
    statusHeadline = `${getMarketQuoteStatusLabel('live', lang)} · ${marketData.provider}`;
    statusDetail = formattedAsOf
      ? `${ui.lastUpdatedLabel}: ${formattedAsOf}`
      : marketData.message;
  }

  return (
    <section className="card snap sb-market-pulse-card" id="snap" aria-labelledby="market-pulse-heading">
      <div className="sec-h">
        <h2 id="market-pulse-heading">
          <Link to="/markets">SAKARBAZAAR MARKET PULSE</Link>
        </h2>
        <span className="pill sb-pill-muted">{sessionPhase}</span>
      </div>

      <div
        className={`sb-note-box ${marketData.status === 'stale' ? 'sb-note-amber' : ''}`}
        style={{ marginTop: 0, marginBottom: '12px' }}
        role="status"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{statusHeadline}</strong>
          <span className="meta" style={{ fontSize: '11px' }}>{ist.clockText}</span>
        </div>
        <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--muted)' }}>
          {statusDetail}
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Market pulse and snapshot views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pulse'}
          onClick={() => setActiveTab('pulse')}
        >
          Market Pulse
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'benchmarks'}
          onClick={() => setActiveTab('benchmarks')}
        >
          Indices ({benchmarks.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'equities'}
          onClick={() => setActiveTab('equities')}
        >
          Watchlist
        </button>
      </div>

      {activeTab === 'pulse' ? (
        <div className="sb-pulse-feed" role="feed" aria-label="Market developments">
          {MARKET_PULSE_ITEMS.map((item) => (
            <article key={item.id} className="sb-pulse-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span className="cat">{item.category}</span>
              </div>
              <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, lineHeight: 1.35 }}>
                <Link to={item.relatedPath ?? '/markets'} style={{ color: 'var(--ink)' }}>
                  {lang === 'hi' && item.titleHi ? item.titleHi : item.title}
                </Link>
              </h3>
              <p style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.45 }}>
                {lang === 'hi' && item.summaryHi ? item.summaryHi : item.summary}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--muted)' }}>
                <span>{item.source}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{item.timestamp}</span>
              </div>
            </article>
          ))}
          <div style={{ padding: '8px 0 0', textAlign: 'center' }}>
            <Link to="/markets" className="btn ghost" style={{ width: '100%', fontSize: '13px' }}>
              Explore Full Market Intelligence Desk →
            </Link>
          </div>
        </div>
      ) : (
        <div id="idx">
          {rows.map((row) => {
            const hasPrice = row.latestPrice !== null;
            const hasChange = hasPrice && row.absoluteChange !== null;
            const chg = row.absoluteChange ?? 0;
            const pct = row.percentChange;
            const cls = hasChange ? getChangeClass(chg) : '';

            return (
              <div className="row sb-snap-row" key={row.id}>
                <div>
                  <strong>{row.instrumentName}</strong>
                  <small>
                    {row.exchange} · {row.symbol}
                    {hasPrice && row.availabilityStatus !== 'live'
                      ? ` · ${getMarketQuoteStatusLabel(row.availabilityStatus, lang)}`
                      : ''}
                  </small>
                </div>
                {hasPrice ? (
                  <span className={`num ${cls}`} style={{ textAlign: 'right' }}>
                    {row.prefix ?? ''}
                    {formatIndianNumber(row.latestPrice as number)}
                    {hasChange && (
                      <small>
                        {getArrowSymbol(chg)} {getSignPrefix(chg)}
                        {formatIndianNumber(chg)}
                        {pct !== null ? ` (${getSignPrefix(pct)}${formatIndianNumber(pct)}%)` : ''}
                      </small>
                    )}
                  </span>
                ) : (
                  <span className="pill sb-pill-muted">Price Unavailable</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flow">
        <div style={{ marginBottom: '4px', fontWeight: 600, color: 'var(--ink)' }}>
          {ui.fiiDiiHeading}
        </div>
        <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--muted)' }}>
          Institutional cash-market buy/sell figures require authorized exchange reporting.
          SakarBazaar displays official exchange flows only without simulated bars.
        </p>
        <Link to="/explainers/fii-and-dii" style={{ color: 'var(--teal)', fontWeight: 600, fontSize: '13px' }}>
          How FII &amp; DII institutional flows work →
        </Link>
      </div>
    </section>
  );
}
