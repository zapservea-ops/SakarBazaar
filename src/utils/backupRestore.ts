import type {
  AuditLogRecord,
  AuthorizedEmailRecord,
  BackupCollectionConflictPreview,
  BackupCollectionScopeInfo,
  BackupConflictPolicy,
  BackupRestoreFailure,
  BackupRestorePreview,
  BackupRestoreReport,
  BackupTargetIdentity,
  LegacyOverridesRecord,
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

export const BACKUP_AUDIT_LOG_EXPORT_LIMIT = 200;

export const PRODUCTION_TARGET_IDENTITY: BackupTargetIdentity = {
  projectId: 'dark-tea-xpd8p',
  firestoreDatabaseId: 'ai-studio-efe3d2d3-00e3-4fb7-b2d9-c39abe14c8ac',
};

export const BACKUP_COLLECTION_SCOPE: BackupCollectionScopeInfo[] = [
  {
    key: 'articles',
    label: 'Editorial Articles (/articles)',
    category: 'content',
    exported: true,
    restored: true,
    restoreNote: 'Restored record-by-record with schema allowlist; existing docs skipped by default unless explicit conflict policy overrides.',
  },
  {
    key: 'media',
    label: 'Media Metadata (/media)',
    category: 'content',
    exported: true,
    restored: true,
    restoreNote: 'Restored for images and YouTube metadata (raw video binaries stay outside Firestore on YouTube/local archive).',
  },
  {
    key: 'mediaPayloads',
    label: 'Compressed Photographs (/mediaPayloads)',
    category: 'content',
    exported: true,
    restored: true,
    restoreNote: 'Restored alongside /media; subject to Firestore 1 MB Spark document limits.',
  },
  {
    key: 'paidCampaigns',
    label: 'Paid Disclosure Campaigns (/paidCampaigns)',
    category: 'operational',
    exported: true,
    restored: true,
    restoreNote: 'Restored as operational campaign disclosures linked to articles.',
  },
  {
    key: 'ipos',
    label: 'IPO Dossiers (/ipos)',
    category: 'content',
    exported: true,
    restored: true,
    restoreNote: 'Restored for verified/proposed/archived IPO schedule tracking while preserving IDs and migration keys.',
  },
  {
    key: 'legacyOverrides',
    label: 'Public Legacy Catalog Overrides (/publicCatalog/legacyOverrides)',
    category: 'operational',
    exported: true,
    restored: true,
    restoreNote: 'Restored non-destructively (union-merged when skipping existing) so suppressed static articles stay hidden publicly.',
  },
  {
    key: 'ipoSourceReviews',
    label: 'SEBI IPO Review Queue (/ipoSourceReviews)',
    category: 'operational',
    exported: true,
    restored: false,
    restoreNote: 'Exported for historical audit only; NOT automatically restored—re-run SEBI Check in Admin if needed.',
  },
  {
    key: 'auditLogs',
    label: 'Audit Logs (/auditLogs)',
    category: 'operational',
    exported: true,
    restored: false,
    exportCapNote: `Capped at latest ${BACKUP_AUDIT_LOG_EXPORT_LIMIT} records per export to stay within Firebase Spark read quotas.`,
    restoreNote: 'Append-only operational trail; never overwritten or replayed on restore.',
  },
  {
    key: 'authorizedEmails',
    label: 'Authorized User Allowlist (/authorizedEmails)',
    category: 'security_sensitive',
    exported: true,
    restored: false,
    restoreNote: 'Security-sensitive RBAC configuration; excluded from automated restore—manage manually in Section 12.',
  },
  {
    key: 'systemSettings',
    label: 'System Settings (/systemSettings)',
    category: 'security_sensitive',
    exported: true,
    restored: false,
    restoreNote: 'Security-sensitive platform defaults; excluded from automated restore—manage manually in Section 12.',
  },
];

export const BACKUP_EXCLUSION_NOTES: string[] = [
  'Security-sensitive RBAC allowlist (/authorizedEmails) and system configuration (/systemSettings) are exported for inspection only and excluded from restore.',
  'Append-only audit trail (/auditLogs, capped at 200 entries) and SEBI review queue (/ipoSourceReviews) are excluded from restore.',
  'External media payloads and binary video files (YouTube streams / local video archives / static bundled assets under public/assets/) are not stored or restored as mediaPayloads binary blobs.',
];

export const NON_ATOMIC_RESTORE_WARNING =
  'Firestore backup restoration runs sequentially record-by-record rather than inside one atomic cross-collection transaction. Partial failures are isolated and reported per document for manual follow-up.';

export function buildInitialBackupRestoreReport(
  bundle: SakarBazaarBackupBundle,
  startedAt: string = new Date().toISOString(),
  opts?: {
    targetIdentity?: BackupTargetIdentity;
    conflictPolicy?: BackupConflictPolicy;
  },
): BackupRestoreReport {
  return {
    startedAt,
    completedAt: startedAt,
    targetProjectId: opts?.targetIdentity?.projectId,
    targetDatabaseId: opts?.targetIdentity?.firestoreDatabaseId,
    conflictPolicy: opts?.conflictPolicy ?? 'skip_existing',
    nonAtomicWarning: NON_ATOMIC_RESTORE_WARNING,
    restoredByCollection: {
      articles: 0,
      media: 0,
      mediaPayloads: 0,
      paidCampaigns: 0,
      ipos: 0,
      legacyOverrides: 0,
    },
    skippedExistingByCollection: {
      articles: 0,
      media: 0,
      mediaPayloads: 0,
      paidCampaigns: 0,
      ipos: 0,
      legacyOverrides: 0,
    },
    skippedCollections: [
      {
        collection: 'ipoSourceReviews',
        countInBackup: bundle.data.ipoSourceReviews?.length ?? 0,
        category: 'operational',
        reason: 'SEBI diff review queue is exported for archive only; skipped during restore to preserve current editorial review decisions.',
      },
      {
        collection: 'auditLogs',
        countInBackup: bundle.data.auditLogs?.length ?? 0,
        category: 'operational',
        reason: `Append-only audit trail (capped at latest ${BACKUP_AUDIT_LOG_EXPORT_LIMIT} entries on export); never overwritten during restore.`,
      },
      {
        collection: 'authorizedEmails',
        countInBackup: bundle.data.authorizedEmails?.length ?? 0,
        category: 'security_sensitive',
        reason: 'Security-sensitive user role allowlist requires manual review in Section 12; never auto-restored.',
      },
      {
        collection: 'systemSettings',
        countInBackup: bundle.data.systemSettings?.length ?? 0,
        category: 'security_sensitive',
        reason: 'Security-sensitive system configuration requires manual review in Section 12; never auto-restored.',
      },
    ],
    failed: [] as BackupRestoreFailure[],
    manualInterventionRequired: [],
  };
}

export function buildSakarBazaarBackupBundle(params: {
  exportedByUid: string;
  exportedByEmail: string;
  sourceProjectId?: string;
  sourceDatabaseId?: string;
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
  legacyOverrides?: LegacyOverridesRecord | null;
}): SakarBazaarBackupBundle {
  return {
    schemaVersion: '1.0.0',
    app: 'SakarBazaar',
    ...(params.sourceProjectId ? { sourceProjectId: params.sourceProjectId } : {}),
    ...(params.sourceDatabaseId ? { sourceDatabaseId: params.sourceDatabaseId } : {}),
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
      ...(params.legacyOverrides !== undefined ? { legacyOverrides: params.legacyOverrides } : {}),
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
  if (!bundle.sourceProjectId || !bundle.sourceDatabaseId) {
    warnings.push('Backup metadata does not declare sourceProjectId/sourceDatabaseId; verify target database identity carefully before restoring.');
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
      errors.push('Invalid article entry missing id or slug.');
      break;
    }
  }

  for (const ipo of ipos) {
    if (!ipo?.id || !ipo?.slug || !ipo?.companyName) {
      errors.push('Invalid IPO entry missing id, slug, or companyName.');
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
    const isStaticBundled = Boolean(item.storagePath && item.storagePath.startsWith('public/assets/'));
    if (item.mediaType?.startsWith('image/') && !isStaticBundled && !payloadIds.has(item.id)) {
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

export function isProductionDatabaseTarget(target: BackupTargetIdentity): boolean {
  return (
    target.projectId === PRODUCTION_TARGET_IDENTITY.projectId ||
    target.firestoreDatabaseId === PRODUCTION_TARGET_IDENTITY.firestoreDatabaseId
  );
}

export function verifyRestoreTargetIdentity(params: {
  activeTarget: BackupTargetIdentity;
  confirmedProjectId: string;
  confirmedDatabaseId: string;
}): { ok: boolean; error?: string } {
  const proj = params.confirmedProjectId.trim();
  const dbId = params.confirmedDatabaseId.trim();
  if (!proj || !dbId) {
    return {
      ok: false,
      error: 'Enter both the target Firebase Project ID and Firestore Database ID to confirm restore destination.',
    };
  }
  if (
    isProductionDatabaseTarget(params.activeTarget) ||
    isProductionDatabaseTarget({ projectId: proj, firestoreDatabaseId: dbId })
  ) {
    return {
      ok: false,
      error: `Safety block: "${PRODUCTION_TARGET_IDENTITY.projectId}" / "${PRODUCTION_TARGET_IDENTITY.firestoreDatabaseId}" is the protected live production database. Automated/UI backup restore is unconditionally blocked for production; execute restore ONLY against an isolated test project/database or local emulator.`,
    };
  }
  if (proj !== params.activeTarget.projectId || dbId !== params.activeTarget.firestoreDatabaseId) {
    return {
      ok: false,
      error: `Target database mismatch: entered (${proj} / ${dbId}) does not match active runtime database (${params.activeTarget.projectId} / ${params.activeTarget.firestoreDatabaseId}). Restore aborted.`,
    };
  }
  return { ok: true };
}

export function buildBackupRestorePreview(params: {
  bundle: SakarBazaarBackupBundle;
  targetIdentity: BackupTargetIdentity;
  conflictPolicy?: BackupConflictPolicy;
  existingIds: {
    articles?: ReadonlySet<string>;
    media?: ReadonlySet<string>;
    mediaPayloads?: ReadonlySet<string>;
    paidCampaigns?: ReadonlySet<string>;
    ipos?: ReadonlySet<string>;
  };
}): BackupRestorePreview {
  const { bundle, targetIdentity } = params;
  const conflictPolicy: BackupConflictPolicy = params.conflictPolicy ?? 'skip_existing';
  const validation = validateBackupBundle(bundle);
  const warnings = [...validation.warnings];

  const sourceProjectId = bundle.sourceProjectId ?? null;
  const sourceDatabaseId = bundle.sourceDatabaseId ?? null;
  const identityMatchesSource =
    sourceProjectId && sourceDatabaseId
      ? sourceProjectId === targetIdentity.projectId &&
        sourceDatabaseId === targetIdentity.firestoreDatabaseId
      : null;

  if (identityMatchesSource === false) {
    warnings.push(
      `Backup exported from (${sourceProjectId}/${sourceDatabaseId}), whereas active target is (${targetIdentity.projectId}/${targetIdentity.firestoreDatabaseId}).`,
    );
  }
  if (isProductionDatabaseTarget(targetIdentity)) {
    warnings.push(
      'Active target is the production database. Never run restore tests against production; use an isolated test project or local emulator.',
    );
  }

  function previewCollection(
    collection: BackupCollectionConflictPreview['collection'],
    ids: string[],
    existingSet?: ReadonlySet<string>,
  ): BackupCollectionConflictPreview {
    const existingConflictIds: string[] = [];
    const newCreateIds: string[] = [];
    for (const id of ids) {
      if (existingSet?.has(id)) {
        existingConflictIds.push(id);
      } else {
        newCreateIds.push(id);
      }
    }
    return {
      collection,
      inBackupCount: ids.length,
      existingConflictIds,
      newCreateIds,
    };
  }

  const d = bundle.data ?? {
    articles: [],
    media: [],
    mediaPayloads: [],
    paidCampaigns: [],
    ipos: [],
    ipoSourceReviews: [],
    auditLogs: [],
    authorizedEmails: [],
    systemSettings: [],
  };

  const conflictsByCollection: BackupCollectionConflictPreview[] = [
    previewCollection('articles', (d.articles ?? []).map((a) => a.id), params.existingIds.articles),
    previewCollection('media', (d.media ?? []).map((m) => m.id), params.existingIds.media),
    previewCollection(
      'mediaPayloads',
      (d.mediaPayloads ?? []).map((p) => p.mediaId || p.id),
      params.existingIds.mediaPayloads,
    ),
    previewCollection(
      'paidCampaigns',
      (d.paidCampaigns ?? []).map((c) => c.id),
      params.existingIds.paidCampaigns,
    ),
    previewCollection('ipos', (d.ipos ?? []).map((i) => i.id), params.existingIds.ipos),
  ];

  const totalExistingConflicts = conflictsByCollection.reduce(
    (sum, c) => sum + c.existingConflictIds.length,
    0,
  );

  if (totalExistingConflicts > 0 && conflictPolicy === 'fail_on_conflict') {
    warnings.push(
      `${totalExistingConflicts} document conflict(s) detected and policy is Fail on Conflict — execution will abort cleanly without modifying existing documents.`,
    );
  }

  const initReport = buildInitialBackupRestoreReport(bundle, undefined, {
    targetIdentity,
    conflictPolicy,
  });

  return {
    valid: validation.valid,
    sourceProjectId,
    sourceDatabaseId,
    targetProjectId: targetIdentity.projectId,
    targetDatabaseId: targetIdentity.firestoreDatabaseId,
    identityMatchesSource,
    conflictPolicy,
    expectedCounts: {
      articles: d.articles?.length ?? 0,
      media: d.media?.length ?? 0,
      mediaPayloads: d.mediaPayloads?.length ?? 0,
      paidCampaigns: d.paidCampaigns?.length ?? 0,
      ipos: d.ipos?.length ?? 0,
      legacyOverrides: d.legacyOverrides ? 1 : 0,
    },
    conflictsByCollection,
    totalExistingConflicts,
    skippedCollections: initReport.skippedCollections,
    exclusions: BACKUP_EXCLUSION_NOTES,
    errors: validation.errors,
    warnings,
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
  'migrationKey',
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
  'previousVerificationStatus',
  'isArchived',
  'deletionStatus',
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
  base.isArchived = Boolean(ipo.isArchived);
  base.deletionStatus = ipo.deletionStatus ?? 'none';
  base.updatedByUid = actorUid;
  return base;
}
