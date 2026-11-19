import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArticleMediaThumb } from '../components/ArticleMediaThumb';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { CATEGORY_LABELS } from '../data/i18n';
import { ALL_NEWS_CATEGORIES } from '../data/sampleData';
import type { NewsCategory } from '../types/sakarbazaar';
import { hasVideoMedia } from '../utils/articleMedia';
import { filterArticlesByCategory } from '../utils/marketFormat';

function resolveCategoryParam(rawParam?: string): NewsCategory {
  if (!rawParam) return 'All';
  const decoded = decodeURIComponent(rawParam).toLowerCase();
  const match = ALL_NEWS_CATEGORIES.find((cat) => cat.toLowerCase() === decoded);
  return match ?? 'All';
}

export function NewsListPage() {
  const { category: routeCategoryParam } = useParams();
  const navigate = useNavigate();
  const {
    lang,
    ui,
    articlesCatalog,
    publicDataDiagnostics,
    bookmarks,
    searchTerm,
    setSearchTerm,
    toggleBookmark,
  } = useSakarBazaar();

  const activeCategory = resolveCategoryParam(routeCategoryParam);
  const [shownCount, setShownCount] = useState(8);

  useEffect(() => {
    const label = CATEGORY_LABELS[lang][activeCategory];
    document.title =
      activeCategory === 'All'
        ? `${ui.newsPageTitle} – SakarBazaar`
        : `${label} · ${ui.newsPageTitle} – SakarBazaar`;
    setShownCount(8);
  }, [activeCategory, lang, ui.newsPageTitle]);

  const filtered = filterArticlesByCategory(articlesCatalog, activeCategory, searchTerm);
  const visible = filtered.slice(0, shownCount);
  const canLoadMore = shownCount < filtered.length;

  function handleSelectCategory(cat: NewsCategory) {
    if (cat === 'All') {
      navigate('/news');
    } else {
      navigate(`/news/${encodeURIComponent(cat)}`);
    }
  }

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/"
        parentLabel={ui.backToMarkets}
        currentLabel={
          activeCategory === 'All' ? ui.newsPageTitle : CATEGORY_LABELS[lang][activeCategory]
        }
        grandparentPath={activeCategory !== 'All' ? '/news' : undefined}
        grandparentLabel={activeCategory !== 'All' ? ui.newsPageTitle : undefined}
      />

      <div className="sb-page-head">
        <div>
          <h1>
            {activeCategory === 'All'
              ? ui.newsPageTitle
              : `${CATEGORY_LABELS[lang][activeCategory]} · ${ui.newsPageTitle}`}
          </h1>
          <p>{ui.newsPageSubtitle}</p>
        </div>
        <Link to="/admin" className="btn ghost">
          Editorial Desk →
        </Link>
      </div>

      {(!publicDataDiagnostics.articlesOk || !publicDataDiagnostics.overridesOk) &&
        publicDataDiagnostics.message && (
          <div
            className="sb-note-box"
            role="status"
            style={{ marginBottom: '14px', borderColor: 'var(--down)' }}
          >
            <strong>Live Feed Notice:</strong> {publicDataDiagnostics.message}
          </div>
        )}

      <section className="card feed" style={{ marginTop: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '14px',
          }}
        >
          <div className="tabs" role="tablist" aria-label="News categories" style={{ margin: 0 }}>
            {ALL_NEWS_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat}
                onClick={() => handleSelectCategory(cat)}
              >
                {CATEGORY_LABELS[lang][cat]}
              </button>
            ))}
          </div>

          <label className="search sb-news-search">
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={ui.searchPlaceholder}
              aria-label={ui.searchPlaceholder}
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear"
                aria-label={ui.clearSearch}
                onClick={() => setSearchTerm('')}
              >
                ×
              </button>
            )}
          </label>
        </div>

        <div>
          {visible.length > 0 ? (
            visible.map((article) => {
              const isSaved = bookmarks.has(article.headline);
              const displayHeadline =
                lang === 'hi' && article.headlineHi ? article.headlineHi : article.headline;
              const displayDeck =
                lang === 'hi' && article.deckHi ? article.deckHi : article.deck;
              const isVideo = hasVideoMedia(article);

              return (
                <article className="sb-news-card" key={article.id}>
                  <Link
                    to={`/article/${article.slug}`}
                    className="sb-news-thumb-link"
                    aria-label={displayHeadline}
                  >
                    <ArticleMediaThumb article={article} compact />
                  </Link>

                  <div className="sb-news-card-body">
                    <div className="sb-story-meta-row">
                      <span className="cat">{CATEGORY_LABELS[lang][article.category]}</span>
                      {isVideo && <span className="sb-inline-video-pill">▶ Video</span>}
                      {article.isPaid && (
                        <span className="pill sb-pill-muted" style={{ fontSize: '10px' }}>
                          {article.paidDisclosureLabel || 'Partner Disclosure'}
                        </span>
                      )}
                      <span className="meta">
                        {article.publishedAt} · {article.readTime}
                      </span>
                    </div>
                    <h3>
                      <Link to={`/article/${article.slug}`}>{displayHeadline}</Link>
                    </h3>
                    <p className="sb-clamp-3">{displayDeck}</p>
                    <div className="src">
                      <b>{article.ticker}</b>
                      {article.sourceNote} · {article.author}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="bm"
                    aria-pressed={isSaved}
                    aria-label={
                      isSaved
                        ? `Remove bookmark for ${article.headline}`
                        : `Bookmark ${article.headline}`
                    }
                    onClick={() => toggleBookmark(article.headline)}
                  >
                    <svg
                      width="18"
                      height="20"
                      viewBox="0 0 18 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M3 2h12v16l-6-4-6 4z" />
                    </svg>
                  </button>
                </article>
              );
            })
          ) : (
            <div style={{ padding: '20px 0', color: 'var(--muted)' }}>
              <p style={{ margin: '0 0 10px' }}>
                {ui.noResultsTitle} {ui.noResultsHint}
              </p>
              {searchTerm && (
                <button type="button" className="btn ghost" onClick={() => setSearchTerm('')}>
                  {ui.clearSearch}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="more">
          <span>
            Showing {visible.length} of {filtered.length}{' '}
            {filtered.length === 1 ? 'story' : 'stories'}
          </span>
          {canLoadMore && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => setShownCount((prev) => prev + 6)}
            >
              {ui.loadMore}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
