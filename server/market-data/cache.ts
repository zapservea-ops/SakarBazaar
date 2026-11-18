import { ALL_TRACKED_INSTRUMENTS } from './instruments.ts';
import { resolveExchangeSessionPhase } from './marketStatus.ts';
import {
  buildMarketDataResponse,
  buildUnavailableQuote,
  markResponseAsStale,
} from './normalizer.ts';
import { ProviderRequestError } from './provider.ts';
import type {
  InstrumentDefinition,
  MarketDataApiResponse,
  MarketProviderAdapter,
  ProviderEnvironmentConfig,
} from './types.ts';

export interface MarketDataServiceOptions {
  adapter: MarketProviderAdapter;
  config: ProviderEnvironmentConfig;
  instruments?: InstrumentDefinition[];
  customHolidays?: Iterable<string>;
  nowFn?: () => Date;
  logger?: (level: 'info' | 'warn' | 'error', event: Record<string, unknown>) => void;
}

export class MarketDataCacheService {
  private readonly adapter: MarketProviderAdapter;
  private readonly config: ProviderEnvironmentConfig;
  private readonly instruments: InstrumentDefinition[];
  private readonly customHolidays?: Iterable<string>;
  private readonly nowFn: () => Date;
  private readonly logger: (level: 'info' | 'warn' | 'error', event: Record<string, unknown>) => void;

  private cachedResponse: MarketDataApiResponse | null = null;
  private cacheExpiresAtMs = 0;
  private lastKnownGoodResponse: MarketDataApiResponse | null = null;
  private inflightPromise: Promise<{ response: MarketDataApiResponse; httpStatus: number }> | null =
    null;

  constructor(options: MarketDataServiceOptions) {
    this.adapter = options.adapter;
    this.config = options.config;
    this.instruments = options.instruments ?? ALL_TRACKED_INSTRUMENTS;
    this.customHolidays = options.customHolidays;
    this.nowFn = options.nowFn ?? (() => new Date());
    this.logger =
      options.logger ??
      ((level, event) => {
        if (level === 'error') {
          console.error(JSON.stringify(event));
        } else if (level === 'warn') {
          console.warn(JSON.stringify(event));
        }
      });
  }

  getSnapshotMetadata() {
    return {
      providerId: this.adapter.id,
      providerName: this.adapter.displayName,
      configured: this.adapter.isConfigured(),
      refreshIntervalSeconds: this.config.refreshIntervalSeconds,
      instrumentCount: this.instruments.length,
    };
  }

  clearCache() {
    this.cachedResponse = null;
    this.cacheExpiresAtMs = 0;
  }

  async getMarketData(): Promise<{ response: MarketDataApiResponse; httpStatus: number }> {
    const now = this.nowFn();
    const nowMs = now.getTime();

    // Serve fresh response within 60-second backend cache window while keeping IST marketStatus current
    if (this.cachedResponse && nowMs < this.cacheExpiresAtMs) {
      const currentPhase = resolveExchangeSessionPhase(now, {
        customHolidays: this.customHolidays,
        providerConfigured: this.adapter.isConfigured(),
        hasProviderOutage: this.cachedResponse.marketStatus === 'outage',
      });
      if (currentPhase !== this.cachedResponse.marketStatus) {
        this.cachedResponse = { ...this.cachedResponse, marketStatus: currentPhase };
      }
      return { response: this.cachedResponse, httpStatus: 200 };
    }

    // Deduplicate simultaneous incoming requests so only one upstream provider call runs
    if (this.inflightPromise) {
      return this.inflightPromise;
    }

    this.inflightPromise = this.refreshFromProvider(now).finally(() => {
      this.inflightPromise = null;
    });

    return this.inflightPromise;
  }

  private async refreshFromProvider(
    now: Date,
  ): Promise<{ response: MarketDataApiResponse; httpStatus: number }> {
    const ttlMs = this.config.refreshIntervalSeconds * 1000;
    const configured = this.adapter.isConfigured();

    if (!configured) {
      const marketStatus = resolveExchangeSessionPhase(now, {
        customHolidays: this.customHolidays,
        providerConfigured: false,
      });
      const response = buildMarketDataResponse({
        definitions: this.instruments,
        fetchResult: await this.adapter.fetchQuotes(this.instruments),
        providerId: this.adapter.id,
        marketStatus,
        now,
        refreshIntervalSeconds: this.config.refreshIntervalSeconds,
        maxStaleAgeSeconds: this.config.maxStaleAgeSeconds,
      });
      this.cachedResponse = response;
      this.cacheExpiresAtMs = now.getTime() + ttlMs;
      return { response, httpStatus: 200 };
    }

    try {
      const fetchResult = await this.adapter.fetchQuotes(this.instruments);
      const marketStatus = resolveExchangeSessionPhase(now, {
        customHolidays: this.customHolidays,
        providerConfigured: true,
        providerStatus: fetchResult.providerMarketStatus,
      });

      const response = buildMarketDataResponse({
        definitions: this.instruments,
        fetchResult,
        providerId: this.adapter.id,
        marketStatus,
        now,
        refreshIntervalSeconds: this.config.refreshIntervalSeconds,
        maxStaleAgeSeconds: this.config.maxStaleAgeSeconds,
      });

      if (response.quotes.some((q) => q.latestPrice !== null)) {
        this.lastKnownGoodResponse = response;
      }

      this.cachedResponse = response;
      this.cacheExpiresAtMs = now.getTime() + ttlMs;

      this.logger('info', {
        event: 'market_data_refresh',
        provider: this.adapter.id,
        status: response.status,
        marketStatus: response.marketStatus,
        validQuotes: response.quotes.filter((q) => q.latestPrice !== null).length,
        errorCount: response.errors.length,
        retrievedAt: response.retrievedAt,
      });

      return { response, httpStatus: 200 };
    } catch (err) {
      const code = err instanceof ProviderRequestError ? err.code : 'PROVIDER_ERROR';
      const statusCode = err instanceof ProviderRequestError ? err.statusCode : 502;
      const message =
        err instanceof Error ? err.message : 'Unable to fetch market data from configured provider.';

      const errorItem = {
        code,
        message,
        at: now.toISOString(),
      };

      this.logger('warn', {
        event: 'market_data_refresh_failed',
        provider: this.adapter.id,
        code,
        statusCode,
        message,
        hasLastKnownGood: Boolean(this.lastKnownGoodResponse),
      });

      const marketStatus = resolveExchangeSessionPhase(now, {
        customHolidays: this.customHolidays,
        providerConfigured: true,
        hasProviderOutage: true,
      });

      if (this.lastKnownGoodResponse) {
        const staleResponse = markResponseAsStale(
          this.lastKnownGoodResponse,
          errorItem,
          now,
          marketStatus,
        );
        // Short cool-down cache (15s) on stale fallback to protect provider from stampedes
        this.cachedResponse = staleResponse;
        this.cacheExpiresAtMs = now.getTime() + Math.min(15_000, ttlMs);
        return { response: staleResponse, httpStatus: 200 };
      }

      const retrievedAt = now.toISOString();
      const unavailableQuotes = this.instruments.map((inst) =>
        buildUnavailableQuote(inst, retrievedAt, this.adapter.displayName),
      );
      const failureResponse: MarketDataApiResponse = {
        status: 'unavailable',
        providerConfigured: true,
        provider: this.adapter.displayName,
        asOf: null,
        retrievedAt,
        refreshIntervalSeconds: this.config.refreshIntervalSeconds,
        marketStatus,
        isDelayed: false,
        message: 'Market data temporarily unavailable from provider.',
        quotes: unavailableQuotes,
        indices: unavailableQuotes.filter((q) => q.instrumentType === 'index'),
        indicators: unavailableQuotes.filter(
          (q) => q.instrumentType === 'currency' || q.instrumentType === 'commodity',
        ),
        equities: unavailableQuotes.filter((q) => q.instrumentType === 'equity'),
        errors: [errorItem],
      };

      return { response: failureResponse, httpStatus: statusCode };
    }
  }
}
