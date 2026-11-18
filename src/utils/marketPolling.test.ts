import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketDataApiResponse } from '../types/sakarbazaar';
import {
  MarketAutoRefreshController,
  markClientMarketDataStale,
  resolveFrontendRefreshIntervalMs,
  shouldRefreshOnVisibilityResume,
} from './marketPolling';

function createFixtureResponse(overrides?: Partial<MarketDataApiResponse>): MarketDataApiResponse {
  const quote = {
    id: 'eq-reliance',
    instrumentName: 'Reliance Industries Limited',
    symbol: 'RELIANCE',
    exchange: 'NSE' as const,
    instrumentType: 'equity' as const,
    latestPrice: 1495,
    absoluteChange: 12.5,
    percentChange: 0.84,
    previousClose: 1482.5,
    dayHigh: 1502,
    dayLow: 1479,
    volume: 100000,
    currency: 'INR',
    prefix: '₹',
    providerTimestamp: '2026-11-16T05:00:00.000Z',
    retrievedAt: '2026-11-16T05:00:02.000Z',
    source: 'Test Feed',
    isDelayed: true,
    delayMinutes: 15,
    availabilityStatus: 'delayed' as const,
  };
  return {
    status: 'delayed',
    providerConfigured: true,
    provider: 'Test Feed',
    asOf: '2026-11-16T05:00:00.000Z',
    retrievedAt: '2026-11-16T05:00:02.000Z',
    refreshIntervalSeconds: 60,
    marketStatus: 'open',
    isDelayed: true,
    message: 'Delayed market data.',
    quotes: [quote],
    indices: [],
    indicators: [],
    equities: [quote],
    errors: [],
    ...overrides,
  };
}

test('resolveFrontendRefreshIntervalMs enforces 60s default and safe 15s floor', () => {
  assert.equal(resolveFrontendRefreshIntervalMs(undefined), 60_000);
  assert.equal(resolveFrontendRefreshIntervalMs('bad'), 60_000);
  assert.equal(resolveFrontendRefreshIntervalMs('5'), 60_000);
  assert.equal(resolveFrontendRefreshIntervalMs('90'), 90_000);
});

test('markClientMarketDataStale preserves last valid quotes marked stale and handles unavailable state', () => {
  const valid = createFixtureResponse();
  const stale = markClientMarketDataStale(valid, 'Temporary gateway error');
  assert.equal(stale.status, 'stale');
  assert.equal(stale.message, 'Last available quote — data may be outdated.');
  assert.equal(stale.quotes[0].latestPrice, 1495);
  assert.equal(stale.quotes[0].availabilityStatus, 'stale');

  const unconfigured = createFixtureResponse({
    status: 'unavailable',
    providerConfigured: false,
    quotes: [
      {
        ...valid.quotes[0],
        latestPrice: null,
        absoluteChange: null,
        percentChange: null,
        availabilityStatus: 'unavailable',
      },
    ],
  });
  const unconfiguredAfterErr = markClientMarketDataStale(unconfigured, 'Network down');
  assert.equal(unconfiguredAfterErr.status, 'unavailable');
  assert.equal(
    unconfiguredAfterErr.message,
    'Market data currently unavailable. No authorized provider configured.',
  );
});

test('MarketAutoRefreshController performs initial load, 60s interval updates, pauses when hidden, prevents overlaps, and cleans up', async () => {
  let visibility = 'visible';
  let nowMs = 1_000_000;
  const hooks: {
    intervalCb: (() => void) | null;
    resolveSlowFetch: ((val: MarketDataApiResponse) => void) | null;
  } = {
    intervalCb: null,
    resolveSlowFetch: null,
  };
  let clearedTimer = false;
  let fetchCount = 0;

  const loadingEvents: boolean[] = [];
  const dataUpdates: MarketDataApiResponse[] = [];
  const errors: string[] = [];

  const controller = new MarketAutoRefreshController({
    refreshIntervalMs: 60_000,
    fetchMarketData: async () => {
      fetchCount += 1;
      if (fetchCount === 2) {
        return new Promise<MarketDataApiResponse>((resolve) => {
          hooks.resolveSlowFetch = resolve;
        });
      }
      if (fetchCount === 3) {
        throw new Error('Upstream 503');
      }
      return createFixtureResponse();
    },
    onLoadingChange: (l) => loadingEvents.push(l),
    onDataSuccess: (d) => dataUpdates.push(d),
    onDataError: (msg) => errors.push(msg),
    getVisibilityState: () => visibility,
    nowFn: () => nowMs,
    setIntervalFn: (cb) => {
      hooks.intervalCb = cb;
      return 123 as unknown as ReturnType<typeof setInterval>;
    },
    clearIntervalFn: () => {
      clearedTimer = true;
    },
  });

  // Start triggers initial loading state + fetch #1
  await controller.start();
  assert.equal(fetchCount, 1);
  assert.deepEqual(loadingEvents, [true, false]);
  assert.equal(dataUpdates.length, 1);

  // Hidden tab skips automatic interval tick
  visibility = 'hidden';
  nowMs += 60_000;
  hooks.intervalCb?.();
  assert.equal(fetchCount, 1);

  // Returning to visible after >= 60s triggers refresh #2
  visibility = 'visible';
  const resumePromise = controller.handleVisibilityChange();
  assert.equal(fetchCount, 2);
  assert.equal(controller.isInFlight(), true);

  // Triggering another refresh while #2 is in-flight is ignored (no overlapping fetches)
  await controller.refresh({ force: true });
  assert.equal(fetchCount, 2);

  hooks.resolveSlowFetch?.(createFixtureResponse({ asOf: '2026-11-16T05:01:00.000Z' }));
  await resumePromise;
  assert.equal(dataUpdates.length, 2);

  // Transient error on tick #3 reports error cleanly without wiping data
  nowMs += 60_000;
  await controller.refresh();
  assert.equal(fetchCount, 3);
  assert.equal(errors[0], 'Upstream 503');

  // Stop cleans up timer
  controller.stop();
  assert.equal(clearedTimer, true);
});

test('shouldRefreshOnVisibilityResume respects interval and inflight guard', () => {
  assert.equal(
    shouldRefreshOnVisibilityResume({
      visibilityState: 'hidden',
      lastAttemptMs: 0,
      nowMs: 120_000,
      refreshIntervalMs: 60_000,
      isInFlight: false,
    }),
    false,
  );
  assert.equal(
    shouldRefreshOnVisibilityResume({
      visibilityState: 'visible',
      lastAttemptMs: 100_000,
      nowMs: 120_000,
      refreshIntervalMs: 60_000,
      isInFlight: false,
    }),
    false,
  );
  assert.equal(
    shouldRefreshOnVisibilityResume({
      visibilityState: 'visible',
      lastAttemptMs: 100_000,
      nowMs: 165_000,
      refreshIntervalMs: 60_000,
      isInFlight: false,
    }),
    true,
  );
});
