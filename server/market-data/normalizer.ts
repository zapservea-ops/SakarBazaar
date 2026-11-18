import type {
  ExchangeSessionPhase,
  InstrumentDefinition,
  MarketDataApiResponse,
  MarketDataErrorItem,
  MarketDataStatus,
  NormalizedQuote,
  ProviderFetchResult,
  RawProviderQuoteInput,
} from './types.ts';

function parseFiniteNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'boolean') return null;
  const parsed = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, '').trim());
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parsePositiveNumber(raw: unknown): number | null {
  const num = parseFiniteNumber(raw);
  if (num === null || num <= 0) return null;
  return num;
}

function parseNonNegativeNumber(raw: unknown): number | null {
  const num = parseFiniteNumber(raw);
  if (num === null || num < 0) return null;
  return num;
}

export function normalizeProviderTimestamp(
  raw: unknown,
  now: Date,
): { iso: string | null; valid: boolean; reason?: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { iso: null, valid: false, reason: 'Missing provider timestamp' };
  }

  let date: Date;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) {
      return { iso: null, valid: false, reason: 'Invalid numeric timestamp' };
    }
    // Support seconds (< 1e11) vs milliseconds
    const ms = raw < 1e11 ? raw * 1000 : raw;
    date = new Date(ms);
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d{10,13}$/.test(trimmed)) {
      const n = Number(trimmed);
      const ms = trimmed.length === 10 ? n * 1000 : n;
      date = new Date(ms);
    } else {
      date = new Date(trimmed);
    }
  } else {
    return { iso: null, valid: false, reason: 'Unsupported timestamp format' };
  }

  const timeMs = date.getTime();
  if (Number.isNaN(timeMs) || timeMs < Date.UTC(2000, 0, 1)) {
    return { iso: null, valid: false, reason: 'Unparseable or out-of-range timestamp' };
  }

  // Allow up to 2 minutes of minor clock skew; reject far-future bogus dates.
  if (timeMs - now.getTime() > 120_000) {
    return { iso: null, valid: false, reason: 'Provider timestamp is in the future' };
  }

  return { iso: date.toISOString(), valid: true };
}

export function buildUnavailableQuote(
  definition: InstrumentDefinition,
  retrievedAt: string | null = null,
  reason = 'No authorized provider configured',
): NormalizedQuote {
  return {
    id: definition.id,
    instrumentName: definition.name,
    symbol: definition.symbol,
    exchange: definition.exchange,
    instrumentType: definition.instrumentType,
    latestPrice: null,
    absoluteChange: null,
    percentChange: null,
    previousClose: null,
    dayHigh: null,
    dayLow: null,
    volume: null,
    currency: definition.currency,
    prefix: definition.prefix,
    unit: definition.unit,
    providerTimestamp: null,
    retrievedAt,
    source: reason,
    isDelayed: false,
    delayMinutes: null,
    availabilityStatus: 'unavailable',
    note: definition.note,
    errorDetail: null,
  };
}

export interface NormalizeQuoteOptions {
  now: Date;
  retrievedAt: string;
  marketStatus: ExchangeSessionPhase;
  providerId: string;
  providerName: string;
  defaultDelayed: boolean;
  defaultDelayMinutes: number | null;
  maxStaleAgeSeconds: number;
}

export function normalizeInstrumentQuote(
  definition: InstrumentDefinition,
  raw: RawProviderQuoteInput | undefined,
  options: NormalizeQuoteOptions,
): { quote: NormalizedQuote; error?: MarketDataErrorItem } {
  if (!raw) {
    return {
      quote: buildUnavailableQuote(
        definition,
        options.retrievedAt,
        `${options.providerName} (missing instrument quote)`,
      ),
    };
  }

  const latestPrice = parsePositiveNumber(raw.latestPrice);
  if (latestPrice === null) {
    const error: MarketDataErrorItem = {
      code: 'INVALID_PRICE',
      symbol: definition.symbol,
      message: `Invalid or missing price received for ${definition.symbol}.`,
      at: options.retrievedAt,
    };
    return {
      quote: {
        ...buildUnavailableQuote(definition, options.retrievedAt, raw.source || options.providerName),
        errorDetail: error.message,
      },
      error,
    };
  }

  const tsCheck = normalizeProviderTimestamp(raw.providerTimestamp, options.now);
  if (!tsCheck.valid || !tsCheck.iso) {
    const error: MarketDataErrorItem = {
      code: 'INVALID_TIMESTAMP',
      symbol: definition.symbol,
      message: `${tsCheck.reason ?? 'Invalid timestamp'} for ${definition.symbol}.`,
      at: options.retrievedAt,
    };
    return {
      quote: {
        ...buildUnavailableQuote(definition, options.retrievedAt, raw.source || options.providerName),
        errorDetail: error.message,
      },
      error,
    };
  }

  const previousClose = parsePositiveNumber(raw.previousClose);
  const directAbsChange = parseFiniteNumber(raw.absoluteChange);
  const directPctChange = parseFiniteNumber(raw.percentChange);

  const absoluteChange =
    directAbsChange !== null
      ? Number(directAbsChange.toFixed(4))
      : previousClose !== null
        ? Number((latestPrice - previousClose).toFixed(4))
        : null;

  const percentChange =
    directPctChange !== null
      ? Number(directPctChange.toFixed(4))
      : previousClose !== null && absoluteChange !== null
        ? Number(((absoluteChange / previousClose) * 100).toFixed(4))
        : null;

  const dayHigh = parsePositiveNumber(raw.dayHigh);
  const dayLow = parsePositiveNumber(raw.dayLow);
  const volume = parseNonNegativeNumber(raw.volume);

  const isDelayed = typeof raw.isDelayed === 'boolean' ? raw.isDelayed : options.defaultDelayed;
  const delayMinutes =
    parseNonNegativeNumber(raw.delayMinutes) ?? (isDelayed ? options.defaultDelayMinutes ?? 15 : 0);

  const providerTimeMs = new Date(tsCheck.iso).getTime();
  const ageSeconds = (options.now.getTime() - providerTimeMs) / 1000;
  const effectiveStaleThresholdSec = isDelayed
    ? Math.max(options.maxStaleAgeSeconds, (delayMinutes ?? 15) * 60 + 180)
    : options.maxStaleAgeSeconds;

  const isExchangeClosed =
    Boolean(raw.marketClosed) ||
    options.marketStatus === 'closed' ||
    options.marketStatus === 'weekend' ||
    options.marketStatus === 'holiday';

  let availabilityStatus: MarketDataStatus;
  if (isExchangeClosed) {
    availabilityStatus = 'market_closed';
  } else if (ageSeconds > effectiveStaleThresholdSec) {
    availabilityStatus = 'stale';
  } else if (isDelayed) {
    availabilityStatus = 'delayed';
  } else {
    availabilityStatus = 'live';
  }

  return {
    quote: {
      id: definition.id,
      instrumentName: definition.name,
      symbol: definition.symbol,
      exchange: definition.exchange,
      instrumentType: definition.instrumentType,
      latestPrice,
      absoluteChange,
      percentChange,
      previousClose,
      dayHigh,
      dayLow,
      volume,
      currency: definition.currency,
      prefix: definition.prefix,
      unit: definition.unit,
      providerTimestamp: tsCheck.iso,
      retrievedAt: options.retrievedAt,
      source: raw.source?.trim() || options.providerName,
      isDelayed,
      delayMinutes: isDelayed ? delayMinutes : 0,
      availabilityStatus,
      note: definition.note,
      errorDetail: null,
    },
  };
}

function matchRawQuote(
  definition: InstrumentDefinition,
  rawQuotes: RawProviderQuoteInput[],
  providerId: string,
): RawProviderQuoteInput | undefined {
  const expectedProviderSym = (definition.providerSymbols[providerId] ?? '').toLowerCase();
  const expectedSym = definition.symbol.toLowerCase();
  const expectedEx = definition.exchange.toLowerCase();

  return rawQuotes.find((item) => {
    if (item.id && item.id === definition.id) return true;
    const rawProvSym = item.providerSymbol?.trim().toLowerCase();
    if (rawProvSym && expectedProviderSym && rawProvSym === expectedProviderSym) return true;
    const rawSym = item.symbol?.trim().toLowerCase();
    const rawEx = item.exchange?.trim().toLowerCase();
    if (rawSym && rawSym === expectedSym && (!rawEx || rawEx === expectedEx)) return true;
    return false;
  });
}

export function buildMarketDataResponse(params: {
  definitions: InstrumentDefinition[];
  fetchResult: ProviderFetchResult;
  providerId: string;
  marketStatus: ExchangeSessionPhase;
  now: Date;
  refreshIntervalSeconds: number;
  maxStaleAgeSeconds: number;
}): MarketDataApiResponse {
  const retrievedAt = params.now.toISOString();

  if (!params.fetchResult.configured) {
    const quotes = params.definitions.map((d) =>
      buildUnavailableQuote(d, retrievedAt, 'No authorized feed configured'),
    );
    return {
      status: 'unavailable',
      providerConfigured: false,
      provider: params.fetchResult.providerName,
      asOf: null,
      retrievedAt,
      refreshIntervalSeconds: params.refreshIntervalSeconds,
      marketStatus: params.marketStatus,
      isDelayed: false,
      message: 'Market data currently unavailable. No authorized provider configured.',
      quotes,
      indices: quotes.filter((q) => q.instrumentType === 'index'),
      indicators: quotes.filter((q) => q.instrumentType === 'currency' || q.instrumentType === 'commodity'),
      equities: quotes.filter((q) => q.instrumentType === 'equity'),
      errors: params.fetchResult.errors,
    };
  }

  const collectedErrors: MarketDataErrorItem[] = [...params.fetchResult.errors];
  const quotes: NormalizedQuote[] = params.definitions.map((def) => {
    const raw = matchRawQuote(def, params.fetchResult.rawQuotes, params.providerId);
    const normalized = normalizeInstrumentQuote(def, raw, {
      now: params.now,
      retrievedAt,
      marketStatus: params.marketStatus,
      providerId: params.providerId,
      providerName: params.fetchResult.providerName,
      defaultDelayed: params.fetchResult.isDelayed,
      defaultDelayMinutes: params.fetchResult.delayMinutes,
      maxStaleAgeSeconds: params.maxStaleAgeSeconds,
    });
    if (normalized.error) collectedErrors.push(normalized.error);
    return normalized.quote;
  });

  const validQuotes = quotes.filter((q) => q.latestPrice !== null);
  const timestamps = validQuotes
    .map((q) => q.providerTimestamp)
    .filter((t): t is string => Boolean(t))
    .sort();
  const latestAsOf = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

  let overallStatus: MarketDataStatus;
  let message: string;
  const anyDelayed = validQuotes.some((q) => q.isDelayed) || params.fetchResult.isDelayed;

  if (validQuotes.length === 0) {
    overallStatus = 'unavailable';
    message = 'Market data currently unavailable.';
  } else if (
    params.marketStatus === 'closed' ||
    params.marketStatus === 'weekend' ||
    params.marketStatus === 'holiday'
  ) {
    overallStatus = 'market_closed';
    message = 'Indian markets closed. Showing last available official session quote.';
  } else if (validQuotes.every((q) => q.availabilityStatus === 'stale')) {
    overallStatus = 'stale';
    message = 'Last available quote — data may be outdated.';
  } else if (anyDelayed) {
    overallStatus = 'delayed';
    message = 'Delayed market data.';
  } else {
    overallStatus = 'live';
    message = `Market feed active (${params.fetchResult.providerName}).`;
  }

  return {
    status: overallStatus,
    providerConfigured: true,
    provider: params.fetchResult.providerName,
    asOf: latestAsOf,
    retrievedAt,
    refreshIntervalSeconds: params.refreshIntervalSeconds,
    marketStatus: params.marketStatus,
    isDelayed: anyDelayed,
    message,
    quotes,
    indices: quotes.filter((q) => q.instrumentType === 'index'),
    indicators: quotes.filter((q) => q.instrumentType === 'currency' || q.instrumentType === 'commodity'),
    equities: quotes.filter((q) => q.instrumentType === 'equity'),
    errors: collectedErrors,
  };
}

export function markResponseAsStale(
  previous: MarketDataApiResponse,
  error: MarketDataErrorItem,
  now: Date,
  marketStatus: ExchangeSessionPhase,
): MarketDataApiResponse {
  const staleQuotes: NormalizedQuote[] = previous.quotes.map((q) =>
    q.latestPrice !== null
      ? { ...q, availabilityStatus: 'stale', errorDetail: error.message }
      : { ...q, availabilityStatus: 'unavailable' },
  );

  return {
    ...previous,
    status: staleQuotes.some((q) => q.latestPrice !== null) ? 'stale' : 'unavailable',
    retrievedAt: now.toISOString(),
    marketStatus,
    message: 'Last available quote — data may be outdated.',
    quotes: staleQuotes,
    indices: staleQuotes.filter((q) => q.instrumentType === 'index'),
    indicators: staleQuotes.filter((q) => q.instrumentType === 'currency' || q.instrumentType === 'commodity'),
    equities: staleQuotes.filter((q) => q.instrumentType === 'equity'),
    errors: [...previous.errors.slice(-4), error],
  };
}
