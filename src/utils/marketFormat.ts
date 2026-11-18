import type {
  ArticleRecord,
  CalendarCategoryFilter,
  CalendarScheduleItem,
  CalendarViewMode,
  ExchangeSessionPhase,
  IpoRow,
  IpoSegment,
  IpoStatus,
  LanguageCode,
  MarketDataStatus,
  NewsCategory,
  NewsItem,
} from '../types/sakarbazaar';
import {
  formatIstDisplayTimestamp,
  resolveExchangeSessionPhase,
} from '../../server/market-data/marketStatus.ts';
import {
  PREDEFINED_SEARCH_TERMS,
  extractSuggestedKeywords,
  filterArticlesByCategoryAndSearch,
  filterNewsItemsBySearch,
  getSearchSuggestions,
  searchSiteContent,
  type SearchSuggestionItem,
  type SiteSearchResults,
} from './searchEngine';

export {
  PREDEFINED_SEARCH_TERMS,
  extractSuggestedKeywords,
  formatIstDisplayTimestamp,
  getSearchSuggestions,
  searchSiteContent,
  type SearchSuggestionItem,
  type SiteSearchResults,
};

export function getMarketQuoteStatusLabel(status: MarketDataStatus, lang: LanguageCode): string {
  if (lang === 'hi') {
    switch (status) {
      case 'live':
        return 'लाइव';
      case 'delayed':
        return 'विलंबित';
      case 'stale':
        return 'पुराना भाव';
      case 'market_closed':
        return 'बाज़ार बंद';
      default:
        return 'उपलब्ध नहीं';
    }
  }
  switch (status) {
    case 'live':
      return 'Live';
    case 'delayed':
      return 'Delayed';
    case 'stale':
      return 'Stale';
    case 'market_closed':
      return 'Market Closed';
    default:
      return 'Unavailable';
  }
}

export function getExchangePhaseLabel(phase: ExchangeSessionPhase, lang: LanguageCode): string {
  if (lang === 'hi') {
    switch (phase) {
      case 'open':
        return 'बाज़ार खुला (IST)';
      case 'pre_open':
        return 'प्री-ओपन सत्र (IST)';
      case 'weekend':
        return 'सप्ताहांत अवकाश';
      case 'holiday':
        return 'एक्सचेंज अवकाश';
      case 'outage':
        return 'प्रदाता आउटेज';
      default:
        return 'बाज़ार बंद';
    }
  }
  switch (phase) {
    case 'open':
      return 'Normal trading (IST)';
    case 'pre_open':
      return 'Pre-open session (IST)';
    case 'weekend':
      return 'Weekend closed';
    case 'holiday':
      return 'Exchange holiday';
    case 'outage':
      return 'Provider outage';
    default:
      return 'Market closed';
  }
}

export function formatIndianNumber(n: number, decimals = 2): string {
  return Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function getSignPrefix(n: number): string {
  if (n > 0) return '+';
  if (n < 0) return '−';
  return '';
}

export function getChangeClass(n: number): 'up' | 'down' | '' {
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return '';
}

export function getArrowSymbol(n: number): '▲' | '▼' | '–' {
  if (n > 0) return '▲';
  if (n < 0) return '▼';
  return '–';
}

export function calculatePercentChange(value: number, change: number): number {
  const prev = value - change;
  if (prev === 0) return 0;
  return (change / prev) * 100;
}

export function getIstMarketStatus(now: Date, lang: LanguageCode): {
  isOpen: boolean;
  statusText: string;
  clockText: string;
  heroDateText: string;
} {
  const phase = resolveExchangeSessionPhase(now);
  const isOpen = phase === 'open';

  const statusText =
    lang === 'hi'
      ? isOpen
        ? 'बाज़ार सत्र (IST)'
        : phase === 'holiday'
          ? 'एक्सचेंज अवकाश'
          : phase === 'weekend'
            ? 'सप्ताहांत अवकाश'
            : 'बाज़ार बंद'
      : isOpen
        ? 'Market session (IST)'
        : phase === 'holiday'
          ? 'Exchange holiday'
          : phase === 'weekend'
            ? 'Weekend closed'
            : 'Market closed';

  const clockText =
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(now) + ' IST';

  const heroDateText = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(now);

  return { isOpen, statusText, clockText, heroDateText };
}

export function buildSparklinePoints(values: number[], width = 64, height = 22): string {
  if (values.length === 0) return '';
  if (values.length === 1) return `0,${height / 2} ${width},${height / 2}`;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i * width) / (values.length - 1);
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
}

export interface DivergingBarRect {
  x: number;
  y: number;
  width: number;
  height: number;
  tone: 'up' | 'down';
}

export function buildDivergingBars(values: number[]): DivergingBarRect[] {
  if (values.length === 0) return [];
  const maxAbs = Math.max(...values.map(Math.abs), 1);
  return values.map((v, i) => {
    const barHeight = (Math.abs(v) / maxAbs) * 18;
    const isPositive = v >= 0;
    return {
      x: i * 20 + 3,
      y: isPositive ? 22 - barHeight : 22,
      width: 14,
      height: barHeight,
      tone: isPositive ? 'up' : 'down',
    };
  });
}

export function filterNewsItems(
  items: NewsItem[],
  category: NewsCategory,
  searchTerm: string,
): NewsItem[] {
  return filterNewsItemsBySearch(items, category, searchTerm);
}

export function filterArticlesByCategory(
  articles: ArticleRecord[],
  category: NewsCategory,
  searchTerm: string,
): ArticleRecord[] {
  return filterArticlesByCategoryAndSearch(articles, category, searchTerm);
}

export function filterIpoRows(
  rows: IpoRow[],
  segment: IpoSegment,
  statusFilter: 'All' | IpoStatus,
): IpoRow[] {
  return rows.filter((row) => {
    if (row.segment !== segment) return false;
    if (statusFilter === 'All') return true;
    return row.status === statusFilter;
  });
}

export function getVerifiedIpoCounts(rows: IpoRow[]): {
  verifiedTotal: number;
  confirmedOpen: number;
  confirmedUpcoming: number;
  awaitingVerification: number;
} {
  const verifiedRows = rows.filter((r) => r.verificationStatus === 'verified');
  return {
    verifiedTotal: verifiedRows.length,
    confirmedOpen: verifiedRows.filter((r) => r.status === 'Open').length,
    confirmedUpcoming: verifiedRows.filter((r) => r.status === 'Upcoming').length,
    awaitingVerification: rows.filter((r) => r.verificationStatus === 'awaiting_verification').length,
  };
}

export function filterCalendarItems(
  items: CalendarScheduleItem[],
  view: CalendarViewMode,
  category: CalendarCategoryFilter,
): CalendarScheduleItem[] {
  return items.filter((item) => {
    const matchesBucket =
      view === 'day'
        ? item.bucket === 'day'
        : view === 'week'
          ? item.bucket === 'day' || item.bucket === 'week'
          : true;
    if (!matchesBucket) return false;
    if (category === 'All') return true;
    return item.category === category;
  });
}

export function isValidEmailAddress(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}
