import { Link } from 'react-router-dom';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { MARKET_PULSE_ITEMS } from '../data/sampleData';
import type { MarketDataStatus, MarketInstrument } from '../types/sakarbazaar';
import {
  formatIndianNumber,
  formatIstDisplayTimestamp,
  getArrowSymbol,
  getChangeClass,
  getMarketQuoteStatusLabel,
  getSignPrefix,
} from '../utils/marketFormat';

interface MarketTickerProps {
  instruments: MarketInstrument[];
  status: MarketDataStatus;
  asOf: string | null;
  isDelayed: boolean;
  isLoading: boolean;
}

export function MarketTicker({
  instruments,
  status,
  asOf,
  isDelayed,
  isLoading,
}: MarketTickerProps) {
  const { lang, ui, ist } = useSakarBazaar();
  const hasAnyValidQuote = instruments.some((inst) => inst.latestPrice !== null);
  const formattedAsOf = formatIstDisplayTimestamp(asOf);
  const sessionPhase = getMarketQuoteStatusLabel(status, lang);

  return (
    <div className="ticker sb-pulse-ticker-bar" aria-label="SakarBazaar Market Pulse Ticker">
      <div className="wrap sb-ticker-inner" id="ticker">
        <div className="sb-ticker-pulse-badge">
          <span className="pill sb-pill-teal">MARKET PULSE</span>
          <span className="meta" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
            {sessionPhase}
          </span>
        </div>

        <div className="sb-ticker-scroll-content">
          {MARKET_PULSE_ITEMS.slice(0, 4).map((pulse) => (
            <Link
              key={pulse.id}
              to={pulse.relatedPath ?? '/markets'}
              className="sb-ticker-pulse-item"
              title={pulse.title}
            >
              <span className="cat">{pulse.category}</span>
              <span className="sb-ticker-pulse-title">
                {lang === 'hi' && pulse.titleHi ? pulse.titleHi : pulse.title}
              </span>
              <span
                className={`pill ${
                  pulse.verificationStatus === 'awaiting_verification' ? 'sb-pill-amber' : ''
                }`}
                style={{ fontSize: '10px', padding: '1px 6px' }}
              >
                {pulse.verificationStatus === 'awaiting_verification' ? 'Unverified' : 'Verified'}
              </span>
            </Link>
          ))}

          {hasAnyValidQuote &&
            instruments.slice(0, 7).map((inst) => {
              const hasPrice = inst.latestPrice !== null;
              const hasChange = hasPrice && inst.absoluteChange !== null;
              const chg = inst.absoluteChange ?? 0;
              const pct = inst.percentChange;
              const changeClass = hasChange ? getChangeClass(chg) : '';

              return (
                <div className="tick" key={inst.id}>
                  <span>{inst.instrumentName}</span>
                  {hasPrice ? (
                    <>
                      <span className="num">
                        {inst.prefix ?? ''}
                        {formatIndianNumber(inst.latestPrice as number)}
                      </span>
                      {hasChange && pct !== null && (
                        <span className={`num ${changeClass}`}>
                          {getArrowSymbol(chg)} {getSignPrefix(pct)}
                          {formatIndianNumber(pct)}%
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="meta">Price Unavailable</span>
                  )}
                </div>
              );
            })}
        </div>

        <div className="sb-ticker-tail">
          <Link to="/markets" className="meta" style={{ color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {ui.indexOverview} →
          </Link>
        </div>
      </div>
    </div>
  );
}
