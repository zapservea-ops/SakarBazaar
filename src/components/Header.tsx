import { Menu, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { EXPLAINERS_CATALOG, IPO_ALL_RECORDS } from '../data/sampleData';
import { getSearchSuggestions } from '../utils/marketFormat';

export function Header() {
  const {
    theme,
    lang,
    copy,
    ui,
    bookmarks,
    searchTerm,
    mobileSearchOpen,
    desktopSearchRef,
    mobileSearchRef,
    articlesCatalog,
    allMarketInstruments,
    setSearchTerm,
    setMobileSearchOpen,
    toggleLang,
    toggleTheme,
  } = useSakarBazaar();

  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const drawerCloseBtnRef = useRef<HTMLButtonElement | null>(null);
  const searchContainerRef = useRef<HTMLFormElement | null>(null);

  const suggestions = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return getSearchSuggestions(
      searchTerm,
      articlesCatalog,
      IPO_ALL_RECORDS,
      EXPLAINERS_CATALOG,
      allMarketInstruments,
      6,
    );
  }, [searchTerm, articlesCatalog, allMarketInstruments]);

  useEffect(() => {
    setDrawerOpen(false);
    setSearchFocused(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => drawerCloseBtnRef.current?.focus(), 20);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [drawerOpen]);

  function handleSearchChange(value: string) {
    setSearchTerm(value);
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const q = searchTerm.trim();
    setMobileSearchOpen(false);
    setDrawerOpen(false);
    setSearchFocused(false);
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  function handleSuggestionSelect(path: string) {
    setSearchFocused(false);
    setMobileSearchOpen(false);
    setDrawerOpen(false);
    navigate(path);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    menuBtnRef.current?.focus();
  }

  return (
    <header className="main">
      <div className="wrap sb-header-inner">
        <Link className="logo" to="/" aria-label="SakarBazaar home">
          <svg width="26" height="24" viewBox="0 0 26 24" aria-hidden="true">
            <rect x="1" y="13" width="6" height="10" rx="1" fill="#0b6b6b" />
            <rect x="10" y="7" width="6" height="16" rx="1" fill="#0b6b6b" />
            <rect x="19" y="1" width="6" height="22" rx="1" fill="#d99a00" />
          </svg>
          <span>
            Sakar<b>Bazaar</b>
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="Primary">
          <NavLink to="/news" aria-current={
            location.pathname.startsWith('/news') || location.pathname.startsWith('/article')
              ? 'page'
              : undefined
          }>
            {copy.news}
          </NavLink>
          <NavLink to="/intelligence" aria-current={location.pathname === '/intelligence' ? 'page' : undefined}>
            {copy.intelligence}
          </NavLink>
          <NavLink to="/ipo" aria-current={location.pathname.startsWith('/ipo') ? 'page' : undefined}>
            {copy.ipo}
          </NavLink>
          <NavLink to="/calendar" aria-current={location.pathname === '/calendar' ? 'page' : undefined}>
            {copy.calendar}
          </NavLink>
          <NavLink
            to="/explainers"
            aria-current={location.pathname.startsWith('/explainers') ? 'page' : undefined}
          >
            {copy.explain}
          </NavLink>
        </nav>

        <div style={{ position: 'relative' }} className="desktop-search-wrapper">
          <form
            ref={searchContainerRef}
            className="search desktop-search"
            onSubmit={handleSearchSubmit}
            role="search"
          >
            <Search size={16} aria-hidden="true" />
            <input
              ref={desktopSearchRef}
              id="q"
              type="search"
              value={searchTerm}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                handleSearchChange(e.target.value);
                setSearchFocused(true);
              }}
              placeholder={ui.searchPlaceholder}
              aria-label={ui.searchPlaceholder}
              autoComplete="off"
            />
            {searchTerm ? (
              <button
                type="button"
                className="search-clear"
                aria-label={ui.clearSearch}
                onClick={() => {
                  handleSearchChange('');
                  setSearchFocused(false);
                }}
              >
                ×
              </button>
            ) : (
              <kbd>Ctrl K</kbd>
            )}
          </form>

          {searchFocused && suggestions.length > 0 && (
            <div className="sb-autocomplete-dropdown" role="listbox">
              <div className="sb-autocomplete-label">Suggested Results</div>
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="sb-autocomplete-item"
                  onClick={() => handleSuggestionSelect(item.path)}
                >
                  <span className="pill sb-pill-muted">{item.category}</span>
                  <div className="sb-autocomplete-text">
                    <strong>{item.text}</strong>
                    {item.subtitle && <small>{item.subtitle}</small>}
                  </div>
                </button>
              ))}
              <button
                type="button"
                className="sb-autocomplete-footer"
                onClick={handleSearchSubmit}
              >
                Press Enter to view all results for "{searchTerm}" →
              </button>
            </div>
          )}
        </div>

        <div className="sb-mobile-actions">
          <button
            type="button"
            className="mobile-icon-btn"
            aria-label={mobileSearchOpen ? 'Close search' : 'Open search'}
            aria-expanded={mobileSearchOpen}
            aria-controls="mobile-search-panel"
            onClick={() => {
              setMobileSearchOpen((prev) => {
                const next = !prev;
                if (next) {
                  window.setTimeout(() => mobileSearchRef.current?.focus(), 20);
                }
                return next;
              });
            }}
          >
            <Search size={19} aria-hidden="true" />
          </button>

          <button
            ref={menuBtnRef}
            type="button"
            className="mobile-icon-btn"
            aria-label={drawerOpen ? ui.menuCloseLabel : ui.menuOpenLabel}
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setDrawerOpen((prev) => !prev)}
          >
            {drawerOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div
        id="mobile-search-panel"
        className={`mobile-search-bar${mobileSearchOpen ? ' open' : ''}`}
      >
        <div className="wrap">
          <form className="search" onSubmit={handleSearchSubmit} role="search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={mobileSearchRef}
              id="q-mobile"
              type="search"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={ui.searchPlaceholder}
              aria-label={`Mobile ${ui.searchPlaceholder}`}
              autoComplete="off"
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear"
                aria-label="Clear mobile search"
                onClick={() => handleSearchChange('')}
              >
                ×
              </button>
            )}
            <button type="submit" className="btn sb-mobile-search-submit">
              {ui.searchButton}
            </button>
          </form>

          {suggestions.length > 0 && (
            <div className="sb-mobile-autocomplete" role="listbox">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="sb-autocomplete-item"
                  onClick={() => handleSuggestionSelect(item.path)}
                >
                  <span className="pill sb-pill-muted">{item.category}</span>
                  <div className="sb-autocomplete-text">
                    <strong>{item.text}</strong>
                    {item.subtitle && <small>{item.subtitle}</small>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {drawerOpen && (
        <div
          className="sb-drawer-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}
        >
          <aside
            id="mobile-nav-drawer"
            className="sb-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
          >
            <div className="sb-drawer-head">
              <span className="logo" style={{ fontSize: '20px' }}>
                Sakar<b>Bazaar</b>
              </span>
              <button
                ref={drawerCloseBtnRef}
                type="button"
                className="mobile-icon-btn"
                aria-label={ui.menuCloseLabel}
                onClick={closeDrawer}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <nav className="sb-drawer-nav" aria-label="Mobile primary">
              <NavLink to="/" aria-current={location.pathname === '/' ? 'page' : undefined}>
                {ui.backToMarkets}
              </NavLink>
              <NavLink
                to="/news"
                aria-current={
                  location.pathname.startsWith('/news') || location.pathname.startsWith('/article')
                    ? 'page'
                    : undefined
                }
              >
                {copy.news}
              </NavLink>
              <NavLink to="/intelligence" aria-current={location.pathname === '/intelligence' ? 'page' : undefined}>
                {copy.intelligence}
              </NavLink>
              <NavLink to="/ipo" aria-current={location.pathname.startsWith('/ipo') ? 'page' : undefined}>
                {copy.ipo}
              </NavLink>
              <NavLink to="/calendar" aria-current={location.pathname === '/calendar' ? 'page' : undefined}>
                {copy.calendar}
              </NavLink>
              <NavLink
                to="/explainers"
                aria-current={location.pathname.startsWith('/explainers') ? 'page' : undefined}
              >
                {copy.explain}
              </NavLink>
              <NavLink to="/search" aria-current={location.pathname === '/search' ? 'page' : undefined}>
                {ui.searchButton}
              </NavLink>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />
              <NavLink
                to="/editorial"
                aria-current={location.pathname.startsWith('/editorial') ? 'page' : undefined}
              >
                {copy.editorial}
              </NavLink>
            </nav>

            <div className="sb-drawer-controls">
              <button
                type="button"
                className="btn ghost"
                aria-pressed={lang === 'hi'}
                onClick={toggleLang}
              >
                EN / हिंदी ({lang.toUpperCase()})
              </button>
              <button
                type="button"
                className="btn ghost"
                aria-pressed={theme === 'dark'}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </header>
  );
}
