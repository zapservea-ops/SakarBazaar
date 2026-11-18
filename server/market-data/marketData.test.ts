import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_TRACKED_INSTRUMENTS,
  BENCHMARK_INDICES_CATALOG,
  POPULAR_EQUITIES_CATALOG,
} from './instruments.ts';
import { resolveExchangeSessionPhase } from './marketStatus.ts';
import {
  buildMarketDataResponse,
  normalizeInstrumentQuote,
  normalizeProviderTimestamp,
} from './normalizer.ts';
import {
  LicensedJsonProviderAdapter,
  ProviderRequestError,
  UnconfiguredProviderAdapter,
  createProviderAdapterFromEnv,
  sanitizeSecretString,
} from './provider.ts';
import { MarketDataCacheService } from './cache.ts';
import type {
  InstrumentDefinition,
  MarketProviderAdapter,
  ProviderFetchResult,
} from './types.ts';

const SAMPLE_OPEN_TIME = new Date('2026-11-16T05:00:00Z'); // Monday 10:30 AM IST (Market open)
const SAMPLE_RELIANCE = POPULAR_EQUITIES_CATALOG.find((i) => i.symbol === 'RELIANCE')!;
const SAMPLE_NIFTY = BENCHMARK_INDICES_CATALOG.find((i) => i.symbol === 'NIFTY 50')!;

test('canonical catalog includes all 6 required indices and 15 popular Indian equities', () => {
  assert.equal(BENCHMARK_INDICES_CATALOG.length, 6);
  assert.deepEqual(
    BENCHMARK_INDICES_CATALOG.map((i) => `${i.symbol}:${i.exchange}`),
    [
      'NIFTY 50:NSE',
      'SENSEX:BSE',
      'NIFTY BANK:NSE',
      'NIFTY IT:NSE',
      'INDIA VIX:NSE',
      'NIFTY SME EMERGE:NSE',
    ],
  );
  assert.equal(POPULAR_EQUITIES_CATALOG.length, 15);
  const expectedEquities = [
    'RELIANCE',
    'HDFCBANK',
    'ICICIBANK',
    'TCS',
    'INFY',
    'ITC',
    'BHARTIARTL',
    'LT',
    'COALINDIA',
    'SBIN',
    'TATAMOTORS',
    'AXISBANK',
    'KOTAKBANK',
    'HINDUNILVR',
    'BAJFINANCE',
  ];
  assert.deepEqual(
    POPULAR_EQUITIES_CATALOG.map((e) => e.symbol),
    expectedEquities,
  );
  assert.ok(ALL_TRACKED_INSTRUMENTS.length === 23);
});

test('normalizeInstrumentQuote handles valid test-fixture normalization and computes change from previousClose', () => {
  const res = normalizeInstrumentQuote(
    SAMPLE_RELIANCE,
    {
      symbol: 'RELIANCE',
      exchange: 'NSE',
      latestPrice: 1500,
      previousClose: 1450,
      dayHigh: 1512.5,
      dayLow: 1448,
      volume: 1234567,
      providerTimestamp: '2026-11-16T04:59:30Z',
      isDelayed: false,
    },
    {
      now: SAMPLE_OPEN_TIME,
      retrievedAt: SAMPLE_OPEN_TIME.toISOString(),
      marketStatus: 'open',
      providerId: 'fixture',
      providerName: 'Test Fixture Feed',
      defaultDelayed: false,
      defaultDelayMinutes: 0,
      maxStaleAgeSeconds: 300,
    },
  );

  assert.equal(res.error, undefined);
  assert.equal(res.quote.instrumentName, 'Reliance Industries Limited');
  assert.equal(res.quote.symbol, 'RELIANCE');
  assert.equal(res.quote.exchange, 'NSE');
  assert.equal(res.quote.latestPrice, 1500);
  assert.equal(res.quote.absoluteChange, 50);
  assert.equal(Number(res.quote.percentChange?.toFixed(2)), 3.45);
  assert.equal(res.quote.dayHigh, 1512.5);
  assert.equal(res.quote.dayLow, 1448);
  assert.equal(res.quote.volume, 1234567);
  assert.equal(res.quote.availabilityStatus, 'live');
  assert.equal(res.quote.isDelayed, false);
});

test('normalizeInstrumentQuote preserves missing optional fields as null and never invents values', () => {
  const res = normalizeInstrumentQuote(
    SAMPLE_NIFTY,
    {
      symbol: 'NIFTY 50',
      exchange: 'NSE',
      latestPrice: 24100.25,
      providerTimestamp: '2026-11-16T04:59:00Z',
      isDelayed: false,
    },
    {
      now: SAMPLE_OPEN_TIME,
      retrievedAt: SAMPLE_OPEN_TIME.toISOString(),
      marketStatus: 'open',
      providerId: 'fixture',
      providerName: 'Test Fixture Feed',
      defaultDelayed: false,
      defaultDelayMinutes: 0,
      maxStaleAgeSeconds: 300,
    },
  );

  assert.equal(res.quote.latestPrice, 24100.25);
  assert.equal(res.quote.previousClose, null);
  assert.equal(res.quote.absoluteChange, null);
  assert.equal(res.quote.percentChange, null);
  assert.equal(res.quote.dayHigh, null);
  assert.equal(res.quote.dayLow, null);
  assert.equal(res.quote.volume, null);
});

test('normalizeInstrumentQuote rejects invalid prices (zero, negative, NaN, non-numeric)', () => {
  for (const badPrice of [0, -100, 'N/A', Number.NaN, null, undefined]) {
    const res = normalizeInstrumentQuote(
      SAMPLE_RELIANCE,
      {
        symbol: 'RELIANCE',
        exchange: 'NSE',
        latestPrice: badPrice,
        providerTimestamp: '2026-11-16T04:59:00Z',
      },
      {
        now: SAMPLE_OPEN_TIME,
        retrievedAt: SAMPLE_OPEN_TIME.toISOString(),
        marketStatus: 'open',
        providerId: 'fixture',
        providerName: 'Test Fixture Feed',
        defaultDelayed: false,
        defaultDelayMinutes: 0,
        maxStaleAgeSeconds: 300,
      },
    );

    assert.equal(res.quote.latestPrice, null);
    assert.equal(res.quote.availabilityStatus, 'unavailable');
    assert.equal(res.error?.code, 'INVALID_PRICE');
  }
});

test('normalizeProviderTimestamp & quote normalization reject invalid and future timestamps', () => {
  assert.equal(normalizeProviderTimestamp('not-a-timestamp', SAMPLE_OPEN_TIME).valid, false);
  assert.equal(normalizeProviderTimestamp('2026-11-16T12:00:00Z', SAMPLE_OPEN_TIME).valid, false); // future
  assert.equal(normalizeProviderTimestamp('1995-01-01T00:00:00Z', SAMPLE_OPEN_TIME).valid, false);

  const epochSec = Math.floor(SAMPLE_OPEN_TIME.getTime() / 1000) - 30;
  assert.equal(normalizeProviderTimestamp(epochSec, SAMPLE_OPEN_TIME).valid, true);

  const invalidRes = normalizeInstrumentQuote(
    SAMPLE_RELIANCE,
    {
      symbol: 'RELIANCE',
      exchange: 'NSE',
      latestPrice: 1490,
      providerTimestamp: 'bad-ts',
    },
    {
      now: SAMPLE_OPEN_TIME,
      retrievedAt: SAMPLE_OPEN_TIME.toISOString(),
      marketStatus: 'open',
      providerId: 'fixture',
      providerName: 'Test Fixture Feed',
      defaultDelayed: false,
      defaultDelayMinutes: 0,
      maxStaleAgeSeconds: 300,
    },
  );
  assert.equal(invalidRes.quote.availabilityStatus, 'unavailable');
  assert.equal(invalidRes.error?.code, 'INVALID_TIMESTAMP');
});

test('detects delayed quotes cleanly without mislabeling delayed as live', () => {
  const fifteenMinsAgo = new Date(SAMPLE_OPEN_TIME.getTime() - 15 * 60_000).toISOString();
  const res = normalizeInstrumentQuote(
    SAMPLE_RELIANCE,
    {
      symbol: 'RELIANCE',
      exchange: 'NSE',
      latestPrice: 1480,
      previousClose: 1470,
      providerTimestamp: fifteenMinsAgo,
      isDelayed: true,
      delayMinutes: 15,
    },
    {
      now: SAMPLE_OPEN_TIME,
      retrievedAt: SAMPLE_OPEN_TIME.toISOString(),
      marketStatus: 'open',
      providerId: 'fixture',
      providerName: 'Test Delayed Feed',
      defaultDelayed: true,
      defaultDelayMinutes: 15,
      maxStaleAgeSeconds: 300,
    },
  );

  assert.equal(res.quote.isDelayed, true);
  assert.equal(res.quote.availabilityStatus, 'delayed');
  assert.notEqual(res.quote.availabilityStatus, 'live');
});

test('detects stale quotes when quote age exceeds threshold during open session', () => {
  const twentyMinsAgo = new Date(SAMPLE_OPEN_TIME.getTime() - 20 * 60_000).toISOString();
  const res = normalizeInstrumentQuote(
    SAMPLE_RELIANCE,
    {
      symbol: 'RELIANCE',
      exchange: 'NSE',
      latestPrice: 1480,
      providerTimestamp: twentyMinsAgo,
      isDelayed: false,
    },
    {
      now: SAMPLE_OPEN_TIME,
      retrievedAt: SAMPLE_OPEN_TIME.toISOString(),
      marketStatus: 'open',
      providerId: 'fixture',
      providerName: 'Test Real-time Feed',
      defaultDelayed: false,
      defaultDelayMinutes: 0,
      maxStaleAgeSeconds: 300,
    },
  );

  assert.equal(res.quote.availabilityStatus, 'stale');
});

test('market status resolver handles open, pre_open, closed, weekend, holidays, and closed official quotes', () => {
  assert.equal(resolveExchangeSessionPhase(new Date('2026-11-16T04:00:00Z')), 'open'); // Mon 09:30 IST
  assert.equal(
    resolveExchangeSessionPhase(new Date('2026-11-16T03:35:00Z'), { providerConfigured: true }),
    'pre_open',
  ); // Mon 09:05 IST
  assert.equal(resolveExchangeSessionPhase(new Date('2026-11-16T11:00:00Z')), 'closed'); // Mon 16:30 IST
  assert.equal(resolveExchangeSessionPhase(new Date('2026-11-15T05:00:00Z')), 'weekend'); // Sunday
  assert.equal(resolveExchangeSessionPhase(new Date('2026-01-26T05:00:00Z')), 'holiday'); // Republic Day
  assert.equal(
    resolveExchangeSessionPhase(new Date('2026-11-16T05:00:00Z'), { customHolidays: ['2026-11-16'] }),
    'holiday',
  );

  // Market closed keeps last official session quote with market_closed status
  const res = normalizeInstrumentQuote(
    SAMPLE_RELIANCE,
    {
      symbol: 'RELIANCE',
      exchange: 'NSE',
      latestPrice: 1480,
      previousClose: 1460,
      providerTimestamp: '2026-11-13T10:00:00Z', // Friday 15:30 IST
    },
    {
      now: new Date('2026-11-15T05:00:00Z'), // Sunday
      retrievedAt: '2026-11-15T05:00:00Z',
      marketStatus: 'weekend',
      providerId: 'fixture',
      providerName: 'Test Exchange Feed',
      defaultDelayed: false,
      defaultDelayMinutes: 0,
      maxStaleAgeSeconds: 300,
    },
  );
  assert.equal(res.quote.latestPrice, 1480);
  assert.equal(res.quote.availabilityStatus, 'market_closed');
});

test('no-provider configuration runs safely and returns unavailable state for all instruments', async () => {
  const { adapter, config } = createProviderAdapterFromEnv({});
  assert.equal(adapter instanceof UnconfiguredProviderAdapter, true);
  assert.equal(adapter.isConfigured(), false);

  const service = new MarketDataCacheService({
    adapter,
    config,
    instruments: ALL_TRACKED_INSTRUMENTS,
    nowFn: () => SAMPLE_OPEN_TIME,
    logger: () => {},
  });

  const { response, httpStatus } = await service.getMarketData();
  assert.equal(httpStatus, 200);
  assert.equal(response.providerConfigured, false);
  assert.equal(response.status, 'unavailable');
  assert.equal(
    response.message,
    'Market data currently unavailable. No authorized provider configured.',
  );
  assert.equal(response.quotes.length, 23);
  assert.ok(response.quotes.every((q) => q.latestPrice === null && q.availabilityStatus === 'unavailable'));
});

test('backend cache expiration (60s), concurrent request deduplication, and stale last-known-good fallback work correctly', async () => {
  let upstreamCalls = 0;
  let shouldFailUpstream = false;
  let currentTimeMs = SAMPLE_OPEN_TIME.getTime();

  const mockAdapter: MarketProviderAdapter = {
    id: 'fixture_vendor',
    displayName: 'Test Fixture Vendor',
    isConfigured: () => true,
    validateConfig: () => ({ valid: true, missingKeys: [] }),
    async fetchQuotes(): Promise<ProviderFetchResult> {
      upstreamCalls += 1;
      await new Promise((r) => setTimeout(r, 15));
      if (shouldFailUpstream) {
        throw new ProviderRequestError('Provider upstream timeout', {
          code: 'PROVIDER_TIMEOUT',
          statusCode: 504,
          retryable: false,
        });
      }
      return {
        providerName: 'Test Fixture Vendor',
        configured: true,
        isDelayed: true,
        delayMinutes: 15,
        rawQuotes: [
          {
            symbol: 'RELIANCE',
            exchange: 'NSE',
            latestPrice: 1500 + upstreamCalls,
            previousClose: 1490,
            providerTimestamp: new Date(currentTimeMs - 15 * 60_000).toISOString(),
          },
        ],
        errors: [],
      };
    },
  };

  const service = new MarketDataCacheService({
    adapter: mockAdapter,
    config: {
      providerId: 'fixture_vendor',
      refreshIntervalSeconds: 60,
      maxStaleAgeSeconds: 300,
      requestTimeoutMs: 5000,
      isDelayedFeed: true,
      delayMinutes: 15,
    },
    instruments: [SAMPLE_RELIANCE],
    nowFn: () => new Date(currentTimeMs),
    logger: () => {},
  });

  // 5 concurrent callers trigger only 1 upstream fetch
  const concurrent = await Promise.all([
    service.getMarketData(),
    service.getMarketData(),
    service.getMarketData(),
    service.getMarketData(),
    service.getMarketData(),
  ]);
  assert.equal(upstreamCalls, 1);
  assert.equal(concurrent[0].response.status, 'delayed');
  assert.equal(concurrent[0].response.quotes[0].latestPrice, 1501);

  // Within 60s window serves cached response without upstream fetch
  currentTimeMs += 45_000;
  const cached = await service.getMarketData();
  assert.equal(upstreamCalls, 1);
  assert.equal(cached.response.quotes[0].latestPrice, 1501);

  // Past 60s expires cache and triggers fresh fetch
  currentTimeMs += 20_000;
  const refreshed = await service.getMarketData();
  assert.equal(upstreamCalls, 2);
  assert.equal(refreshed.response.quotes[0].latestPrice, 1502);

  // If next refresh fails after expiry, returns last-known-good price marked STALE
  currentTimeMs += 65_000;
  shouldFailUpstream = true;
  const staleFallback = await service.getMarketData();
  assert.equal(upstreamCalls, 3);
  assert.equal(staleFallback.httpStatus, 200);
  assert.equal(staleFallback.response.status, 'stale');
  assert.equal(staleFallback.response.marketStatus, 'outage');
  assert.equal(staleFallback.response.quotes[0].latestPrice, 1502);
  assert.equal(staleFallback.response.quotes[0].availabilityStatus, 'stale');
});

test('LicensedJsonProviderAdapter handles rate-limit 429, timeouts, and never leaks secrets', async () => {
  const secretKey = 'super-secret-api-key-12345';
  let attempts = 0;

  // Rate limit 429 triggers retry and rejects cleanly if exhausted
  const rateLimitedAdapter = new LicensedJsonProviderAdapter(
    {
      providerId: 'licensed_json',
      apiKey: secretKey,
      baseUrl: 'https://api.example-vendor.test/quotes',
      refreshIntervalSeconds: 60,
      maxStaleAgeSeconds: 300,
      requestTimeoutMs: 1000,
      isDelayedFeed: true,
      delayMinutes: 15,
    },
    async () => {
      attempts += 1;
      return new Response(JSON.stringify({ error: 'rate limit' }), {
        status: 429,
        headers: { 'Retry-After': '0' },
      });
    },
  );

  await assert.rejects(
    () => rateLimitedAdapter.fetchQuotes([SAMPLE_RELIANCE]),
    (err: unknown) => err instanceof ProviderRequestError && err.code === 'PROVIDER_RATE_LIMITED' && err.statusCode === 429,
  );
  assert.equal(attempts, 3); // initial + 2 retries

  // Timeout AbortError surfaces 504 PROVIDER_TIMEOUT cleanly
  const timeoutAdapter = new LicensedJsonProviderAdapter(
    {
      providerId: 'licensed_json',
      apiKey: secretKey,
      baseUrl: 'https://api.example-vendor.test/quotes',
      refreshIntervalSeconds: 60,
      maxStaleAgeSeconds: 300,
      requestTimeoutMs: 50,
      isDelayedFeed: true,
      delayMinutes: 15,
    },
    async (_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    },
  );

  await assert.rejects(
    () => timeoutAdapter.fetchQuotes([SAMPLE_RELIANCE]),
    (err: unknown) => err instanceof ProviderRequestError && err.code === 'PROVIDER_TIMEOUT' && err.statusCode === 504,
  );

  // Secret sanitization redacts credentials
  const redacted = sanitizeSecretString(`Failed with ${secretKey}`, [secretKey]);
  assert.equal(redacted.includes(secretKey), false);
  assert.ok(redacted.includes('[REDACTED]'));
});

test('buildMarketDataResponse handles aggregated unavailable quote set safely', () => {
  const res = buildMarketDataResponse({
    definitions: [SAMPLE_RELIANCE],
    fetchResult: {
      providerName: 'Test',
      configured: true,
      isDelayed: false,
      delayMinutes: 0,
      rawQuotes: [],
      errors: [],
    },
    providerId: 'test',
    marketStatus: 'open',
    now: SAMPLE_OPEN_TIME,
    refreshIntervalSeconds: 60,
    maxStaleAgeSeconds: 300,
  });
  assert.equal(res.status, 'unavailable');
  assert.equal(res.quotes[0].availabilityStatus, 'unavailable');
});
