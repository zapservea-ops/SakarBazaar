import { resolveProviderSymbol } from './instruments.ts';
import type {
  InstrumentDefinition,
  MarketProviderAdapter,
  ProviderEnvironmentConfig,
  ProviderFetchResult,
  RawProviderQuoteInput,
} from './types.ts';

export class ProviderRequestError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: {
      code: string;
      statusCode: number;
      retryable: boolean;
      retryAfterMs?: number;
    },
  ) {
    super(message);
    this.name = 'ProviderRequestError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function sanitizeSecretString(text: string, secrets: Array<string | undefined>): string {
  let clean = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      clean = clean.split(secret).join('[REDACTED]');
    }
  }
  return clean;
}

export function readProviderEnvConfig(
  env: Record<string, string | undefined> = process.env,
): ProviderEnvironmentConfig {
  const refreshRaw = Number(env.MARKET_DATA_REFRESH_SECONDS ?? 60);
  const staleRaw = Number(env.MARKET_DATA_MAX_STALE_SECONDS ?? 300);
  const timeoutRaw = Number(env.MARKET_DATA_TIMEOUT_MS ?? 8000);
  const delayRaw = env.MARKET_DATA_DELAY_MINUTES ? Number(env.MARKET_DATA_DELAY_MINUTES) : null;

  return {
    providerId: (env.MARKET_DATA_PROVIDER || 'unconfigured').trim().toLowerCase(),
    apiKey: env.MARKET_DATA_API_KEY?.trim() || undefined,
    apiSecret: env.MARKET_DATA_API_SECRET?.trim() || undefined,
    baseUrl: env.MARKET_DATA_BASE_URL?.trim() || env.MARKET_DATA_FEED_URL?.trim() || undefined,
    refreshIntervalSeconds:
      Number.isFinite(refreshRaw) && refreshRaw >= 15 ? Math.floor(refreshRaw) : 60,
    maxStaleAgeSeconds: Number.isFinite(staleRaw) && staleRaw >= 60 ? Math.floor(staleRaw) : 300,
    requestTimeoutMs:
      Number.isFinite(timeoutRaw) && timeoutRaw >= 1000 ? Math.floor(timeoutRaw) : 8000,
    isDelayedFeed: env.MARKET_DATA_IS_DELAYED !== 'false',
    delayMinutes: delayRaw !== null && Number.isFinite(delayRaw) && delayRaw >= 0 ? delayRaw : 15,
  };
}

export class UnconfiguredProviderAdapter implements MarketProviderAdapter {
  readonly id = 'unconfigured';
  readonly displayName = 'None configured';

  isConfigured(): boolean {
    return false;
  }

  validateConfig() {
    return {
      valid: false,
      missingKeys: ['MARKET_DATA_PROVIDER', 'MARKET_DATA_BASE_URL', 'MARKET_DATA_API_KEY'],
      error: 'No authorized commercial Indian market-data provider configured.',
    };
  }

  async fetchQuotes(): Promise<ProviderFetchResult> {
    return {
      providerName: this.displayName,
      configured: false,
      isDelayed: false,
      delayMinutes: null,
      rawQuotes: [],
      errors: [],
    };
  }
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      const isLast = attempt >= options.maxRetries;
      const retryable = err instanceof ProviderRequestError ? err.retryable : false;
      if (isLast || !retryable) {
        throw err;
      }
      const backoffMs =
        err instanceof ProviderRequestError && err.retryAfterMs
          ? Math.min(err.retryAfterMs, 5000)
          : options.baseDelayMs * Math.pow(2, attempt);
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

/**
 * Provider-independent HTTP JSON adapter for authorized commercial market-data feeds
 * (such as licensed NSE Data & Analytics, BSE Data Products, TrueData, or GlobalDatafeeds).
 */
export class LicensedJsonProviderAdapter implements MarketProviderAdapter {
  readonly id: string;
  readonly displayName: string;
  private readonly config: ProviderEnvironmentConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(
    config: ProviderEnvironmentConfig,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.config = config;
    this.id = config.providerId || 'licensed_json';
    this.displayName = `Licensed Feed (${this.id})`;
    this.fetchImpl = fetchImpl;
  }

  isConfigured(): boolean {
    return Boolean(this.config.baseUrl && this.config.apiKey);
  }

  validateConfig(): { valid: boolean; missingKeys: string[]; error?: string } {
    const missing: string[] = [];
    if (!this.config.baseUrl) missing.push('MARKET_DATA_BASE_URL');
    if (!this.config.apiKey) missing.push('MARKET_DATA_API_KEY');
    if (missing.length > 0) {
      return {
        valid: false,
        missingKeys: missing,
        error: `Missing required environment variables: ${missing.join(', ')}`,
      };
    }
    try {
      const parsed = new URL(this.config.baseUrl!);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return {
          valid: false,
          missingKeys: [],
          error: 'MARKET_DATA_BASE_URL must use http:// or https://',
        };
      }
    } catch {
      return {
        valid: false,
        missingKeys: [],
        error: 'MARKET_DATA_BASE_URL is not a valid URL',
      };
    }
    return { valid: true, missingKeys: [] };
  }

  async fetchQuotes(
    instruments: InstrumentDefinition[],
    outerSignal?: AbortSignal,
  ): Promise<ProviderFetchResult> {
    const validation = this.validateConfig();
    if (!validation.valid) {
      return {
        providerName: this.displayName,
        configured: false,
        isDelayed: this.config.isDelayedFeed,
        delayMinutes: this.config.delayMinutes,
        rawQuotes: [],
        errors: [
          {
            code: 'PROVIDER_MISCONFIGURED',
            message: validation.error || 'Provider configuration incomplete.',
            at: new Date().toISOString(),
          },
        ],
      };
    }

    const endpoint = new URL(this.config.baseUrl!);
    const symbols = instruments.map((inst) => resolveProviderSymbol(inst, this.id));
    endpoint.searchParams.set('symbols', symbols.join(','));

    return executeWithRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
        const onOuterAbort = () => controller.abort();
        outerSignal?.addEventListener('abort', onOuterAbort, { once: true });

        try {
          const headers: Record<string, string> = {
            Accept: 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          };
          if (this.config.apiSecret) {
            headers['X-Api-Secret'] = this.config.apiSecret;
          }

          const res = await this.fetchImpl(endpoint.toString(), {
            method: 'GET',
            headers,
            signal: controller.signal,
          });

          if (res.status === 429) {
            const retryAfterHeader = res.headers.get('retry-after');
            const retrySec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
            throw new ProviderRequestError('Provider rate limit exceeded (HTTP 429).', {
              code: 'PROVIDER_RATE_LIMITED',
              statusCode: 429,
              retryable: true,
              retryAfterMs: Number.isFinite(retrySec) ? retrySec * 1000 : 1500,
            });
          }

          if (res.status >= 500) {
            throw new ProviderRequestError(`Provider upstream error (HTTP ${res.status}).`, {
              code: 'PROVIDER_UPSTREAM_ERROR',
              statusCode: 502,
              retryable: true,
            });
          }

          if (!res.ok) {
            throw new ProviderRequestError(`Provider rejected request (HTTP ${res.status}).`, {
              code: 'PROVIDER_HTTP_ERROR',
              statusCode: res.status === 401 || res.status === 403 ? 502 : res.status,
              retryable: false,
            });
          }

          const payload = (await res.json()) as {
            provider?: string;
            isDelayed?: boolean;
            delayMinutes?: number;
            quotes?: RawProviderQuoteInput[];
            data?: RawProviderQuoteInput[];
          };

          const rawQuotes = Array.isArray(payload.quotes)
            ? payload.quotes
            : Array.isArray(payload.data)
              ? payload.data
              : [];

          return {
            providerName: payload.provider || this.displayName,
            configured: true,
            isDelayed:
              typeof payload.isDelayed === 'boolean'
                ? payload.isDelayed
                : this.config.isDelayedFeed,
            delayMinutes: payload.delayMinutes ?? this.config.delayMinutes,
            rawQuotes,
            errors: [],
          };
        } catch (err) {
          if (err instanceof ProviderRequestError) throw err;
          if ((err as { name?: string })?.name === 'AbortError') {
            throw new ProviderRequestError('Provider request timed out.', {
              code: 'PROVIDER_TIMEOUT',
              statusCode: 504,
              retryable: true,
            });
          }
          const rawMsg = err instanceof Error ? err.message : 'Network error reaching provider.';
          throw new ProviderRequestError(
            sanitizeSecretString(rawMsg, [this.config.apiKey, this.config.apiSecret]),
            {
              code: 'PROVIDER_NETWORK_ERROR',
              statusCode: 502,
              retryable: true,
            },
          );
        } finally {
          clearTimeout(timeoutId);
          outerSignal?.removeEventListener('abort', onOuterAbort);
        }
      },
      { maxRetries: 2, baseDelayMs: 250 },
    );
  }
}

export function createProviderAdapterFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): { adapter: MarketProviderAdapter; config: ProviderEnvironmentConfig } {
  const config = readProviderEnvConfig(env);
  if (!config.providerId || config.providerId === 'unconfigured' || !config.baseUrl || !config.apiKey) {
    return {
      adapter: new UnconfiguredProviderAdapter(),
      config,
    };
  }
  return {
    adapter: new LicensedJsonProviderAdapter(config, fetchImpl),
    config,
  };
}
