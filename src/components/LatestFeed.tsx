import { Link } from 'react-router-dom';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { CATEGORY_LABELS } from '../data/i18n';
import type { HomepageNewsCategory, NewsItem } from '../types/sakarbazaar';
import { hasVideoMedia } from '../utils/articleMedia';

interface LatestFeedProps {
  title: string;
  categories: HomepageNewsCategory[];
  selectedCategory: HomepageNewsCategory;
  filteredItems: NewsItem[];
  shownCount: number;
  bookmarks: Set<string>;
  searchTerm: string;
  onSelectCategory: (cat: HomepageNewsCategory) => void;
  onLoadMore: () => void;
  onToggleBookmark: (headline: string) => void;
  onClearSearch: () => void;
}

export function LatestFeed({
  title,
  categories,
  selectedCategory,
  filteredItems,
  shownCount,
  bookmarks,
  searchTerm,
  onSelectCategory,
  onLoadMore,
  onToggleBookmark,
  onClearSearch,
}: LatestFeedProps) {
  const { lang, ui } = useSakarBazaar();
  const visibleItems = filteredItems.slice(0, shownCount);
  const canLoadMore = shownCount < filteredItems.length;

  return (
    <section className="card feed" id="latest">
      <div className="sec-h">
        <h2>{title}</h2>
        <span className="meta" id="upd">
          {filteredItems.length} {filteredItems.length === 1 ? 'dispatch' : 'dispatches'}
        </span>
      </div>

      <div className="tabs" id="filters" role="tablist" aria-label="News categories">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={selectedCategory === cat}
            onClick={() => onSelectCategory(cat)}
          >
            {CATEGORY_LABELS[lang][cat]}
          </button>
        ))}
      </div>

      <div id="list">
        {visibleItems.length > 0 ? (
          visibleItems.map((item) => {
            const isBookmarked = bookmarks.has(item.headline);
            const displayHeadline =
              lang === 'hi' && item.headlineHi ? item.headlineHi : item.headline;
            return (
              <div className="item" key={item.id}>
                <span className="t">{item.time}</span>
                <div>
                  <div className="sb-story-meta-row">
                    <span className="cat">{CATEGORY_LABELS[lang][item.category]}</span>
                    {hasVideoMedia(item) && (
                      <span className="sb-inline-video-pill">▶ Video</span>
                    )}
                  </div>
                  <Link className="h" to={`/article/${item.slug}`}>
                    {displayHeadline}
                  </Link>
                  <div className="src">
                    <b>{item.ticker}</b>
                    {item.sourceNote}
                  </div>
                </div>
                <button
                  type="button"
                  className="bm"
                  aria-pressed={isBookmarked}
                  aria-label={
                    isBookmarked
                      ? `Remove bookmark for ${item.headline}`
                      : `Bookmark ${item.headline}`
                  }
                  onClick={() => onToggleBookmark(item.headline)}
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
              </div>
            );
          })
        ) : (
          <div style={{ padding: '16px 0', color: 'var(--muted)' }}>
            <p style={{ margin: '0 0 10px' }}>
              {ui.noResultsTitle} {ui.noResultsHint}
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {searchTerm && (
                <>
                  <button type="button" className="btn ghost" onClick={onClearSearch}>
                    {ui.clearSearch}
                  </button>
                  <Link
                    className="btn"
                    to={`/search?q=${encodeURIComponent(searchTerm.trim())}`}
                  >
                    {ui.searchButton}
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="more">
        <span id="count">
          Showing {Math.min(shownCount, filteredItems.length)} of {filteredItems.length}{' '}
          {filteredItems.length === 1 ? 'story' : 'stories'}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {canLoadMore && (
            <button type="button" className="btn ghost" id="loadMore" onClick={onLoadMore}>
              {ui.loadMore}
            </button>
          )}
          <Link className="meta" to="/news" style={{ color: 'var(--teal)', fontWeight: 600 }}>
            {ui.allStories} →
          </Link>
        </div>
      </div>
    </section>
  );
}
