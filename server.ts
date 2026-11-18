import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

import { ALL_TRACKED_INSTRUMENTS } from './server/market-data/instruments.ts';
import { MarketDataCacheService } from './server/market-data/cache.ts';
import { createProviderAdapterFromEnv } from './server/market-data/provider.ts';

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
  uid: string,
  email: string,
  emailVerified: boolean,
  idToken: string,
): Promise<boolean> {
  if (!emailVerified) return false;
  if (email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  try {
    const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents/admins/${encodeURIComponent(uid)}`;
    const res = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function clampToMaxWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords - 1).join(' ')}…`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const marketMeta = marketDataService.getSnapshotMetadata();
    res.json({
      ok: true,
      service: 'sakarbazaar',
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

  app.post('/api/editorial/generate-brief', async (req: Request, res: Response) => {
    const clientIp = req.ip || 'local';
    if (isRateLimited(clientIp)) {
      res.status(429).json({ error: 'Too many requests.' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication required for newsroom AI assistance.' });
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
        error: 'Only verified authorized SakarBazaar newsroom editors may invoke AI brief generation.',
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured in server secrets. Configure it in Settings > Secrets to generate AI briefs.',
      });
      return;
    }

    const { sourceMaterial, category, sourceName, sourceUrl } = (req.body || {}) as {
      sourceMaterial?: string;
      category?: string;
      sourceName?: string;
      sourceUrl?: string;
    };

    if (!sourceMaterial || typeof sourceMaterial !== 'string' || sourceMaterial.trim().length < 30) {
      res.status(400).json({
        error: 'Please provide at least 30 characters of editorial source material.',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = [
        'You are the SakarBazaar Indian financial newsroom verification assistant.',
        'Generate a neutral, strictly factual newsroom brief from ONLY the supplied source material.',
        'Rules:',
        '1. Write summaryBrief strictly under 95 words in factual past tense.',
        '2. NEVER invent figures, dates, quotes, subscriptions, GMP quotes, official URLs, or investment recommendations.',
        '3. If numbers or claims come from unverified material, state clearly what awaits official confirmation.',
        '4. Extract concrete entities, keywords for search indexing, and an editor verification checklist.',
        `Category: ${category || 'General'}`,
        `Supplied source attribution: ${sourceName || 'Unspecified'}${sourceUrl ? ` (${sourceUrl})` : ''}`,
        '--- SOURCE MATERIAL START ---',
        sourceMaterial.trim().slice(0, 14000),
        '--- SOURCE MATERIAL END ---',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              summaryBrief: { type: Type.STRING },
              entities: {
                type: Type.OBJECT,
                properties: {
                  companies: { type: Type.ARRAY, items: { type: Type.STRING } },
                  instrumentsAndSymbols: { type: Type.ARRAY, items: { type: Type.STRING } },
                  financialValues: { type: Type.ARRAY, items: { type: Type.STRING } },
                  dates: { type: Type.ARRAY, items: { type: Type.STRING } },
                  regulatorsAndExchanges: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: [
                  'companies',
                  'instrumentsAndSymbols',
                  'financialValues',
                  'dates',
                  'regulatorsAndExchanges',
                ],
              },
              keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              verificationChecklist: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'headline',
              'summaryBrief',
              'entities',
              'keywords',
              'verificationChecklist',
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}') as {
        headline?: string;
        summaryBrief?: string;
        entities?: {
          companies?: string[];
          instrumentsAndSymbols?: string[];
          financialValues?: string[];
          dates?: string[];
          regulatorsAndExchanges?: string[];
        };
        keywords?: string[];
        verificationChecklist?: string[];
      };

      const brief = clampToMaxWords(String(parsed.summaryBrief || ''), 99);
      res.json({
        headline: String(parsed.headline || '').trim(),
        summaryBrief: brief,
        wordCount: countWords(brief),
        entities: {
          companies: parsed.entities?.companies ?? [],
          instrumentsAndSymbols: parsed.entities?.instrumentsAndSymbols ?? [],
          financialValues: parsed.entities?.financialValues ?? [],
          dates: parsed.entities?.dates ?? [],
          regulatorsAndExchanges: parsed.entities?.regulatorsAndExchanges ?? [],
        },
        keywords: (parsed.keywords ?? []).slice(0, 18),
        verificationChecklist: (parsed.verificationChecklist ?? []).slice(0, 8),
        workflowNotice: 'AI brief saved only into draft workspace. Human verification is required before publishing.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate AI editorial brief.';
      res.status(502).json({ error: msg });
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
