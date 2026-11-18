import type { MarketDataApiResponse, NormalizedQuote } from '../types/sakarbazaar.ts';

export const DEFAULT_MARKET_REFRESH_SECONDS = 60;
export const MIN_MARKET_REFRESH_SECONDS = 15;

export function resolveFrontendRefreshIntervalMs(rawSeconds?: string | number): number {
  const num = typeof rawSeconds === 'number' ? rawSeconds : Number(rawSeconds ?? DEFAULT_MARKET_REFRESH_SECONDS);
  if (!Number.isFinite(num) || num < MIN_MARKET_REFRESH_SECONDS) {
    return DEFAULT_MARKET_REFRESH_SECONDS * 1000;
  }
  return Math.floor(num * 1000);
}

export function markClientMarketDataStale(
  current: MarketDataApiResponse,
  errorMessage: string,
  now: Date = new Date(),
): MarketDataApiResponse {
  const hasValidQuotes = current.quotes.some((q) => q.latestPrice !== null);
  const errorEntry = {
    code: 'CLIENT_REFRESH_FAILED',
    message: errorMessage,
    at: now.toISOString(),
  };

  if (!hasValidQuotes) {
    return {
      ...current,
      retrievedAt: now.toISOString(),
      message: current.providerConfigured
        ? 'Market data temporarily unavailable from server.'
        : 'Market data currently unavailable. No authorized provider configured.',
      errors: [...current.errors.slice(-4), errorEntry],
    };
  }

  const staleQuotes: NormalizedQuote[] = current.quotes.map((q) =>
    q.latestPrice !== null
      ? { ...q, availabilityStatus: 'stale', errorDetail: errorMessage }
      : q,
  );

  return {
    ...current,
    status: 'stale',
    retrievedAt: now.toISOString(),
    message: 'Last available quote — data may be outdated.',
    quotes: staleQuotes,
    indices: staleQuotes.filter((q) => q.instrumentType === 'index'),
    indicators: staleQuotes.filter(
      (q) => q.instrumentType === 'currency' || q.instrumentType === 'commodity',
    ),
    equities: staleQuotes.filter((q) => q.instrumentType === 'equity'),
    errors: [...current.errors.slice(-4), errorEntry],
  };
}

export function shouldRefreshOnVisibilityResume(params: {
  visibilityState: string;
  lastAttemptMs: number | null;
  nowMs: number;
  refreshIntervalMs: number;
  isInFlight: boolean;
}): boolean {
  if (params.visibilityState !== 'visible' || params.isInFlight) {
    return false;
  }
  if (params.lastAttemptMs === null) {
    return true;
  }
  return params.nowMs - params.lastAttemptMs >= params.refreshIntervalMs;
}

export interface MarketAutoRefreshControllerOptions {
  refreshIntervalMs: number;
  fetchMarketData: (signal: AbortSignal) => Promise<MarketDataApiResponse>;
  onLoadingChange: (loading: boolean) => void;
  onDataSuccess: (data: MarketDataApiResponse) => void;
  onDataError: (errorMessage: string) => void;
  getVisibilityState?: () => string;
  nowFn?: () => number;
  setIntervalFn?: (cb: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
}

export class MarketAutoRefreshController {
  private readonly opts: Required<MarketAutoRefreshControllerOptions>;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private abortController: AbortController | null = null;
  private inFlight = false;
  private hasCompletedInitialFetch = false;
  private lastAttemptMs: number | null = null;
  private disposed = false;

  constructor(options: MarketAutoRefreshControllerOptions) {
    this.opts = {
      ...options,
      getVisibilityState:
        options.getVisibilityState ??
        (() => (typeof document !== 'undefined' ? document.visibilityState : 'visible')),
      nowFn: options.nowFn ?? (() => Date.now()),
      setIntervalFn: options.setIntervalFn ?? ((cb, ms) => globalThis.setInterval(cb, ms)),
      clearIntervalFn: options.clearIntervalFn ?? ((id) => globalThis.clearInterval(id)),
    };
  }

  isInFlight(): boolean {
    return this.inFlight;
  }

  start(): Promise<void> {
    this.disposed = false;
    if (this.timerId === null) {
      this.timerId = this.opts.setIntervalFn(() => {
        if (this.opts.getVisibilityState() === 'visible') {
          void this.refresh({ force: false });
        }
      }, this.opts.refreshIntervalMs);
    }
    return this.refresh({ force: true });
  }

  stop(): void {
    this.disposed = true;
    if (this.timerId !== null) {
      this.opts.clearIntervalFn(this.timerId);
      this.timerId = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.inFlight = false;
  }

  async handleVisibilityChange(): Promise<void> {
    if (this.disposed) return;
    const shouldRefresh = shouldRefreshOnVisibilityResume({
      visibilityState: this.opts.getVisibilityState(),
      lastAttemptMs: this.lastAttemptMs,
      nowMs: this.opts.nowFn(),
      refreshIntervalMs: this.opts.refreshIntervalMs,
      isInFlight: this.inFlight,
    });
    if (shouldRefresh) {
      await this.refresh({ force: true });
    }
  }

  async refresh(options?: { force?: boolean }): Promise<void> {
    if (this.disposed) return;
    if (this.inFlight) {
      // Prevent overlapping requests
      return;
    }
    if (!options?.force && this.opts.getVisibilityState() === 'hidden') {
      return;
    }

    this.inFlight = true;
    this.lastAttemptMs = this.opts.nowFn();
    this.abortController = new AbortController();

    if (!this.hasCompletedInitialFetch) {
      this.opts.onLoadingChange(true);
    }

    try {
      const data = await this.opts.fetchMarketData(this.abortController.signal);
      if (!this.disposed) {
        this.hasCompletedInitialFetch = true;
        this.opts.onDataSuccess(data);
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError' || this.disposed) {
        return;
      }
      this.hasCompletedInitialFetch = true;
      const msg = err instanceof Error ? err.message : 'Unable to refresh market data.';
      this.opts.onDataError(msg);
    } finally {
      this.inFlight = false;
      this.abortController = null;
      if (!this.disposed) {
        this.opts.onLoadingChange(false);
      }
    }
  }
}
