import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { UI_COPY, type UiDictionary } from '../data/i18n';
import {
  ARTICLES_CATALOG,
  CURATED_INDIAN_EQUITIES,
  IPO_ALL_RECORDS,
  MARKET_INSTRUMENTS,
  TRANSLATIONS,
} from '../data/sampleData';
import {
  auth,
  checkEditorAuthorization,
  fetchPublicLegacyOverridesWithStatus,
  fetchPublishedEditorialArticlesWithStatus,
  fetchPublicVerifiedIposWithStatus,
  refreshFirebaseSession,
  signInWithGoogle,
  signOutUser,
} from '../lib/firebase';
import type {
  AdminRole,
  ArticleRecord,
  IpoRow,
  LanguageCode,
  LegacyOverridesRecord,
  MarketDataResponse,
  MarketInstrument,
  NewsItem,
  PublicDataDiagnostics,
  ThemeMode,
  TranslationStrings,
} from '../types/sakarbazaar';
import {
  getPermissionsForRole,
  type AdminPermissionMatrix,
} from '../utils/adminPermissions';
import { filterPublicArticlesWithOverrides } from '../utils/historicalNews';
import { getIstMarketStatus } from '../utils/marketFormat';
import {
  MarketAutoRefreshController,
  markClientMarketDataStale,
  resolveFrontendRefreshIntervalMs,
} from '../utils/marketPolling';

const THEME_KEY = 'sb-theme';
const LANG_KEY = 'sb-lang';
const BOOKMARKS_KEY = 'sb-bookmarks';
const WATCHLIST_KEY = 'sb-watchlist';

function readInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore storage errors
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function readInitialLang(): LanguageCode {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'hi') return saved;
  } catch {
    // Ignore storage errors
  }
  return 'en';
}

function readStoredSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(
          parsed.filter((item): item is string => typeof item === 'string' && item.length > 0),
        );
      }
    }
  } catch {
    // Ignore parse errors
  }
  return new Set();
}

function buildFallbackMarketData(): MarketDataResponse {
  const indices = MARKET_INSTRUMENTS.filter((m) => m.instrumentType === 'index');
  const indicators = MARKET_INSTRUMENTS.filter((m) => m.instrumentType !== 'index');
  const equities = CURATED_INDIAN_EQUITIES;
  return {
    status: 'unavailable',
    providerConfigured: false,
    provider: 'None configured',
    asOf: null,
    retrievedAt: new Date().toISOString(),
    refreshIntervalSeconds: 60,
    marketStatus: 'closed',
    isDelayed: false,
    message: 'Market data currently unavailable. No authorized provider configured.',
    quotes: [...indices, ...indicators, ...equities],
    indices,
    indicators,
    equities,
    errors: [],
  };
}

export interface SessionRefreshResult {
  ok: boolean;
  status: 'refreshed' | 'revoked' | 'expired' | 'unauthenticated' | 'error';
  message: string;
  role: AdminRole;
}

interface SakarBazaarContextValue {
  theme: ThemeMode;
  lang: LanguageCode;
  copy: TranslationStrings;
  ui: UiDictionary;
  ist: ReturnType<typeof getIstMarketStatus>;
  bookmarks: Set<string>;
  watchlistIds: Set<string>;
  searchTerm: string;
  mobileSearchOpen: boolean;
  desktopSearchRef: RefObject<HTMLInputElement | null>;
  mobileSearchRef: RefObject<HTMLInputElement | null>;
  articlesCatalog: ArticleRecord[];
  newsItems: NewsItem[];
  ipoRecords: IpoRow[];
  publicDataDiagnostics: PublicDataDiagnostics;
  marketData: MarketDataResponse;
  marketLoading: boolean;
  marketError: string | null;
  allMarketInstruments: MarketInstrument[];
  user: User | null;
  authReady: boolean;
  isAuthorizedEditor: boolean;
  editorRole: 'admin' | 'editor' | 'none';
  adminRole: AdminRole;
  permissions: AdminPermissionMatrix;
  toggleTheme: () => void;
  toggleLang: () => void;
  toggleBookmark: (key: string) => void;
  toggleWatchlist: (id: string) => void;
  setSearchTerm: (value: string) => void;
  setMobileSearchOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  refreshArticles: () => Promise<void>;
  refreshIpos: () => Promise<void>;
  refreshMarketData: () => Promise<void>;
  refreshAuthSession: () => Promise<SessionRefreshResult>;
  signInEditor: () => Promise<void>;
  signOutEditor: () => Promise<void>;
}

const SakarBazaarContext = createContext<SakarBazaarContextValue | null>(null);

export function SakarBazaarProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);
  const [lang, setLang] = useState<LanguageCode>(readInitialLang);
  const [now, setNow] = useState<Date>(() => new Date());
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => readStoredSet(BOOKMARKS_KEY));
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(() => readStoredSet(WATCHLIST_KEY));
  const [searchTerm, setSearchTerm] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const [publishedRemoteArticles, setPublishedRemoteArticles] = useState<ArticleRecord[]>([]);
  const [legacyOverrides, setLegacyOverrides] = useState<LegacyOverridesRecord | null>(null);
  const [remoteVerifiedIpos, setRemoteVerifiedIpos] = useState<IpoRow[]>([]);
  const [publicDataDiagnostics, setPublicDataDiagnostics] = useState<PublicDataDiagnostics>({
    articlesOk: true,
    overridesOk: true,
    iposOk: true,
    message: null,
  });
  const [marketData, setMarketData] = useState<MarketDataResponse>(buildFallbackMarketData);
  const [marketLoading, setMarketLoading] = useState<boolean>(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthorizedEditor, setIsAuthorizedEditor] = useState(false);
  const [editorRole, setEditorRole] = useState<'admin' | 'editor' | 'none'>('none');
  const [adminRole, setAdminRole] = useState<AdminRole>('none');

  const desktopSearchRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const marketControllerRef = useRef<MarketAutoRefreshController | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Ignore storage errors
    }
  }, [lang]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...bookmarks]));
    } catch {
      // Ignore storage errors
    }
  }, [bookmarks]);

  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...watchlistIds]));
    } catch {
      // Ignore storage errors
    }
  }, [watchlistIds]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const isMobile = window.matchMedia('(max-width: 960px)').matches;
        if (isMobile) {
          setMobileSearchOpen(true);
          window.setTimeout(() => mobileSearchRef.current?.focus(), 20);
        } else {
          desktopSearchRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const refreshIntervalMs = resolveFrontendRefreshIntervalMs(
      import.meta.env.VITE_MARKET_REFRESH_SECONDS,
    );

    const controller = new MarketAutoRefreshController({
      refreshIntervalMs,
      fetchMarketData: async (signal: AbortSignal) => {
        const res = await fetch('/api/market-data', { signal, cache: 'no-store' });
        if (!res.ok) {
          let errMsg = `Market data request returned HTTP ${res.status}.`;
          try {
            const errBody = (await res.json()) as { error?: string; message?: string };
            if (errBody.error || errBody.message) {
              errMsg = errBody.error || errBody.message || errMsg;
            }
          } catch {
            // Keep HTTP status message
          }
          throw new Error(errMsg);
        }
        return (await res.json()) as MarketDataResponse;
      },
      onLoadingChange: (loading) => setMarketLoading(loading),
      onDataSuccess: (data) => {
        setMarketError(null);
        setMarketData(data);
      },
      onDataError: (errorMessage) => {
        setMarketError(errorMessage);
        setMarketData((prev) => markClientMarketDataStale(prev, errorMessage));
      },
    });

    marketControllerRef.current = controller;
    void controller.start();

    const onVisibilityChange = () => {
      void controller.handleVisibilityChange();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      controller.stop();
      marketControllerRef.current = null;
    };
  }, []);

  const refreshMarketData = useCallback(async () => {
    if (marketControllerRef.current) {
      await marketControllerRef.current.refresh({ force: true });
    }
  }, []);

  const refreshArticles = useCallback(async () => {
    const [remoteRes, overridesRes] = await Promise.all([
      fetchPublishedEditorialArticlesWithStatus(),
      fetchPublicLegacyOverridesWithStatus(),
    ]);
    setPublishedRemoteArticles(remoteRes.items);
    setLegacyOverrides(overridesRes.overrides);
    setPublicDataDiagnostics((prev) => {
      const nextMsg =
        remoteRes.errorMessage ||
        overridesRes.errorMessage ||
        (!prev.iposOk ? prev.message : null);
      return {
        articlesOk: remoteRes.ok,
        overridesOk: overridesRes.ok,
        iposOk: prev.iposOk,
        message: nextMsg,
      };
    });
  }, []);

  const refreshIpos = useCallback(async () => {
    const remoteIposRes = await fetchPublicVerifiedIposWithStatus();
    setRemoteVerifiedIpos(remoteIposRes.items);
    setPublicDataDiagnostics((prev) => {
      const nextMsg =
        !prev.articlesOk || !prev.overridesOk
          ? prev.message
          : remoteIposRes.errorMessage;
      return {
        articlesOk: prev.articlesOk,
        overridesOk: prev.overridesOk,
        iposOk: remoteIposRes.ok,
        message: nextMsg,
      };
    });
  }, []);

  useEffect(() => {
    void refreshArticles();
    void refreshIpos();
  }, [refreshArticles, refreshIpos]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      const authStatus = await checkEditorAuthorization(nextUser);
      setIsAuthorizedEditor(authStatus.authorized);
      setEditorRole(authStatus.role);
      setAdminRole(authStatus.adminRole);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const currentMinuteMs = Math.floor(now.getTime() / 60_000) * 60_000;

  const articlesCatalog = useMemo(
    () =>
      filterPublicArticlesWithOverrides(
        publishedRemoteArticles,
        ARTICLES_CATALOG,
        legacyOverrides,
        currentMinuteMs,
      ),
    [publishedRemoteArticles, legacyOverrides, currentMinuteMs],
  );

  const ipoRecords = useMemo(() => {
    const seenSlugs = new Set<string>();
    const merged: IpoRow[] = [];
    for (const remote of remoteVerifiedIpos) {
      if (!seenSlugs.has(remote.slug)) {
        seenSlugs.add(remote.slug);
        merged.push(remote);
      }
    }
    for (const base of IPO_ALL_RECORDS) {
      if (!seenSlugs.has(base.slug)) {
        seenSlugs.add(base.slug);
        merged.push(base);
      }
    }
    return merged;
  }, [remoteVerifiedIpos]);

  const newsItems: NewsItem[] = useMemo(
    () =>
      articlesCatalog
        .filter((article) => article.isHomepageFeed !== false)
        .map((article) => ({
          id: article.id,
          slug: article.slug,
          time: article.time,
          category: article.category,
          subCategory: article.subCategory,
          headline: article.headline,
          headlineHi: article.headlineHi,
          ticker: article.ticker,
          sourceNote: article.sourceNote,
          verificationStatus: article.verificationStatus,
          summary: article.deck,
          summaryHi: article.deckHi,
          paragraphs: article.sections.flatMap((sec) => sec.paragraphs),
          media: article.media,
          isPaid: article.isPaid,
          paidDisclosureLabel: article.paidDisclosureLabel,
        })),
    [articlesCatalog],
  );

  const allMarketInstruments = useMemo(
    () => [...marketData.indices, ...marketData.indicators, ...marketData.equities],
    [marketData],
  );

  const permissions = useMemo(() => getPermissionsForRole(adminRole), [adminRole]);

  const copy = TRANSLATIONS[lang];
  const ui = UI_COPY[lang];
  const ist = useMemo(() => getIstMarketStatus(now, lang), [now, lang]);

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  function toggleLang() {
    setLang((prev) => (prev === 'en' ? 'hi' : 'en'));
  }

  function toggleBookmark(key: string) {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleWatchlist(id: string) {
    setWatchlistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function signInEditor() {
    const loggedIn = await signInWithGoogle();
    const authStatus = await checkEditorAuthorization(loggedIn);
    setUser(loggedIn);
    setIsAuthorizedEditor(authStatus.authorized);
    setEditorRole(authStatus.role);
    setAdminRole(authStatus.adminRole);
  }

  async function refreshAuthSession(): Promise<SessionRefreshResult> {
    try {
      const tokenOutcome = await refreshFirebaseSession();
      if (!tokenOutcome.ok) {
        if (tokenOutcome.reason === 'expired' || tokenOutcome.reason === 'disabled') {
          try {
            await signOutUser();
          } catch {
            // Best effort sign-out when token expired or user disabled
          }
          setUser(null);
          setIsAuthorizedEditor(false);
          setEditorRole('none');
          setAdminRole('none');
          return {
            ok: false,
            status: 'expired',
            message: tokenOutcome.message || 'Session expired. Please sign in again.',
            role: 'none',
          };
        }
        if (tokenOutcome.reason === 'unauthenticated') {
          setUser(null);
          setIsAuthorizedEditor(false);
          setEditorRole('none');
          setAdminRole('none');
          return {
            ok: false,
            status: 'unauthenticated',
            message: tokenOutcome.message || 'No active Google sign-in session.',
            role: 'none',
          };
        }
        return {
          ok: false,
          status: 'error',
          message: tokenOutcome.message || 'Failed to refresh authentication session.',
          role: adminRole,
        };
      }

      const current = auth.currentUser;
      const authStatus = await checkEditorAuthorization(current);
      setUser(current);
      setIsAuthorizedEditor(authStatus.authorized);
      setEditorRole(authStatus.role);
      setAdminRole(authStatus.adminRole);

      if (!authStatus.authorized || authStatus.adminRole === 'none') {
        return {
          ok: false,
          status: 'revoked',
          message: `Access is not active or has been revoked for ${current?.email || 'this account'}.`,
          role: 'none',
        };
      }

      return {
        ok: true,
        status: 'refreshed',
        message: `Session token and ${authStatus.adminRole === 'owner' ? 'Owner' : 'Publisher'} permissions refreshed.`,
        role: authStatus.adminRole,
      };
    } catch (err) {
      return {
        ok: false,
        status: 'error',
        message: err instanceof Error ? err.message : 'Unable to refresh authentication session.',
        role: adminRole,
      };
    }
  }

  async function signOutEditor() {
    await signOutUser();
    setUser(null);
    setIsAuthorizedEditor(false);
    setEditorRole('none');
    setAdminRole('none');
  }

  return (
    <SakarBazaarContext.Provider
      value={{
        theme,
        lang,
        copy,
        ui,
        ist,
        bookmarks,
        watchlistIds,
        searchTerm,
        mobileSearchOpen,
        desktopSearchRef,
        mobileSearchRef,
        articlesCatalog,
        newsItems,
        ipoRecords,
        publicDataDiagnostics,
        marketData,
        marketLoading,
        marketError,
        allMarketInstruments,
        user,
        authReady,
        isAuthorizedEditor,
        editorRole,
        adminRole,
        permissions,
        toggleTheme,
        toggleLang,
        toggleBookmark,
        toggleWatchlist,
        setSearchTerm,
        setMobileSearchOpen,
        refreshArticles,
        refreshIpos,
        refreshMarketData,
        refreshAuthSession,
        signInEditor,
        signOutEditor,
      }}
    >
      {children}
    </SakarBazaarContext.Provider>
  );
}

export function useSakarBazaar() {
  const ctx = useContext(SakarBazaarContext);
  if (!ctx) {
    throw new Error('useSakarBazaar must be used within SakarBazaarProvider');
  }
  return ctx;
}
