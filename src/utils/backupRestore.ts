import type {
  AuditLogRecord,
  AuthorizedEmailRecord,
  ManagedIpoRecord,
  IpoSourceReviewRecord,
  PaidCampaignRecord,
  SakarBazaarBackupBundle,
  StoredArticleDoc,
  StoredMediaAssetDoc,
  StoredMediaPayloadDoc,
  SystemSettingsRecord,
} from '../types/sakarbazaar';
import { MAX_FIRESTORE_DATA_URL_LENGTH } from './mediaLibrary';

export function buildSakarBazaarBackupBundle(params: {
  exportedByUid: string;
  exportedByEmail: string;
  exportedAt?: string;
  articles: StoredArticleDoc[];
  media: StoredMediaAssetDoc[];
  mediaPayloads: StoredMediaPayloadDoc[];
  paidCampaigns: PaidCampaignRecord[];
  ipos: ManagedIpoRecord[];
  ipoSourceReviews: IpoSourceReviewRecord[];
  auditLogs: AuditLogRecord[];
  authorizedEmails: AuthorizedEmailRecord[];
  systemSettings: SystemSettingsRecord[];
}): SakarBazaarBackupBundle {
  return {
    schemaVersion: '1.0.0',
    app: 'SakarBazaar',
    exportedAt: params.exportedAt ?? new Date().toISOString(),
    exportedByUid: params.exportedByUid,
    exportedByEmail: params.exportedByEmail,
    notes: {
      includesPhotographs: true,
      excludesYouTubeVideoFiles: true,
      youtubeNote:
        'Compressed article photographs and metadata are included inside data.media and data.mediaPayloads. Video files are hosted on YouTube and kept separately on the Owner PC; only YouTube IDs, URLs, and metadata are stored here.',
    },
    counts: {
      articles: params.articles.length,
      media: params.media.length,
      mediaPayloads: params.mediaPayloads.length,
      paidCampaigns: params.paidCampaigns.length,
      ipos: params.ipos.length,
      ipoSourceReviews: params.ipoSourceReviews.length,
      auditLogs: params.auditLogs.length,
      authorizedEmails: params.authorizedEmails.length,
      systemSettings: params.systemSettings.length,
    },
    data: {
      articles: params.articles,
      media: params.media,
      mediaPayloads: params.mediaPayloads,
      paidCampaigns: params.paidCampaigns,
      ipos: params.ipos,
      ipoSourceReviews: params.ipoSourceReviews,
      auditLogs: params.auditLogs,
      authorizedEmails: params.authorizedEmails,
      systemSettings: params.systemSettings,
    },
  };
}

export interface BackupValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    articles: number;
    media: number;
    mediaPayloads: number;
    paidCampaigns: number;
    ipos: number;
    ipoSourceReviews: number;
    auditLogs: number;
  };
}

export function validateBackupBundle(raw: unknown): BackupValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      errors: ['Backup file must be a JSON object.'],
      warnings: [],
      summary: {
        articles: 0,
        media: 0,
        mediaPayloads: 0,
        paidCampaigns: 0,
        ipos: 0,
        ipoSourceReviews: 0,
        auditLogs: 0,
      },
    };
  }

  const bundle = raw as Partial<SakarBazaarBackupBundle>;
  if (bundle.app !== 'SakarBazaar' || bundle.schemaVersion !== '1.0.0') {
    errors.push('Unsupported backup format or schemaVersion (expected SakarBazaar v1.0.0).');
  }
  if (!bundle.data || typeof bundle.data !== 'object') {
    errors.push('Missing "data" payload section inside backup file.');
    return {
      valid: false,
      errors,
      warnings,
      summary: {
        articles: 0,
        media: 0,
        mediaPayloads: 0,
        paidCampaigns: 0,
        ipos: 0,
        ipoSourceReviews: 0,
        auditLogs: 0,
      },
    };
  }

  const d = bundle.data;
  const articles = Array.isArray(d.articles) ? d.articles : [];
  const media = Array.isArray(d.media) ? d.media : [];
  const mediaPayloads = Array.isArray(d.mediaPayloads) ? d.mediaPayloads : [];
  const paidCampaigns = Array.isArray(d.paidCampaigns) ? d.paidCampaigns : [];
  const ipos = Array.isArray(d.ipos) ? d.ipos : [];
  const ipoSourceReviews = Array.isArray(d.ipoSourceReviews) ? d.ipoSourceReviews : [];
  const auditLogs = Array.isArray(d.auditLogs) ? d.auditLogs : [];

  for (const art of articles) {
    if (!art?.id || !art?.slug) {
      errors.push(`Invalid article entry missing id or slug.`);
      break;
    }
  }

  for (const payload of mediaPayloads) {
    if (!payload?.mediaId || !payload?.dataUrl) {
      errors.push('Invalid mediaPayload entry missing mediaId or dataUrl.');
      break;
    }
    if (payload.dataUrl.length > MAX_FIRESTORE_DATA_URL_LENGTH) {
      errors.push(`Media payload ${payload.mediaId} exceeds Firestore size safety limit.`);
      break;
    }
  }

  const payloadIds = new Set(mediaPayloads.map((p) => p.mediaId));
  for (const item of media) {
    if (item.mediaType?.startsWith('image/') && !payloadIds.has(item.id)) {
      warnings.push(`Image metadata "${item.fileName || item.id}" has no embedded payload in mediaPayloads.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      articles: articles.length,
      media: media.length,
      mediaPayloads: mediaPayloads.length,
      paidCampaigns: paidCampaigns.length,
      ipos: ipos.length,
      ipoSourceReviews: ipoSourceReviews.length,
      auditLogs: auditLogs.length,
    },
  };
}

function pickAllowedKeys(
  raw: Record<string, unknown>,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in raw && raw[key] !== undefined) {
      out[key] = raw[key];
    }
  }
  return out;
}

const ARTICLE_RESTORE_KEYS = [
  'title',
  'slug',
  'summary',
  'body',
  'enHeadline',
  'enSummary',
  'enBody',
  'hiHeadline',
  'hiSummary',
  'hiBody',
  'category',
  'tags',
  'keywords',
  'entities',
  'author',
  'status',
  'verificationStatus',
  'sourceName',
  'sourceUrl',
  'officialSources',
  'mediaId',
  'youtubeUrl',
  'youtubeVideoId',
  'youtubeTitle',
  'language',
  'durationPreset',
  'durationHours',
  'publishedAt',
  'publishedAtMs',
  'expiresAtMs',
  'retainedPrivate',
  'featuredPlacement',
  'featuredOrder',
  'isPaid',
  'paidCampaignId',
  'paidDisclosureLabel',
  'deletionStatus',
  'deletionApprovedByUid',
  'deletionApprovedByEmail',
  'deletionApprovedAtMs',
  'deletionError',
  'deletionAttempts',
] as const;

const MEDIA_RESTORE_KEYS = [
  'fileName',
  'storagePath',
  'mediaType',
  'duration',
  'width',
  'height',
  'sizeBytes',
  'credit',
  'usageRightsConfirmed',
  'isPublic',
  'expiresAtMs',
  'poster',
  'captions',
  'transcript',
  'associatedArticleId',
  'associatedArticleIds',
  'youtubeVideoId',
  'youtubeUrl',
] as const;

const PAID_CAMPAIGN_RESTORE_KEYS = [
  'clientName',
  'articleId',
  'articleTitle',
  'startDate',
  'endDate',
  'durationHours',
  'placementPreference',
  'internalStatus',
  'disclosureEnabled',
  'disclosureLabel',
  'commercialNotes',
] as const;

const IPO_RESTORE_KEYS = [
  'companyName',
  'slug',
  'segment',
  'status',
  'issueSize',
  'priceBand',
  'lotSize',
  'filingDate',
  'openingDate',
  'closingDate',
  'allotmentDate',
  'listingDate',
  'sellingShareholder',
  'offerType',
  'summary',
  'officialDocuments',
  'sourceName',
  'sourceUrl',
  'verificationStatus',
  'lastVerifiedAt',
] as const;

export function prepareRestoredArticlePayload(
  art: StoredArticleDoc,
  actorUid: string,
  isExisting: boolean,
): Record<string, unknown> {
  const base = pickAllowedKeys(art as unknown as Record<string, unknown>, ARTICLE_RESTORE_KEYS);
  base.updatedByUid = actorUid;
  if (!isExisting) {
    base.createdByUid = actorUid;
  }
  return base;
}

export function prepareRestoredMediaPayload(
  med: StoredMediaAssetDoc,
  actorUid: string,
  isExisting: boolean,
): Record<string, unknown> {
  const base = pickAllowedKeys(med as unknown as Record<string, unknown>, MEDIA_RESTORE_KEYS);
  if (!isExisting) {
    base.uploadedByUid = actorUid;
  }
  return base;
}

export function prepareRestoredMediaBlobPayload(
  pay: StoredMediaPayloadDoc,
  safeMediaId: string,
  actorUid: string,
  isExisting: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    mediaId: safeMediaId,
    mimeType: pay.mimeType,
    sizeBytes: pay.sizeBytes,
    dataUrl: pay.dataUrl,
    isPublic: Boolean(pay.isPublic),
  };
  if (!isExisting) {
    base.uploadedByUid = actorUid;
  }
  return base;
}

export function prepareRestoredPaidCampaignPayload(
  camp: PaidCampaignRecord,
  actorUid: string,
  isExisting: boolean,
): Record<string, unknown> {
  const base = pickAllowedKeys(
    camp as unknown as Record<string, unknown>,
    PAID_CAMPAIGN_RESTORE_KEYS,
  );
  if (!isExisting) {
    base.createdByUid = actorUid;
  }
  return base;
}

export function prepareRestoredIpoPayload(
  ipo: ManagedIpoRecord,
  actorUid: string,
): Record<string, unknown> {
  const base = pickAllowedKeys(ipo as unknown as Record<string, unknown>, IPO_RESTORE_KEYS);
  base.updatedByUid = actorUid;
  return base;
}

