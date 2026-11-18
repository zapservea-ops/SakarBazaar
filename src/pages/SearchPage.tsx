import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { CATEGORY_LABELS, IPO_STATUS_LABELS } from '../data/i18n';
import { EXPLAINERS_CATALOG, IPO_ALL_RECORDS } from '../data/sampleData';
import {
  PREDEFINED_SEARCH_TERMS,
  extractSuggestedKeywords,
  searchSiteContent,
} from '../utils/marketFormat';

type SearchTab = 'all' | 'articles' | 'ipos' | 'markets' | 'explainers';
const RECENT_SEARCHES_KEY = 'sb-recent-searches';

function getStoredRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function storeRecentSearch(query: string) {
  const clean = query.trim();
  if (!clean || clean.length < 2) return;
  try {
    const prev = getStoredRecentSearches().filter((t) => t.toLowerCase() !== clean.toLowerCase());
    const next = [clean, ...prev].slice(0, 8);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage issues
  }
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { lang, ui, articlesCatalog, allMarketInstruments, watchlistIds, toggleWatchlist, setSearchTerm } =
    useSakarBazaar();
  const initialQuery = searchParams.get('q') ?? '';
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [tab, setTab] = useState<SearchTab>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>(getStoredRecentSearches);

  useEffect(() => {
    setQueryInput(initialQuery);
    setSearchTerm(initialQuery);
    if (initialQuery.trim()) {
      storeRecentSearch(initialQuery);
      setRecentSearches(getStoredRecentSearches());
    }
  }, [initialQuery, setSearchTerm]);

  useEffect(() => {
    document.title = initialQuery
      ? `"${initialQuery}" · ${ui.searchPageTitle} – SakarBazaar`
      : `${ui.searchPageTitle} – SakarBazaar`;
  }, [initialQuery, ui.searchPageTitle]);

  const suggestedKeywords = useMemo(
    () => extractSuggestedKeywords(articlesCatalog, IPO_ALL_RECORDS, EXPLAINERS_CATALOG, 12),
    [articlesCatalog],
  );

  const results = useMemo(
    () =>
      searchSiteContent(
        queryInput,
        articlesCatalog,
        IPO_ALL_RECORDS,
        EXPLAINERS_CATALOG,
        allMarketInstruments,
      ),
    [queryInput, articlesCatalog, allMarketInstruments],
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = queryInput.trim();
    if (trimmed) {
      storeRecentSearch(trimmed);
      setRecentSearches(getStoredRecentSearches());
    }
    setSearchParams(trimmed ? { q: trimmed } : {});
  }

  function applySuggestion(keyword: string) {
    setQueryInput(keyword);
    setSearchTerm(keyword);
    storeRecentSearch(keyword);
    setRecentSearches(getStoredRecentSearches());
    setSearchParams({ q: keyword });
    setTab('all');
  }

  function clearRecentSearches() {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
      setRecentSearches([]);
    } catch {
      // Ignore
    }
  }

  const totalIndexCount =
    articlesCatalog.length +
    IPO_ALL_RECORDS.length +
    EXPLAINERS_CATALOG.length +
    allMarketInstruments.length;

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/"
        parentLabel={ui.backToMarkets}
        currentLabel={ui.searchPageTitle}
      />

      <div className="sb-page-head">
        <div>
          <h1>{ui.searchPageTitle}</h1>
          <p>{ui.searchPageSubtitle}</p>
        </div>
        <span className="pill sb-pill-muted">{totalIndexCount} indexed financial records</span>
      </div>

      <section className="card snap" style={{ marginBottom: '20px' }}>
        <form onSubmit={handleSubmit} className="sb-search-page-form">
          <input
            type="search"
            value={queryInput}
            onChange={(e) => {
              const val = e.target.value;
              setQueryInput(val);
              setSearchTerm(val);
            }}
            placeholder={ui.searchPlaceholder}
            aria-label={ui.searchPlaceholder}
          />
          <button type="submit" className="btn">
            {ui.searchButton}
          </button>
          {queryInput && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setQueryInput('');
                setSearchTerm('');
                setSearchParams({});
              }}
            >
              {ui.clearSearch}
            </button>
          )}
        </form>

        <div
          className="tabs"
          style={{ marginTop: '14px', marginBottom: 0 }}
          role="tablist"
          aria-label="Search result types"
        >
          <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>
            {ui.tabAll} ({results.totalCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'articles'}
            onClick={() => setTab('articles')}
          >
            {ui.tabArticles} ({results.articles.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === 'ipos'} onClick={() => setTab('ipos')}>
            {ui.tabIpos} ({results.ipos.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'markets'}
            onClick={() => setTab('markets')}
          >
            Markets &amp; Stocks ({results.instruments.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'explainers'}
            onClick={() => setTab('explainers')}
          >
            {ui.tabExplainers} ({results.explainers.length})
          </button>
        </div>
      </section>

      {!queryInput.trim() ? (
        <div style={{ display: 'grid', gap: '20px' }}>
          {recentSearches.length > 0 && (
            <div className="card" style={{ padding: '20px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <h2 style={{ font: '700 18px var(--serif)', margin: 0 }}>Recent Searches</h2>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ fontSize: '13px', padding: '4px 10px' }}
                  onClick={clearRecentSearches}
                >
                  Clear recent searches
                </button>
              </div>
              <div className="sb-keyword-chips">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    type="button"
                    className="btn ghost"
                    onClick={() => applySuggestion(term)}
                  >
                    🕒 {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ padding: '24px' }}>
            <h2 style={{ font: '700 20px var(--serif)', margin: '0 0 8px' }}>
              {ui.popularSearchesLabel}
            </h2>
            <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: '14px' }}>
              Explore editorial dispatches, primary market IPO dossiers, listed equity
              profiles, and educational explainers:
            </p>
            <div className="sb-keyword-chips">
              {PREDEFINED_SEARCH_TERMS.map((term) => (
                <button
                  key={term}
                  type="button"
                  className="btn ghost"
                  onClick={() => applySuggestion(term)}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : results.totalCount === 0 ? (
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ font: '700 22px var(--serif)', margin: '0 0 8px' }}>
            {ui.noResultsTitle}
          </h2>
          <p style={{ margin: '0 0 14px', color: 'var(--muted)' }}>
            No records matched <strong>"{queryInput}"</strong>. Try checking spelling,
            broadening terms, or choosing a suggestion below:
          </p>
          <div className="sb-keyword-chips">
            {PREDEFINED_SEARCH_TERMS.slice(0, 10).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="btn ghost"
                onClick={() => applySuggestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '18px' }}>
          {(tab === 'all' || tab === 'markets') && results.instruments.length > 0 && (
            <section className="card snap">
              <div className="sec-h">
                <h2>Markets &amp; Tracked Equities ({results.instruments.length})</h2>
                <Link to="/markets" style={{ color: 'var(--teal)', fontWeight: 600 }}>
                  View All Markets →
                </Link>
              </div>
              {results.instruments.map((inst) => {
                const isTracked = watchlistIds.has(inst.id);
                return (
                  <div className="sb-search-result-row" key={inst.id}>
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          marginBottom: '4px',
                        }}
                      >
                        <span className="pill">{inst.exchange}</span>
                        <span className="pill sb-pill-muted">{inst.instrumentType.toUpperCase()}</span>
                      </div>
                      <strong style={{ fontSize: '16px', display: 'block' }}>
                        {inst.instrumentName} ({inst.symbol})
                      </strong>
                      <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--muted)' }}>
                        {inst.note ??
                          `${inst.exchange} official instrument · Quoted in ${inst.currency}`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Link to="/markets" className="btn ghost">
                        Market Overview →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {(tab === 'all' || tab === 'articles') && results.articles.length > 0 && (
            <section className="card snap">
              <div className="sec-h">
                <h2>
                  {ui.tabArticles} ({results.articles.length})
                </h2>
              </div>
              {results.articles.map((article) => (
                <div className="sb-search-result-row" key={article.id}>
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        marginBottom: '4px',
                      }}
                    >
                      <span className="cat">{CATEGORY_LABELS[lang][article.category]}</span>
                    </div>
                    <Link
                      to={`/article/${article.slug}`}
                      style={{ display: 'block', fontWeight: 600 }}
                    >
                      {lang === 'hi' && article.headlineHi ? article.headlineHi : article.headline}
                    </Link>
                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--muted)' }}>
                      {lang === 'hi' && article.deckHi ? article.deckHi : article.deck}
                    </p>
                  </div>
                  <span className="meta" style={{ whiteSpace: 'nowrap' }}>
                    {article.readTime}
                  </span>
                </div>
              ))}
            </section>
          )}

          {(tab === 'all' || tab === 'ipos') && results.ipos.length > 0 && (
            <section className="card snap">
              <div className="sec-h">
                <h2>
                  {ui.tabIpos} ({results.ipos.length})
                </h2>
              </div>
              {results.ipos.map((ipo) => (
                <div className="sb-search-result-row" key={ipo.id}>
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        marginBottom: '4px',
                      }}
                    >
                      <span className="cat">{ipo.segment}</span>
                      {ipo.status !== 'Awaiting Verification' && (
                        <span className="pill" style={{ fontSize: '11px' }}>
                          {IPO_STATUS_LABELS[lang][ipo.status]}
                        </span>
                      )}
                    </div>
                    <Link to={`/ipo/${ipo.slug}`} style={{ display: 'block', fontWeight: 600 }}>
                      {ipo.company}
                    </Link>
                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--muted)' }}>
                      {ipo.priceBand ?? 'Price band TBD'} · {ipo.issueSize ?? 'Size TBD'} ·{' '}
                      {ipo.offerType ?? 'TBD'}
                    </p>
                  </div>
                  <Link to={`/ipo/${ipo.slug}`} className="btn ghost">
                    {ui.detailsLink}
                  </Link>
                </div>
              ))}
            </section>
          )}

          {(tab === 'all' || tab === 'explainers') && results.explainers.length > 0 && (
            <section className="card snap">
              <div className="sec-h">
                <h2>
                  {ui.tabExplainers} ({results.explainers.length})
                </h2>
              </div>
              {results.explainers.map((exp) => (
                <div className="sb-search-result-row" key={exp.id}>
                  <div>
                    <span className="cat">{lang === 'hi' ? exp.tagHi : exp.tag}</span>
                    <Link
                      to={`/explainers/${exp.slug}`}
                      style={{ display: 'block', fontWeight: 600 }}
                    >
                      {lang === 'hi' && exp.titleHi ? exp.titleHi : exp.title}
                    </Link>
                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--muted)' }}>
                      {lang === 'hi' ? exp.summaryHi : exp.summary}
                    </p>
                  </div>
                  <span className="meta" style={{ whiteSpace: 'nowrap' }}>
                    {exp.readTime}
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
