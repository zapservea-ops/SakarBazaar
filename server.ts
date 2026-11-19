import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { type Request, type Response } from 'express';

import { ALL_TRACKED_INSTRUMENTS } from './server/market-data/instruments.ts';
import { MarketDataCacheService } from './server/market-data/cache.ts';
import { createProviderAdapterFromEnv } from './server/market-data/provider.ts';
import { checkOfficialIpoSources } from './server/ipo-sources/collector.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const BOOTSTRAPPED_ADMIN_EMAIL = 'jeetsheetalpuri@gmail.com';

interface FirebaseClientConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

function loadFirebaseConfig(): FirebaseClientConfig {
  const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
  const raw = fs.readFileSync(cfgPath, 'utf8');
  return JSON.parse(raw) as FirebaseClientConfig;
}

const firebaseConfig = loadFirebaseConfig();

const customHolidays = (process.env.MARKET_DATA_HOLIDAYS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const { adapter: marketAdapter, config: marketEnvConfig } = createProviderAdapterFromEnv();
const marketConfigValidation = marketAdapter.validateConfig();

if (marketEnvConfig.providerId !== 'unconfigured' && !marketConfigValidation.valid) {
  console.warn(
    JSON.stringify({
      event: 'market_provider_config_warning',
      provider: marketEnvConfig.providerId,
      missingKeys: marketConfigValidation.missingKeys,
      message: marketConfigValidation.error,
    }),
  );
}

const marketDataService = new MarketDataCacheService({
  adapter: marketAdapter,
  config: marketEnvConfig,
  instruments: ALL_TRACKED_INSTRUMENTS,
  customHolidays,
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const ipRequestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (ipRequestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    ipRequestLog.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  ipRequestLog.set(ip, timestamps);
  return false;
}

async function verifyFirebaseIdToken(
  idToken: string,
): Promise<{ uid: string; email: string; emailVerified: boolean } | null> {
  if (!idToken || !firebaseConfig.apiKey) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId || !user?.email) return null;
    return {
      uid: user.localId,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
    };
  } catch {
    return null;
  }
}

async function isAuthorizedNewsroomEditor(
  _uid: string,
  email: string,
  emailVerified: boolean,
  idToken: string,
): Promise<boolean> {
  if (!emailVerified) return false;
  if (email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  try {
    const emailKey = email.trim().toLowerCase();
    const allowlistUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents/authorizedEmails/${encodeURIComponent(emailKey)}`;
    const allowRes = await fetch(allowlistUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!allowRes.ok) {
      return false;
    }
    const allowDoc = (await allowRes.json()) as {
      fields?: {
        active?: { booleanValue?: boolean };
        role?: { stringValue?: string };
      };
    };
    const isActive = allowDoc.fields?.active?.booleanValue === true;
    const role = (allowDoc.fields?.role?.stringValue || '').toLowerCase();
    return isActive && (role === 'owner' || role === 'publisher');
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const marketMeta = marketDataService.getSnapshotMetadata();
    res.json({
      ok: true,
      service: 'sakarbazaar',
      serverTimeMs: Date.now(),
      marketData: marketMeta,
    });
  });

  app.get('/api/market-data', async (req: Request, res: Response) => {
    const clientIp = req.ip || 'local';
    if (isRateLimited(clientIp)) {
      res.status(429).json({
        error: 'Rate limit exceeded. Please wait before refreshing market data.',
      });
      return;
    }

    try {
      const { response, httpStatus } = await marketDataService.getMarketData();
      res.setHeader('Cache-Control', 'no-store');
      res.status(httpStatus).json(response);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unexpected market-data server error.',
      });
    }
  });

  app.post('/api/ipo-sources/check', async (req: Request, res: Response) => {
    const clientIp = req.ip || 'local';
    if (isRateLimited(clientIp)) {
      res.status(429).json({ error: 'Too many requests. Please wait before re-checking sources.' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication required for IPO source verification.' });
      return;
    }

    const verifiedUser = await verifyFirebaseIdToken(token);
    if (!verifiedUser) {
      res.status(401).json({ error: 'Invalid or expired Firebase authentication token.' });
      return;
    }

    const allowed = await isAuthorizedNewsroomEditor(
      verifiedUser.uid,
      verifiedUser.email,
      verifiedUser.emailVerified,
      token,
    );
    if (!allowed) {
      res.status(403).json({
        error: 'Only authorized Owner or Publisher accounts may trigger official IPO source checks.',
      });
      return;
    }

    try {
      const forceRefresh = Boolean((req.body as { forceRefresh?: boolean } | undefined)?.forceRefresh);
      const result = await checkOfficialIpoSources({ forceRefresh });
      res.setHeader('Cache-Control', 'no-store');
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to check official IPO portals.',
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SakarBazaar server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SakarBazaar server:', err);
  process.exit(1);
});
