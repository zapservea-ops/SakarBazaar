export type MarketDataStatus = 'live' | 'delayed' | 'stale' | 'unavailable' | 'market_closed';

export type ExchangeSessionPhase =
  | 'open'
  | 'pre_open'
  | 'closed'
  | 'weekend'
  | 'holiday'
  | 'outage';

export type InstrumentExchange = 'NSE' | 'BSE' | 'MCX' | 'FBIL' | 'N/A';

export type InstrumentType = 'index' | 'currency' | 'commodity' | 'equity';

export interface InstrumentDefinition {
  id: string;
  name: string;
  symbol: string;
  exchange: InstrumentExchange;
  instrumentType: InstrumentType;
  currency: string;
  prefix?: string;
  unit?: string;
  isin?: string;
  providerSymbols: Record<string, string>;
  note?: string;
}

export interface NormalizedQuote {
  id: string;
  instrumentName: string;
  symbol: string;
  exchange: InstrumentExchange;
  instrumentType: InstrumentType;
  latestPrice: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  currency: string;
  prefix?: string;
  unit?: string;
  providerTimestamp: string | null;
  retrievedAt: string | null;
  source: string;
  isDelayed: boolean;
  delayMinutes: number | null;
  availabilityStatus: MarketDataStatus;
  note?: string;
  errorDetail?: string | null;
}

export interface MarketDataErrorItem {
  code: string;
  message: string;
  symbol?: string;
  at: string;
}

export interface MarketDataApiResponse {
  status: MarketDataStatus;
  providerConfigured: boolean;
  provider: string;
  asOf: string | null;
  retrievedAt: string;
  refreshIntervalSeconds: number;
  marketStatus: ExchangeSessionPhase;
  isDelayed: boolean;
  message: string;
  quotes: NormalizedQuote[];
  indices: NormalizedQuote[];
  indicators: NormalizedQuote[];
  equities: NormalizedQuote[];
  errors: MarketDataErrorItem[];
}

export interface RawProviderQuoteInput {
  id?: string;
  providerSymbol?: string;
  symbol?: string;
  exchange?: string;
  latestPrice?: unknown;
  previousClose?: unknown;
  absoluteChange?: unknown;
  percentChange?: unknown;
  dayHigh?: unknown;
  dayLow?: unknown;
  volume?: unknown;
  providerTimestamp?: unknown;
  source?: string;
  isDelayed?: boolean;
  delayMinutes?: unknown;
  marketClosed?: boolean;
}

export interface ProviderFetchResult {
  providerName: string;
  configured: boolean;
  isDelayed: boolean;
  delayMinutes: number | null;
  rawQuotes: RawProviderQuoteInput[];
  errors: MarketDataErrorItem[];
  providerMarketStatus?: ExchangeSessionPhase;
}

export interface ProviderEnvironmentConfig {
  providerId: string;
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  refreshIntervalSeconds: number;
  maxStaleAgeSeconds: number;
  requestTimeoutMs: number;
  isDelayedFeed: boolean;
  delayMinutes: number | null;
}

export interface MarketProviderAdapter {
  readonly id: string;
  readonly displayName: string;
  isConfigured(): boolean;
  validateConfig(): { valid: boolean; missingKeys: string[]; error?: string };
  fetchQuotes(
    instruments: InstrumentDefinition[],
    signal?: AbortSignal,
  ): Promise<ProviderFetchResult>;
}
