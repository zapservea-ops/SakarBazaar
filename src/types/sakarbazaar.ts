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

export type IpoStatus = 'Awaiting Verification' | 'Proposed OFS' | 'Open' | 'Upcoming' | 'Closed' | 'Listed';

export type VerificationStatus = 'awaiting_verification' | 'verified' | 'unverified';

export type EditorialWorkflowStatus =
  | 'Draft'
  | 'Awaiting Verification'
  | 'Verified'
  | 'Published'
  | 'Expired'
  | 'Retained'
  | 'Pending Deletion'
  | 'Deletion In Progress'
  | 'Deleted'
  | 'Archived';

export type AdminRole = 'owner' | 'publisher' | 'none';
export type DurationPreset = '7d' | '15d' | '30d' | '60d' | 'custom';
export type FeaturedPlacement = 'none' | 'main' | 'secondary';
export type DeletionStatus =
  | 'none'
  | 'pending_approval'
  | 'approved'
  | 'in_progress'
  | 'partial_failure'
  | 'deleted';

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
  posterUrl?: string;
  mediaType: 'video/mp4' | 'video/youtube' | 'image/png' | 'image/jpeg' | 'image/webp';
  durationSec?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  credit?: string;
  usageRightsConfirmed?: boolean;
  isPublic?: boolean;
  expiresAtMs?: number | null;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  associatedArticleIds?: string[];
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
  sectionsHi?: ArticleSection[];
  author: string;
  authorRole: string;
  publishedAt: string;
  publishedAtMs?: number | null;
  expiresAtMs?: number | null;
  durationPreset?: DurationPreset;
  durationHours?: number;
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
  mediaId?: string;
  relatedSlugs: string[];
  isFeatured?: boolean;
  featuredPlacement?: FeaturedPlacement;
  featuredOrder?: number;
  isPaid?: boolean;
  paidDisclosureLabel?: string;
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
  summaryHi?: string;
  paragraphs: string[];
  media?: MediaAssetRecord;
  isPaid?: boolean;
  paidDisclosureLabel?: string;
}

export interface IpoRow {
  id: string;
  slug: string;
  segment: IpoSegment;
  status: IpoStatus;
  verificationStatus: 'awaiting_verification' | 'verified' | 'proposed';
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

export interface AdminUserRecord {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'publisher' | 'admin' | 'editor';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuthorizedEmailRecord {
  id: string; // normalized lowercase email
  email: string;
  displayName: string;
  role: 'owner' | 'publisher';
  active: boolean;
  addedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SystemSettingsRecord {
  key: string;
  defaultDurationPreset: DurationPreset;
  expiringSoonThresholdHours: number;
  maxImageSizeBytes: number;
  requireBilingualPublish: boolean;
  updatedByUid: string;
  updatedAt?: unknown;
}

export interface StoredArticleDoc {
  id: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  enHeadline: string;
  enSummary: string;
  enBody: string;
  hiHeadline: string;
  hiSummary: string;
  hiBody: string;
  category: Exclude<NewsCategory, 'All'>;
  tags: string[];
  keywords: string[];
  entities: string[];
  author: string;
  status: EditorialWorkflowStatus;
  verificationStatus: VerificationStatus;
  sourceName: string;
  sourceUrl?: string;
  officialSources?: string[];
  mediaId?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  youtubeTitle?: string;
  language: 'en' | 'hi' | 'bilingual';
  durationPreset?: DurationPreset;
  durationHours?: number;
  publishedAt?: string;
  publishedAtMs?: number | null;
  expiresAtMs?: number | null;
  expiresAt?: unknown;
  retainedPrivate?: boolean;
  featuredPlacement?: FeaturedPlacement;
  featuredOrder?: number;
  isPaid?: boolean;
  paidCampaignId?: string;
  paidDisclosureLabel?: string;
  deletionStatus?: DeletionStatus;
  deletionApprovedByUid?: string;
  deletionApprovedByEmail?: string;
  deletionApprovedAtMs?: number | null;
  deletionError?: string;
  deletionAttempts?: number;
  createdByUid: string;
  updatedByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StoredMediaAssetDoc {
  id: string;
  fileName: string;
  storagePath?: string;
  mediaType: 'video/mp4' | 'video/youtube' | 'image/png' | 'image/jpeg' | 'image/webp';
  duration?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  credit?: string;
  usageRightsConfirmed?: boolean;
  isPublic?: boolean;
  expiresAtMs?: number | null;
  expiresAt?: unknown;
  poster?: string;
  captions?: string;
  transcript?: string;
  associatedArticleId?: string;
  associatedArticleIds?: string[];
  youtubeVideoId?: string;
  youtubeUrl?: string;
  uploadedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StoredMediaPayloadDoc {
  id: string;
  mediaId: string;
  mimeType: 'image/jpeg' | 'image/webp' | 'image/png';
  sizeBytes: number;
  dataUrl: string;
  isPublic: boolean;
  expiresAt?: unknown;
  uploadedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaidCampaignRecord {
  id: string;
  clientName: string;
  articleId?: string;
  articleTitle?: string;
  startDate?: string;
  endDate?: string;
  durationHours?: number;
  placementPreference?: string;
  internalStatus: 'Planned' | 'Active' | 'Paused' | 'Completed' | 'Cancelled';
  disclosureEnabled: boolean;
  disclosureLabel?: string;
  commercialNotes?: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ManagedIpoRecord {
  id: string;
  companyName: string;
  slug: string;
  segment: IpoSegment;
  status: 'Awaiting Verification' | 'Upcoming' | 'Open' | 'Closed' | 'Listed';
  issueSize?: string;
  priceBand?: string;
  lotSize?: string;
  filingDate?: string;
  openingDate?: string;
  closingDate?: string;
  allotmentDate?: string;
  listingDate?: string;
  sellingShareholder?: string;
  offerType?: string;
  summary?: string;
  officialDocuments?: string[];
  sourceName?: string;
  sourceUrl?: string;
  verificationStatus: 'awaiting_verification' | 'verified';
  lastVerifiedAt?: string;
  updatedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface IpoSourceDiffItem {
  field: string;
  label: string;
  previousValue: string;
  detectedValue: string;
}

export interface IpoSourceReviewRecord {
  id: string;
  companyName: string;
  targetIpoId?: string;
  segment: IpoSegment;
  reviewStatus: 'Needs Review' | 'Approved' | 'Rejected';
  sourceName: string;
  sourceUrl?: string;
  checkedAt: string;
  diffs: IpoSourceDiffItem[];
  detectedSummary?: string;
  reviewedByUid?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUid: string;
  actorEmail: string;
  previousStatus?: string;
  nextStatus: string;
  summary: string;
  createdAtMs?: number;
  createdAt?: unknown;
}

export interface SakarBazaarBackupBundle {
  schemaVersion: '1.0.0';
  app: 'SakarBazaar';
  exportedAt: string;
  exportedByUid: string;
  exportedByEmail: string;
  notes: {
    includesPhotographs: true;
    excludesYouTubeVideoFiles: true;
    youtubeNote: string;
  };
  counts: {
    articles: number;
    media: number;
    mediaPayloads: number;
    paidCampaigns: number;
    ipos: number;
    ipoSourceReviews: number;
    auditLogs: number;
    authorizedEmails: number;
    systemSettings: number;
  };
  data: {
    articles: StoredArticleDoc[];
    media: StoredMediaAssetDoc[];
    mediaPayloads: StoredMediaPayloadDoc[];
    paidCampaigns: PaidCampaignRecord[];
    ipos: ManagedIpoRecord[];
    ipoSourceReviews: IpoSourceReviewRecord[];
    auditLogs: AuditLogRecord[];
    authorizedEmails: AuthorizedEmailRecord[];
    systemSettings: SystemSettingsRecord[];
  };
}

