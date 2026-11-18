export type ThemeMode = 'light' | 'dark';

export type LanguageCode = 'en' | 'hi';

export type NewsCategory =
  | 'All'
  | 'Markets'
  | 'IPO'
  | 'Corporate'
  | 'Economy'
  | 'RBI'
  | 'Banking'
  | 'Technology'
  | 'Personal finance';

export type HomepageNewsCategory = 'All' | 'Markets' | 'IPO' | 'Corporate' | 'Economy' | 'RBI';

export type IpoSegment = 'Mainboard' | 'SME';

export type IpoStatus = 'Awaiting Verification' | 'Open' | 'Upcoming' | 'Closed' | 'Listed';

export type VerificationStatus = 'awaiting_verification' | 'verified' | 'unverified';

export type EditorialWorkflowStatus =
  | 'Draft'
  | 'Awaiting Verification'
  | 'Verified'
  | 'Published'
  | 'Archived';

import type {
  ExchangeSessionPhase,
  InstrumentDefinition,
  InstrumentExchange,
  InstrumentType,
  MarketDataApiResponse,
  MarketDataErrorItem,
  MarketDataStatus,
  NormalizedQuote,
} from '../../server/market-data/types.ts';

export type {
  ExchangeSessionPhase,
  InstrumentDefinition,
  InstrumentExchange,
  InstrumentType,
  MarketDataApiResponse,
  MarketDataErrorItem,
  MarketDataStatus,
  NormalizedQuote,
};

export type MarketFreshnessStatus = MarketDataStatus;
export type MarketInstrument = NormalizedQuote;
export type MarketDataResponse = MarketDataApiResponse;

export type MarketPulseCategory =
  | 'RBI'
  | 'Economy'
  | 'Corporate'
  | 'Regulatory'
  | 'Commodity/FX'
  | 'Markets';

export interface MarketPulseItem {
  id: string;
  title: string;
  titleHi?: string;
  category: MarketPulseCategory;
  source: string;
  sourceUrl?: string | null;
  verificationStatus: VerificationStatus;
  timestamp: string;
  summary: string;
  summaryHi?: string;
  actionableContext?: string;
  relatedPath?: string;
}

export interface SearchSiteResults {
  articles: ArticleRecord[];
  ipos: IpoRow[];
  explainers: ExplainerRecord[];
  instruments: MarketInstrument[];
  totalCount: number;
}

export type IllustrationVariant =
  | 'rbi-dial'
  | 'markets-pulse'
  | 'ipo-book'
  | 'economy-cpi'
  | 'corporate-corridor'
  | 'banking-ledger'
  | 'tech-grid'
  | 'personal-finance';

export interface ArticleCitation {
  id: string;
  label: string;
  portalName: string;
  url: string | null;
  note: string;
}

export interface ArticleSection {
  heading: string;
  paragraphs: string[];
}

export interface FinancialMetricRow {
  metric: string;
  value: string;
  note?: string;
}

export interface MediaAssetRecord {
  id: string;
  fileName: string;
  storagePath: string;
  publicUrl: string;
  mediaType: 'video/mp4' | 'image/png' | 'image/jpeg' | 'image/webp';
  durationSec?: number;
  width?: number;
  height?: number;
  title: string;
  caption: string;
  sourceNote: string;
  transcript?: string;
  associatedArticleSlug?: string;
}

export interface ArticleRecord {
  id: string;
  slug: string;
  category: Exclude<NewsCategory, 'All'>;
  subCategory?: string;
  company?: string;
  headline: string;
  headlineHi?: string;
  deck: string;
  deckHi?: string;
  author: string;
  authorRole: string;
  publishedAt: string;
  updatedAt: string;
  time: string;
  readTime: string;
  ticker: string;
  sourceName: string;
  sourceUrl?: string | null;
  sourceNote: string;
  verificationStatus: VerificationStatus;
  editorialStatus: EditorialWorkflowStatus;
  illustration: IllustrationVariant;
  illustrationCaption: string;
  tags: string[];
  keywords: string[];
  entities: string[];
  aliases: string[];
  keyPoints: string[];
  sections: ArticleSection[];
  financialMetrics?: FinancialMetricRow[];
  risksAndMonitorables?: string[];
  verificationChecklist?: string[];
  citations: ArticleCitation[];
  media?: MediaAssetRecord;
  relatedSlugs: string[];
  isFeatured?: boolean;
  isPopular?: boolean;
  isHomepageFeed?: boolean;
}

export interface NewsItem {
  id: string;
  slug: string;
  time: string;
  category: Exclude<NewsCategory, 'All'>;
  subCategory?: string;
  headline: string;
  headlineHi?: string;
  ticker: string;
  sourceNote: string;
  verificationStatus: VerificationStatus;
  summary: string;
  paragraphs: string[];
}

export interface IpoRow {
  id: string;
  slug: string;
  segment: IpoSegment;
  status: IpoStatus;
  verificationStatus: 'awaiting_verification' | 'verified';
  company: string;
  exchange?: string | null;
  issueSize: string | null;
  upperBandValuation?: string | null;
  priceBand: string | null;
  openDate: string | null;
  closeDate: string | null;
  allotmentDate: string | null;
  listingDate: string | null;
  offerType: string | null;
  sharesOffered?: string | null;
  stakePercent?: string | null;
  sellingShareholder?: string | null;
  proceedsRecipient?: string | null;
  summary: string;
  sourceName: string;
  sourceUrl?: string | null;
  officialDocuments: ArticleCitation[];
  financialMetrics?: FinancialMetricRow[];
  risksAndMonitorables?: string[];
  verificationChecklist?: string[];
  keywords: string[];
  entities: string[];
  aliases: string[];
  relatedArticleSlug?: string;
  lastVerifiedAt?: string | null;
}

export type CalendarViewMode = 'day' | 'week' | 'upcoming';
export type CalendarCategoryFilter = 'All' | 'IPO' | 'RBI' | 'Economy' | 'Markets';

export interface CalendarScheduleItem {
  id: string;
  dateLabel: string;
  timeLabel: string;
  bucket: CalendarViewMode;
  category: Exclude<CalendarCategoryFilter, 'All'>;
  title: string;
  titleHi: string;
  detail: string;
  detailHi: string;
  relatedPath: string;
  verificationStatus: VerificationStatus;
}

export interface GlossaryTerm {
  term: string;
  meaning: string;
}

export interface ExplainerRecord {
  id: string;
  slug: string;
  tag: string;
  tagHi: string;
  readTime: string;
  title: string;
  titleHi: string;
  summary: string;
  summaryHi: string;
  illustration: IllustrationVariant;
  keywords: string[];
  aliases: string[];
  keyPoints: string[];
  sections: ArticleSection[];
  disclaimer?: string;
  glossaryTerms?: GlossaryTerm[];
}

export type SupportingRouteKey =
  | 'about'
  | 'disclaimer'
  | 'privacy'
  | 'contact'
  | 'rss'
  | 'sitemap';

export interface TranslationStrings {
  markets: string;
  ipo: string;
  news: string;
  intelligence: string;
  companies: string;
  calendar: string;
  watch: string;
  explain: string;
  editorial: string;
  read: string;
  latest: string;
  snapshot: string;
  ipodesk: string;
}

export interface AiGeneratedBriefPayload {
  headline: string;
  summaryBrief: string;
  wordCount: number;
  entities: {
    companies: string[];
    instrumentsAndSymbols: string[];
    financialValues: string[];
    dates: string[];
    regulatorsAndExchanges: string[];
  };
  keywords: string[];
  verificationChecklist: string[];
}
