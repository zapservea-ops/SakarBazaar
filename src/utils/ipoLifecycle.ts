import type { SebiIpoFiling } from '../data/sebiIpoData';
import type {
  AuditLogRecord,
  IpoCatalogClassificationType,
  IpoCatalogRecordClassification,
  IpoConflictItem,
  IpoConflictReport,
  IpoIdentityMatchType,
  IpoManagementCategory,
  IpoManagementSortField,
  IpoRow,
  IpoRowActionId,
  IpoSegment,
  IpoSourceDiffItem,
  IpoSourceReviewRecord,
  ManagedIpoRecord,
  StoredArticleDoc,
  UnifiedIpoPreviewEntry,
  UnifiedManagedIpoItem,
} from '../types/sakarbazaar';

const GENERIC_PORTAL_URLS = new Set([
  'https://www.sebi.gov.in',
  'https://www.sebi.gov.in/',
  'https://www.sebi.gov.in/sebiweb/home/homeaction.do?dolisting=yes&sid=3&ssid=15&smid=11',
  'https://www.nseindia.com',
  'https://www.bseindia.com',
]);

/**
 * Returns current date string YYYY-MM-DD in Asia/Kolkata (IST).
 */
export function getIstDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/**
 * Parses either YYYY-MM-DD or common Indian editorial dates (e.g. "19 Nov 2026") into YYYY-MM-DD.
 * Returns null if unparseable or annotated as unverified/TBD.
 */
export function normalizeToIsoDate(raw: string | null | undefined): string | null {
  const clean = (raw ?? '').trim();
  if (!clean || /not announced|tbd|pending|unverified/i.test(clean)) {
    return null;
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (isoMatch) return clean;

  const months: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };
  const dmyMatch = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(clean);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const monKey = dmyMatch[2].slice(0, 3).toLowerCase();
    const mon = months[monKey];
    if (mon) {
      return `${dmyMatch[3]}-${mon}-${day}`;
    }
  }
  return null;
}

/**
 * Automatically calculates IPO lifecycle status using official opening/closing/listing dates in IST.
 * NEVER uses SEBI filing date as issue opening date.
 * Preserves explicit Archive / Unpublish / Deletion lifecycle states cleanly.
 */
export function calculateIpoStatusFromDates(params: {
  openingDate?: string | null;
  closingDate?: string | null;
  listingDate?: string | null;
  verificationStatus?: ManagedIpoRecord['verificationStatus'];
  currentStatus?: ManagedIpoRecord['status'];
  isArchived?: boolean;
  deletionStatus?: ManagedIpoRecord['deletionStatus'];
  todayIst?: string;
}): ManagedIpoRecord['status'] {
  if (params.deletionStatus === 'deleted' || params.currentStatus === 'Deleted') {
    return 'Deleted';
  }
  if (
    params.deletionStatus === 'pending_approval' ||
    params.deletionStatus === 'approved' ||
    params.currentStatus === 'Pending Deletion'
  ) {
    return 'Pending Deletion';
  }
  if (params.isArchived || params.verificationStatus === 'archived' || params.currentStatus === 'Archived') {
    return 'Archived';
  }
  if (params.verificationStatus === 'rejected' || params.currentStatus === 'Rejected') {
    return 'Rejected';
  }
  if (params.verificationStatus === 'unpublished' || params.currentStatus === 'Unpublished') {
    return 'Unpublished';
  }
  if (params.currentStatus === 'Draft' && params.verificationStatus !== 'verified') {
    return 'Draft';
  }

  if (
    params.verificationStatus === 'awaiting_verification' ||
    params.verificationStatus === 'proposed'
  ) {
    return 'Awaiting Verification';
  }

  const today = params.todayIst ?? getIstDateString();
  const openIso = normalizeToIsoDate(params.openingDate);
  const closeIso = normalizeToIsoDate(params.closingDate);
  const listIso = normalizeToIsoDate(params.listingDate);

  if (listIso && today >= listIso) {
    return 'Listed';
  }
  if (closeIso && today > closeIso) {
    return 'Closed';
  }
  if (openIso && today >= openIso && (!closeIso || today <= closeIso)) {
    return 'Open';
  }
  return 'Upcoming';
}

export function isIpoPubliclyVisible(ipo: {
  verificationStatus?: string;
  status?: string;
  isArchived?: boolean;
  deletionStatus?: string;
}): boolean {
  if (ipo.verificationStatus !== 'verified') return false;
  if (ipo.isArchived) return false;
  if (
    ipo.status === 'Draft' ||
    ipo.status === 'Awaiting Verification' ||
    ipo.status === 'Rejected' ||
    ipo.status === 'Archived' ||
    ipo.status === 'Unpublished' ||
    ipo.status === 'Pending Deletion' ||
    ipo.status === 'Deleted'
  ) {
    return false;
  }
  if (ipo.deletionStatus && ipo.deletionStatus !== 'none') return false;
  return true;
}

export function formatOfficialIpoField(value: string | null | undefined): string {
  const clean = (value ?? '').trim();
  return clean || 'Not announced';
}

export interface DetectedIpoCandidate {
  id?: string;
  migrationKey?: string;
  companyName: string;
  segment: IpoSegment;
  issueSize?: string;
  priceBand?: string;
  lotSize?: string;
  filingDate?: string;
  openingDate?: string;
  closingDate?: string;
  listingDate?: string;
  offerType?: string;
  documentType?: string;
  documentUrl?: string;
  officialDocuments?: string[];
  sourceName: string;
  sourceUrl: string;
  summary?: string;
}

export function normalizeIpoCompanyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(limited|ltd\.?|private|pvt\.?)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeSpecificDocumentUrl(rawUrl: string | undefined | null): string | null {
  const clean = (rawUrl ?? '').trim().toLowerCase().replace(/#.*$/, '');
  if (!clean || !clean.startsWith('http')) return null;
  if (GENERIC_PORTAL_URLS.has(clean) || GENERIC_PORTAL_URLS.has(clean.replace(/\/$/, ''))) {
    return null;
  }
  return clean;
}

function simpleHash36(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Generates a stable, idempotent migrationKey for an IPO offering.
 * Anchors identity on official SEBI filing/document URLs + filing/opening date + segment,
 * never solely on company name + segment, so repeat offerings & company renames stay safe.
 */
export function buildStableIpoMigrationKey(candidate: {
  migrationKey?: string;
  companyName: string;
  segment: IpoSegment;
  filingDate?: string | null;
  openingDate?: string | null;
  listingDate?: string | null;
  offerType?: string | null;
  documentUrl?: string | null;
  sourceUrl?: string | null;
  officialDocuments?: string[];
  id?: string;
}): string {
  if (candidate.migrationKey?.trim()) {
    return candidate.migrationKey.trim().slice(0, 120);
  }

  const specificUrls = [
    ...(candidate.officialDocuments ?? []),
    candidate.documentUrl ?? '',
    candidate.sourceUrl ?? '',
  ]
    .map((u) => normalizeSpecificDocumentUrl(u))
    .filter((u): u is string => Boolean(u));

  const seg = candidate.segment.toLowerCase();
  if (specificUrls.length > 0) {
    const primaryUrl = specificUrls[0];
    return `sebi_${seg}_${simpleHash36(primaryUrl)}`;
  }

  const companyKey = normalizeIpoCompanyKey(candidate.companyName).replace(/\s+/g, '-') || 'ipo';
  const dateAnchor =
    normalizeToIsoDate(candidate.filingDate) ||
    normalizeToIsoDate(candidate.openingDate) ||
    normalizeToIsoDate(candidate.listingDate) ||
    'undated';
  const offerKey = (candidate.offerType ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'std';
  const suffix = candidate.id ? `_${simpleHash36(candidate.id)}` : '';
  return `mig_${seg}_${companyKey.slice(0, 40)}_${dateAnchor}_${offerKey}${suffix}`.slice(0, 120);
}

function daysBetweenIsoDates(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const msA = Date.parse(`${a}T00:00:00Z`);
  const msB = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(msA) || !Number.isFinite(msB)) return null;
  return Math.abs(Math.round((msA - msB) / 86_400_000));
}

function tokenOverlapRatio(a: string, b: string): number {
  const tokA = new Set(a.split(/\s+/).filter((t) => t.length >= 2));
  const tokB = new Set(b.split(/\s+/).filter((t) => t.length >= 2));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let shared = 0;
  for (const t of tokA) {
    if (tokB.has(t)) shared++;
  }
  return shared / Math.max(tokA.size, tokB.size);
}

export interface IpoCandidateMatchAnalysis {
  matchType: IpoIdentityMatchType;
  autoMergeAllowed: boolean;
  matchedRecord?: ManagedIpoRecord;
  relatedConflictRecord?: ManagedIpoRecord;
  migrationKey: string;
  conflictWarning?: string;
}

/**
 * Evaluates candidate IPO identity against existing Firestore IPO dossiers.
 * STRICT RULE: Never auto-merges two records solely because their company names match.
 * Auto-merge is allowed ONLY on exact record ID, exact migrationKey, or exact specific SEBI document URL (same segment).
 */
export function analyzeIpoCandidateMatch(
  existingIpos: ManagedIpoRecord[],
  candidate: DetectedIpoCandidate,
): IpoCandidateMatchAnalysis {
  const migrationKey = buildStableIpoMigrationKey(candidate);

  // 1. Exact ID match
  if (candidate.id) {
    const byId = existingIpos.find((i) => i.id === candidate.id);
    if (byId) {
      return {
        matchType: 'exact_id',
        autoMergeAllowed: true,
        matchedRecord: byId,
        migrationKey: byId.migrationKey || migrationKey,
      };
    }
  }

  // 2. Exact migrationKey match (idempotent repeat sync)
  const byMig = existingIpos.find(
    (i) => i.migrationKey && i.migrationKey === migrationKey,
  );
  if (byMig) {
    return {
      matchType: 'exact_migration_key',
      autoMergeAllowed: true,
      matchedRecord: byMig,
      migrationKey,
    };
  }

  // 3. Exact specific official document URL match
  const candDocUrls = new Set(
    [
      ...(candidate.officialDocuments ?? []),
      candidate.documentUrl ?? '',
      candidate.sourceUrl ?? '',
    ]
      .map((u) => normalizeSpecificDocumentUrl(u))
      .filter((u): u is string => Boolean(u)),
  );

  if (candDocUrls.size > 0) {
    for (const existing of existingIpos) {
      const existingUrls = [
        ...(existing.officialDocuments ?? []),
        existing.sourceUrl ?? '',
      ]
        .map((u) => normalizeSpecificDocumentUrl(u))
        .filter((u): u is string => Boolean(u));

      const sharesDocUrl = existingUrls.some((u) => candDocUrls.has(u));
      if (sharesDocUrl) {
        if (existing.segment !== candidate.segment) {
          return {
            matchType: 'conflict_segment_difference',
            autoMergeAllowed: false,
            relatedConflictRecord: existing,
            migrationKey,
            conflictWarning: `Official document matches "${existing.companyName}" (${existing.id}), but segment differs (${existing.segment} vs ${candidate.segment}). Resolve manually before merging.`,
          };
        }
        const candKey = normalizeIpoCompanyKey(candidate.companyName);
        const exKey = normalizeIpoCompanyKey(existing.companyName);
        if (candKey !== exKey) {
          return {
            matchType: 'conflict_name_change_suspected',
            autoMergeAllowed: false,
            relatedConflictRecord: existing,
            migrationKey,
            conflictWarning: `Official document matches "${existing.companyName}" (${existing.id}), indicating a possible company name change to "${candidate.companyName}". Review before linking.`,
          };
        }
        return {
          matchType: 'exact_document_url',
          autoMergeAllowed: true,
          matchedRecord: existing,
          migrationKey: existing.migrationKey || migrationKey,
        };
      }
    }
  }

  // 4. Company-name & attribute comparisons: surface conflicts WITHOUT auto-merging
  const candCompanyKey = normalizeIpoCompanyKey(candidate.companyName);
  const candFiling = normalizeToIsoDate(candidate.filingDate);
  const candOpen = normalizeToIsoDate(candidate.openingDate);

  for (const existing of existingIpos) {
    const exCompanyKey = normalizeIpoCompanyKey(existing.companyName);
    const sameCompanyKey =
      candCompanyKey.length >= 3 &&
      (existing.companyName.trim().toLowerCase() === candidate.companyName.trim().toLowerCase() ||
        exCompanyKey === candCompanyKey);

    if (sameCompanyKey) {
      if (existing.segment !== candidate.segment) {
        return {
          matchType: 'conflict_segment_difference',
          autoMergeAllowed: false,
          relatedConflictRecord: existing,
          migrationKey,
          conflictWarning: `Segment difference: "${candidate.companyName}" (${candidate.segment}) matches name of existing ${existing.segment} record "${existing.companyName}" (${existing.id}). Refusing auto-merge.`,
        };
      }

      const exFiling = normalizeToIsoDate(existing.filingDate);
      const exOpen = normalizeToIsoDate(existing.openingDate);
      const filingGap = daysBetweenIsoDates(candFiling, exFiling);
      const openGap = daysBetweenIsoDates(candOpen, exOpen);
      const isRepeatOffering =
        (filingGap !== null && filingGap > 30) ||
        (openGap !== null && openGap > 30) ||
        (Boolean(candidate.offerType && existing.offerType) &&
          candidate.offerType?.trim().toLowerCase() !== existing.offerType?.trim().toLowerCase());

      if (isRepeatOffering) {
        return {
          matchType: 'conflict_repeat_offering_candidate',
          autoMergeAllowed: false,
          relatedConflictRecord: existing,
          migrationKey,
          conflictWarning: `Repeat offering suspected for "${candidate.companyName}" compared to ${existing.id} (filing/issue dates or offer type differ). Treat as separate offering unless verified.`,
        };
      }

      return {
        matchType: 'conflict_potential_duplicate_name',
        autoMergeAllowed: false,
        relatedConflictRecord: existing,
        migrationKey,
        conflictWarning: `Potential duplicate company name "${candidate.companyName}" matches ${existing.id} without a shared migrationKey or official document URL. Manual review required before linking.`,
      };
    }

    // 5. Name-change suspect check (same filing date + same issueSize OR high token overlap in same segment & date)
    if (existing.segment === candidate.segment && candFiling && normalizeToIsoDate(existing.filingDate) === candFiling) {
      const overlap = tokenOverlapRatio(candCompanyKey, exCompanyKey);
      const sameIssueSize =
        Boolean(candidate.issueSize?.trim()) &&
        candidate.issueSize?.trim().toLowerCase() === existing.issueSize?.trim().toLowerCase();
      if (overlap >= 0.5 || sameIssueSize) {
        return {
          matchType: 'conflict_name_change_suspected',
          autoMergeAllowed: false,
          relatedConflictRecord: existing,
          migrationKey,
          conflictWarning: `Possible company name change or duplicate filing on ${candFiling}: "${candidate.companyName}" vs existing "${existing.companyName}" (${existing.id}).`,
        };
      }
    }
  }

  return {
    matchType: 'no_match',
    autoMergeAllowed: false,
    migrationKey,
  };
}

/**
 * Legacy helper retained for unit/call compatibility.
 * Note: For new migration/merge workflows, always use `analyzeIpoCandidateMatch` which
 * detects conflicts and refuses silent merges when identities differ.
 */
export function findMatchingManagedIpo<T extends { id?: string; companyName: string; migrationKey?: string }>(
  ipos: T[],
  companyName: string,
  migrationKey?: string,
): T | undefined {
  if (migrationKey) {
    const byKey = ipos.find((i) => i.migrationKey === migrationKey);
    if (byKey) return byKey;
  }
  const exactLower = companyName.trim().toLowerCase();
  const exact = ipos.find((i) => i.companyName.trim().toLowerCase() === exactLower);
  if (exact) return exact;
  const targetKey = normalizeIpoCompanyKey(companyName);
  if (!targetKey || targetKey.length < 3) return undefined;
  return ipos.find((i) => normalizeIpoCompanyKey(i.companyName) === targetKey);
}

export function computeDiffFingerprint(diffs: IpoSourceDiffItem[]): string {
  return diffs
    .map((d) => `${d.field}=${d.detectedValue}`)
    .sort()
    .join('|');
}

export function hasDuplicateIpoReview(
  existingReviews: Array<{
    companyName: string;
    segment?: IpoSegment;
    targetIpoId?: string;
    migrationKey?: string;
    reviewStatus: 'Needs Review' | 'Approved' | 'Rejected';
    diffs?: IpoSourceDiffItem[];
  }>,
  companyName: string,
  candidateDiffs: IpoSourceDiffItem[],
  opts?: {
    segment?: IpoSegment;
    targetIpoId?: string;
    migrationKey?: string;
  },
): boolean {
  const candKey = normalizeIpoCompanyKey(companyName);
  const candExact = companyName.trim().toLowerCase();
  const candSig = computeDiffFingerprint(candidateDiffs);

  for (const rev of existingReviews) {
    if (opts?.migrationKey && rev.migrationKey) {
      if (opts.migrationKey !== rev.migrationKey) continue;
    } else if (opts?.segment && rev.segment && opts.segment !== rev.segment) {
      // Never suppress an SME review solely because a Mainboard review exists for a similar name
      continue;
    }

    const sameTargetId = Boolean(opts?.targetIpoId && rev.targetIpoId && opts.targetIpoId === rev.targetIpoId);
    const revExact = rev.companyName.trim().toLowerCase();
    const revKey = normalizeIpoCompanyKey(rev.companyName);
    const sameCompany = sameTargetId || revExact === candExact || (candKey.length >= 3 && revKey === candKey);
    if (!sameCompany) continue;

    if (rev.reviewStatus === 'Needs Review') {
      if (!opts?.migrationKey && !rev.migrationKey && opts?.targetIpoId !== rev.targetIpoId) {
        continue;
      }
      return true;
    }
    if (candSig && computeDiffFingerprint(rev.diffs ?? []) === candSig) {
      return true;
    }
  }
  return false;
}

export function detectIpoFieldDiffs(
  existing: Partial<ManagedIpoRecord> | null | undefined,
  candidate: DetectedIpoCandidate,
): IpoSourceDiffItem[] {
  const fields: Array<{ key: keyof DetectedIpoCandidate & keyof ManagedIpoRecord; label: string }> = [
    { key: 'segment', label: 'Segment' },
    { key: 'issueSize', label: 'Issue Size' },
    { key: 'priceBand', label: 'Price Band' },
    { key: 'lotSize', label: 'Lot Size' },
    { key: 'filingDate', label: 'SEBI Filing Date' },
    { key: 'openingDate', label: 'Opening Date' },
    { key: 'closingDate', label: 'Closing Date' },
    { key: 'listingDate', label: 'Listing Date' },
  ];

  const diffs: IpoSourceDiffItem[] = [];
  for (const f of fields) {
    const prevVal = String(existing?.[f.key] ?? '').trim() || 'Not announced';
    const nextVal = String(candidate[f.key] ?? '').trim();
    if (nextVal && nextVal !== prevVal) {
      diffs.push({
        field: String(f.key),
        label: f.label,
        previousValue: prevVal,
        detectedValue: nextVal,
      });
    }
  }

  const candidateDocs = [
    ...(candidate.officialDocuments ?? []),
    candidate.documentUrl ?? '',
    candidate.sourceUrl ?? '',
  ]
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
  const uniqueCandidateDocs = [...new Set(candidateDocs)];
  const existingDocs = new Set(
    [...(existing?.officialDocuments ?? []), existing?.sourceUrl ?? '']
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean),
  );
  const newOfficialDoc = uniqueCandidateDocs.find((u) => !existingDocs.has(u.toLowerCase()));
  if (newOfficialDoc && (!existing || diffs.length > 0 || existingDocs.size === 0)) {
    diffs.push({
      field: 'officialDocument',
      label: candidate.documentType ? `Official SEBI ${candidate.documentType}` : 'Official SEBI Document',
      previousValue: existing?.sourceUrl?.trim() || 'Not announced',
      detectedValue: newOfficialDoc,
    });
  }

  return diffs;
}

const SAMPLE_OR_FIXTURE_MARKER_REGEX =
  /\b(sample|demo|demonstration|fixture|mock|placeholder|dummy|acme|test[-_ ]?ipo)\b/i;

function extractLooseIsoDate(raw: string | null | undefined): string | null {
  const strict = normalizeToIsoDate(raw);
  if (strict) return strict;
  const clean = (raw ?? '').replace(/\([^)]*\)/g, '').trim();
  if (!clean) return null;
  return normalizeToIsoDate(clean);
}

/**
 * Classifies each built-in IPO_ALL_RECORDS entry strictly by inspecting its actual identifiers,
 * company substance, dates, official/editorial citations, and public routing rather than
 * labelling the entire static catalogue as sample/fixture data.
 */
export function classifyBuiltInIpoCatalogRecord(
  record: IpoRow,
  todayIso: string = getIstDateString(),
): IpoCatalogRecordClassification {
  const publicRoutes = [
    '/ipo',
    `/ipo/${record.slug}`,
    '/search',
    '/watchlist',
    ...(record.verificationStatus === 'verified' ? ['/calendar'] : []),
  ];

  const candidateText = [record.id, record.slug, record.company, record.sourceName]
    .filter(Boolean)
    .join(' ');
  const hasExplicitSampleMarker =
    !record.company?.trim() ||
    record.company.trim().length < 3 ||
    SAMPLE_OR_FIXTURE_MARKER_REGEX.test(candidateText);

  if (hasExplicitSampleMarker) {
    return {
      recordId: record.id,
      slug: record.slug,
      companyName: record.company || '(Unnamed)',
      segment: record.segment,
      status: record.status,
      verificationStatus: record.verificationStatus,
      openDate: record.openDate ?? null,
      closeDate: record.closeDate ?? null,
      listingDate: record.listingDate ?? null,
      inPublicWebsite: false,
      inManagementPreview: false,
      classification: 'demonstration_sample',
      evidence: 'Contains explicit sample/demo/fixture/placeholder identifier or lacks valid company name.',
      publicRoutes,
      conflictStatus: 'none',
      relatedFirestoreIds: [],
      potentialDuplicateIds: [],
    };
  }

  const listIso = extractLooseIsoDate(record.listingDate);
  const closeIso = extractLooseIsoDate(record.closeDate);
  const openIso = extractLooseIsoDate(record.openDate);
  const hasRealCompanySubstance = Boolean(
    record.sellingShareholder?.trim() ||
      record.offerType?.trim() ||
      (record.financialMetrics && record.financialMetrics.length > 0) ||
      record.relatedArticleSlug?.trim() ||
      (record.officialDocuments && record.officialDocuments.length > 0) ||
      record.sourceUrl?.trim(),
  );

  if (
    record.status === 'Listed' ||
    (listIso && listIso < todayIso) ||
    (closeIso && closeIso < todayIso)
  ) {
    return {
      recordId: record.id,
      slug: record.slug,
      companyName: record.company,
      segment: record.segment,
      status: record.status,
      verificationStatus: record.verificationStatus,
      openDate: record.openDate ?? null,
      closeDate: record.closeDate ?? null,
      listingDate: record.listingDate ?? null,
      inPublicWebsite: true,
      inManagementPreview: true,
      classification: 'genuine_historical',
      evidence: `Genuine historical IPO record (status=${record.status}, closeDate=${record.closeDate ?? 'n/a'}, listingDate=${record.listingDate ?? 'n/a'}, live public routes: ${publicRoutes.join(', ')}).`,
      publicRoutes,
      conflictStatus: 'none',
      relatedFirestoreIds: [],
      potentialDuplicateIds: [],
    };
  }

  if (
    hasRealCompanySubstance ||
    (openIso && openIso >= todayIso) ||
    (closeIso && closeIso >= todayIso) ||
    ['Proposed OFS', 'Open', 'Upcoming', 'Closed'].includes(record.status)
  ) {
    return {
      recordId: record.id,
      slug: record.slug,
      companyName: record.company,
      segment: record.segment,
      status: record.status,
      verificationStatus: record.verificationStatus,
      openDate: record.openDate ?? null,
      closeDate: record.closeDate ?? null,
      listingDate: record.listingDate ?? null,
      inPublicWebsite: true,
      inManagementPreview: true,
      classification: 'genuine_current',
      evidence: `Genuine current editorial IPO dossier (${record.offerType || record.segment}${record.sellingShareholder ? `; promoter/seller: ${record.sellingShareholder}` : ''}; dates: ${record.openDate ?? 'TBA'} – ${record.closeDate ?? 'TBA'}; live public routes: ${publicRoutes.join(', ')}).`,
      publicRoutes,
      conflictStatus: 'none',
      relatedFirestoreIds: [],
      potentialDuplicateIds: [],
    };
  }

  return {
    recordId: record.id,
    slug: record.slug,
    companyName: record.company,
    segment: record.segment,
    status: record.status,
    verificationStatus: record.verificationStatus,
    openDate: record.openDate ?? null,
    closeDate: record.closeDate ?? null,
    listingDate: record.listingDate ?? null,
    inPublicWebsite: true,
    inManagementPreview: true,
    classification: 'unknown_review',
    evidence: 'Static record lacks clear historical/current schedule dates or structured offering citations; classify manually before any action.',
    publicRoutes,
    conflictStatus: 'needs_review',
    relatedFirestoreIds: [],
    potentialDuplicateIds: [],
  };
}

/**
 * Builds a unified read-only management preview combining all Firestore IPO records and all
 * genuine historical/current built-in IPO records while preserving original IDs, dates, and
 * public visibility, and surfacing potential duplicates WITHOUT automatically merging them.
 */
export function buildUnifiedIpoManagementPreview(params: {
  firestoreIpos: ManagedIpoRecord[];
  staticIpos: IpoRow[];
  todayIso?: string;
}): UnifiedIpoPreviewEntry[] {
  const todayIso = params.todayIso ?? getIstDateString();
  const entries: UnifiedIpoPreviewEntry[] = [];

  for (const fsIpo of params.firestoreIpos) {
    entries.push({
      origin: 'firestore',
      id: fsIpo.id,
      slug: fsIpo.slug,
      companyName: fsIpo.companyName,
      segment: fsIpo.segment,
      status: fsIpo.status,
      verificationStatus: fsIpo.verificationStatus,
      openDate: fsIpo.openingDate ?? null,
      closeDate: fsIpo.closingDate ?? null,
      listingDate: fsIpo.listingDate ?? null,
      isPubliclyVisible: isIpoPubliclyVisible(fsIpo),
      classification: 'firestore_managed',
      potentialDuplicateIds: [],
      notes: fsIpo.migrationKey
        ? `Firestore dossier (key ${fsIpo.migrationKey})`
        : 'Firestore dossier (missing migrationKey)',
    });
  }

  const firestoreSlugs = new Set(params.firestoreIpos.map((i) => i.slug));

  for (const st of params.staticIpos) {
    const cls = classifyBuiltInIpoCatalogRecord(st, todayIso);
    if (cls.classification === 'demonstration_sample') {
      continue;
    }
    const shadowedByFirestore = firestoreSlugs.has(st.slug);
    entries.push({
      origin: 'static_catalog',
      id: st.id,
      slug: st.slug,
      companyName: st.company,
      segment: st.segment,
      status: st.status,
      verificationStatus: st.verificationStatus ?? 'proposed',
      openDate: st.openDate ?? null,
      closeDate: st.closeDate ?? null,
      listingDate: st.listingDate ?? null,
      isPubliclyVisible: !shadowedByFirestore,
      classification: cls.classification,
      potentialDuplicateIds: [],
      notes: shadowedByFirestore
        ? `Built-in ${cls.classification} (publicly shadowed by Firestore slug "${st.slug}")`
        : cls.evidence,
    });
  }

  // Flag potential duplicates across unified rows strictly by normalized company key without auto-merging
  for (let i = 0; i < entries.length; i++) {
    const keyI = normalizeIpoCompanyKey(entries[i].companyName);
    if (keyI.length < 3) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const keyJ = normalizeIpoCompanyKey(entries[j].companyName);
      if (keyI === keyJ) {
        entries[i].potentialDuplicateIds.push(entries[j].id);
        entries[j].potentialDuplicateIds.push(entries[i].id);
      }
    }
  }

  return entries;
}

/**
 * Generates an actionable historical IPO conflict & duplicate report before any migration,
 * detecting name changes, repeat offerings, segment differences, missing migration keys,
 * and classifying built-in static IPOs individually with evidence (never blanket sample exclusion).
 */
export function buildHistoricalIpoConflictReport(params: {
  firestoreIpos: ManagedIpoRecord[];
  staticIpos?: IpoRow[];
  candidates?: DetectedIpoCandidate[];
  todayIso?: string;
}): IpoConflictReport {
  const items: IpoConflictItem[] = [];
  const firestoreIpos = params.firestoreIpos;
  const staticIpos = params.staticIpos ?? [];
  const todayIso = params.todayIso ?? getIstDateString();

  // 1. Check Firestore records pairwise & for missing migrationKeys
  for (let i = 0; i < firestoreIpos.length; i++) {
    const a = firestoreIpos[i];
    if (!a.migrationKey) {
      items.push({
        conflictType: 'missing_migration_key',
        severity: 'warning',
        sourceOrigin: 'firestore',
        recordId: a.id,
        companyName: a.companyName,
        segment: a.segment,
        recommendedAction: `Assign stable migrationKey (suggested: ${buildStableIpoMigrationKey(a)}) in a dry-run report before any bulk migration.`,
        reason: 'Firestore IPO dossier relies on document ID only without an explicit migrationKey.',
      });
    }

    for (let j = i + 1; j < firestoreIpos.length; j++) {
      const b = firestoreIpos[j];
      const keyA = normalizeIpoCompanyKey(a.companyName);
      const keyB = normalizeIpoCompanyKey(b.companyName);
      const sameCompany = keyA.length >= 3 && keyA === keyB;

      if (sameCompany && a.segment !== b.segment) {
        items.push({
          conflictType: 'segment_difference',
          severity: 'blocking',
          sourceOrigin: 'firestore',
          recordId: a.id,
          companyName: a.companyName,
          segment: a.segment,
          relatedRecordId: b.id,
          relatedCompanyName: b.companyName,
          relatedSegment: b.segment,
          recommendedAction: 'Keep distinct IDs/migrationKeys; verify whether segment reclassified or two entities share a name.',
          reason: `Same normalized company name across different segments (${a.segment} vs ${b.segment}).`,
        });
      } else if (sameCompany) {
        const filingGap = daysBetweenIsoDates(normalizeToIsoDate(a.filingDate), normalizeToIsoDate(b.filingDate));
        const openGap = daysBetweenIsoDates(normalizeToIsoDate(a.openingDate), normalizeToIsoDate(b.openingDate));
        const isRepeat = (filingGap !== null && filingGap > 30) || (openGap !== null && openGap > 30);
        items.push({
          conflictType: isRepeat ? 'repeat_offering_candidate' : 'potential_duplicate_name',
          severity: isRepeat ? 'warning' : 'blocking',
          sourceOrigin: 'firestore',
          recordId: a.id,
          companyName: a.companyName,
          segment: a.segment,
          relatedRecordId: b.id,
          relatedCompanyName: b.companyName,
          relatedSegment: b.segment,
          recommendedAction: isRepeat
            ? 'Preserve both historical offerings with separate IDs and distinct migrationKeys.'
            : 'Inspect manually before archiving or removing duplicate.',
          reason: isRepeat
            ? `Likely repeat offering for ${a.companyName} (${a.openingDate || a.filingDate || 'undated'} vs ${b.openingDate || b.filingDate || 'undated'}).`
            : `Potential duplicate Firestore records with matching company name and segment (${a.id}, ${b.id}).`,
        });
      } else {
        const filingA = normalizeToIsoDate(a.filingDate);
        const filingB = normalizeToIsoDate(b.filingDate);
        if (filingA && filingB && filingA === filingB && a.segment === b.segment) {
          const overlap = tokenOverlapRatio(keyA, keyB);
          if (overlap >= 0.5) {
            items.push({
              conflictType: 'name_change_suspected',
              severity: 'warning',
              sourceOrigin: 'firestore',
              recordId: a.id,
              companyName: a.companyName,
              segment: a.segment,
              relatedRecordId: b.id,
              relatedCompanyName: b.companyName,
              relatedSegment: b.segment,
              recommendedAction: 'Confirm whether company renamed prior to DRHP/RHP update; preserve original ID if same offering.',
              reason: `High name overlap (${Math.round(overlap * 100)}%) and identical filing date ${filingA}.`,
            });
          }
        }
      }
    }
  }

  // 2. Classify each built-in static catalog IPO by evidence rather than blanket sample exclusion
  let sampleExcludedCount = 0;
  let genuineCatalogCount = 0;
  let unknownReviewCount = 0;
  const recordClassifications: IpoCatalogRecordClassification[] = [];

  for (const s of staticIpos) {
    const cls = classifyBuiltInIpoCatalogRecord(s, todayIso);
    const analysis = analyzeIpoCandidateMatch(firestoreIpos, {
      id: s.id,
      companyName: s.company,
      segment: s.segment,
      issueSize: s.issueSize ?? undefined,
      priceBand: s.priceBand ?? undefined,
      filingDate: s.filingDate ?? undefined,
      openingDate: s.openDate ?? undefined,
      closingDate: s.closeDate ?? undefined,
      listingDate: s.listingDate ?? undefined,
      offerType: s.offerType ?? undefined,
      sourceName: s.sourceName,
      sourceUrl: s.sourceUrl ?? '',
    });

    const relatedIds: string[] = [];
    if (analysis.matchedRecord) relatedIds.push(analysis.matchedRecord.id);
    if (analysis.relatedConflictRecord && !relatedIds.includes(analysis.relatedConflictRecord.id)) {
      relatedIds.push(analysis.relatedConflictRecord.id);
    }
    cls.relatedFirestoreIds = relatedIds;

    if (cls.classification === 'demonstration_sample') {
      sampleExcludedCount++;
      cls.conflictStatus = analysis.relatedConflictRecord ? 'potential_duplicate' : 'none';
      recordClassifications.push(cls);
      items.push({
        conflictType: 'sample_or_fixture_excluded',
        severity: analysis.relatedConflictRecord ? 'blocking' : 'warning',
        sourceOrigin: 'static_catalog',
        recordId: s.id,
        companyName: s.company,
        segment: s.segment,
        relatedRecordId: analysis.matchedRecord?.id ?? analysis.relatedConflictRecord?.id,
        relatedCompanyName: analysis.matchedRecord?.companyName ?? analysis.relatedConflictRecord?.companyName,
        relatedSegment: analysis.matchedRecord?.segment ?? analysis.relatedConflictRecord?.segment,
        recommendedAction: 'Exclude demonstration/sample/fixture record from production migration.',
        reason: analysis.conflictWarning || cls.evidence,
      });
      continue;
    }

    if (cls.classification === 'unknown_review') {
      unknownReviewCount++;
      cls.conflictStatus = 'needs_review';
      recordClassifications.push(cls);
      items.push({
        conflictType: 'missing_migration_key',
        severity: 'warning',
        sourceOrigin: 'static_catalog',
        recordId: s.id,
        companyName: s.company,
        segment: s.segment,
        relatedRecordId: analysis.matchedRecord?.id ?? analysis.relatedConflictRecord?.id,
        relatedCompanyName: analysis.matchedRecord?.companyName ?? analysis.relatedConflictRecord?.companyName,
        relatedSegment: analysis.matchedRecord?.segment ?? analysis.relatedConflictRecord?.segment,
        recommendedAction: 'Classify manually as historical, current, or sample before taking action.',
        reason: cls.evidence,
      });
      continue;
    }

    // Genuine historical or genuine current built-in IPO
    genuineCatalogCount++;
    if (analysis.matchedRecord) {
      cls.conflictStatus = 'matched_firestore';
    } else if (analysis.relatedConflictRecord) {
      cls.conflictStatus = 'potential_duplicate';
      const mappedType: IpoConflictItem['conflictType'] =
        analysis.matchType === 'conflict_segment_difference'
          ? 'segment_difference'
          : analysis.matchType === 'conflict_name_change_suspected'
            ? 'name_change_suspected'
            : analysis.matchType === 'conflict_repeat_offering_candidate'
              ? 'repeat_offering_candidate'
              : 'potential_duplicate_name';
      items.push({
        conflictType: mappedType,
        severity: 'blocking',
        sourceOrigin: 'static_catalog',
        recordId: s.id,
        companyName: s.company,
        segment: s.segment,
        relatedRecordId: analysis.relatedConflictRecord.id,
        relatedCompanyName: analysis.relatedConflictRecord.companyName,
        relatedSegment: analysis.relatedConflictRecord.segment,
        recommendedAction:
          'Potential duplicate/conflict between built-in genuine IPO and Firestore record; inspect in Unified Preview without auto-merging.',
        reason: analysis.conflictWarning || cls.evidence,
      });
    } else {
      cls.conflictStatus = 'none';
    }
    recordClassifications.push(cls);
  }

  // 3. Check incoming candidate conflicts
  for (const cand of params.candidates ?? []) {
    const analysis = analyzeIpoCandidateMatch(firestoreIpos, cand);
    if (!analysis.autoMergeAllowed && analysis.relatedConflictRecord) {
      const mappedType =
        analysis.matchType === 'conflict_segment_difference'
          ? 'segment_difference'
          : analysis.matchType === 'conflict_name_change_suspected'
            ? 'name_change_suspected'
            : analysis.matchType === 'conflict_repeat_offering_candidate'
              ? 'repeat_offering_candidate'
              : 'potential_duplicate_name';
      items.push({
        conflictType: mappedType,
        severity: 'blocking',
        sourceOrigin: 'sebi_candidate',
        recordId: analysis.migrationKey,
        companyName: cand.companyName,
        segment: cand.segment,
        relatedRecordId: analysis.relatedConflictRecord.id,
        relatedCompanyName: analysis.relatedConflictRecord.companyName,
        relatedSegment: analysis.relatedConflictRecord.segment,
        recommendedAction: 'Review candidate diff manually in Section 10 before creating or updating any dossier.',
        reason: analysis.conflictWarning || 'Identity ambiguity requires manual review.',
      });
    }
  }

  const unifiedPreview = buildUnifiedIpoManagementPreview({
    firestoreIpos,
    staticIpos,
    todayIso,
  });

  const previewById = new Map(
    unifiedPreview.filter((e) => e.origin === 'static_catalog').map((e) => [e.id, e]),
  );
  for (const cls of recordClassifications) {
    const matchPreview = previewById.get(cls.recordId);
    cls.inManagementPreview = Boolean(matchPreview);
    cls.potentialDuplicateIds = matchPreview ? [...matchPreview.potentialDuplicateIds] : [...cls.relatedFirestoreIds];
  }

  return {
    generatedAt: new Date().toISOString(),
    totalFirestoreIpos: firestoreIpos.length,
    totalStaticIpos: staticIpos.length,
    blockingConflictCount: items.filter((i) => i.severity === 'blocking').length,
    warningCount: items.filter((i) => i.severity === 'warning').length,
    sampleExcludedCount,
    genuineCatalogCount,
    unknownReviewCount,
    items,
    recordClassifications,
    unifiedPreview,
  };
}

export interface IpoLinkedReferencesReport {
  officialDocumentUrls: string[];
  linkedReviewIds: string[];
  pendingReviewIds: string[];
  linkedArticleIds: string[];
  linkedMediaIds: string[];
  hasBlockingPendingReviews: boolean;
  summary: string;
}

/**
 * Inspects linked official SEBI documents, active/historical source reviews, related editorial
 * articles, and attached media assets before permanently deleting a non-public IPO dossier.
 * Never removes shared articles or shared media assets when an IPO record is deleted.
 */
export function inspectIpoLinkedReferences(params: {
  ipo: ManagedIpoRecord;
  articles?: StoredArticleDoc[];
  reviews?: IpoSourceReviewRecord[];
}): IpoLinkedReferencesReport {
  const { ipo } = params;
  const articles = params.articles ?? [];
  const reviews = params.reviews ?? [];

  const officialDocumentUrls = [
    ...new Set(
      [...(ipo.officialDocuments ?? []), ipo.sourceUrl ?? '']
        .map((u) => u.trim())
        .filter((u) => /^https?:\/\//i.test(u)),
    ),
  ];
  const lowerDocUrls = new Set(officialDocumentUrls.map((u) => u.toLowerCase()));

  const linkedReviewIds: string[] = [];
  const pendingReviewIds: string[] = [];
  for (const rev of reviews) {
    const matchesTarget =
      rev.targetIpoId === ipo.id ||
      (Boolean(ipo.migrationKey) && rev.migrationKey === ipo.migrationKey);
    if (!matchesTarget) continue;
    linkedReviewIds.push(rev.id);
    if (rev.reviewStatus === 'Needs Review') {
      pendingReviewIds.push(rev.id);
    }
  }

  const companyKey = normalizeIpoCompanyKey(ipo.companyName);
  const linkedArticleIds: string[] = [];
  const linkedMediaSet = new Set<string>();

  for (const art of articles) {
    if (art.status === 'Deleted' || art.deletionStatus === 'deleted') continue;
    const sources = [
      art.sourceUrl ?? '',
      ...(art.officialSources ?? []),
    ]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const sharesDocUrl = sources.some((s) => lowerDocUrls.has(s));
    const haystack = [
      art.slug,
      ...(art.entities ?? []),
      ...(art.tags ?? []),
      art.body ?? '',
      art.enBody ?? '',
    ]
      .join(' ')
      .toLowerCase();
    const mentionsSlugOrCompany =
      (ipo.slug && haystack.includes(ipo.slug.toLowerCase())) ||
      (companyKey.length >= 4 && haystack.includes(companyKey));

    if (sharesDocUrl || mentionsSlugOrCompany) {
      linkedArticleIds.push(art.id);
      if (art.mediaId?.trim()) {
        linkedMediaSet.add(art.mediaId.trim());
      }
    }
  }

  const linkedMediaIds = [...linkedMediaSet];
  const summary = `Checked references: ${officialDocumentUrls.length} official link(s), ${linkedReviewIds.length} SEBI review(s) (${pendingReviewIds.length} Needs Review), ${linkedArticleIds.length} related article(s), ${linkedMediaIds.length} linked media asset(s) preserved.`;

  return {
    officialDocumentUrls,
    linkedReviewIds,
    pendingReviewIds,
    linkedArticleIds,
    linkedMediaIds,
    hasBlockingPendingReviews: pendingReviewIds.length > 0,
    summary,
  };
}

export function mapManagedIpoToPublicRow(doc: ManagedIpoRecord): IpoRow {
  const computedStatus = calculateIpoStatusFromDates({
    openingDate: doc.openingDate,
    closingDate: doc.closingDate,
    listingDate: doc.listingDate,
    verificationStatus: doc.verificationStatus,
    currentStatus: doc.status,
    isArchived: doc.isArchived,
    deletionStatus: doc.deletionStatus,
  });

  return {
    id: doc.id,
    slug: doc.slug,
    segment: doc.segment,
    status: computedStatus,
    verificationStatus: doc.verificationStatus,
    company: doc.companyName,
    exchange: doc.segment === 'Mainboard' ? 'NSE / BSE' : 'NSE Emerge / BSE SME',
    issueSize: doc.issueSize?.trim() || null,
    priceBand: doc.priceBand?.trim() || null,
    filingDate: doc.filingDate?.trim() || null,
    openDate: doc.openingDate?.trim() || null,
    closeDate: doc.closingDate?.trim() || null,
    allotmentDate: doc.allotmentDate?.trim() || null,
    listingDate: doc.listingDate?.trim() || null,
    offerType: doc.offerType?.trim() || null,
    sellingShareholder: doc.sellingShareholder?.trim() || null,
    summary:
      doc.summary?.trim() ||
      `${doc.companyName} (${doc.segment}) IPO tracking dossier.`,
    sourceName: doc.sourceName?.trim() || 'Official Exchange / SEBI Portal',
    sourceUrl: doc.sourceUrl?.trim() || null,
    officialDocuments: (doc.officialDocuments ?? []).map((url, idx) => ({
      id: `ipo-doc-${doc.id}-${idx}`,
      label: 'Official Filing / Notice',
      portalName: url,
      url: url.startsWith('http') ? url : null,
      note: 'Verified official IPO reference.',
    })),
    keywords: [doc.companyName, doc.segment, 'IPO', doc.offerType ?? ''].filter(Boolean),
    entities: [doc.companyName, doc.sellingShareholder ?? ''].filter(Boolean),
    aliases: [doc.companyName.toLowerCase(), doc.slug],
    lastVerifiedAt: doc.lastVerifiedAt ?? null,
  };
}

export function assertReviewPendingResolution(
  reviewStatus: string | undefined,
  companyName?: string,
): void {
  if (reviewStatus !== 'Needs Review') {
    const label = companyName ? ` for ${companyName}` : '';
    throw new Error(
      `This official SEBI review${label} has already been resolved (${reviewStatus || 'unknown'}). Refresh Data to view the updated status.`,
    );
  }
}

const PUBLIC_LIVE_IPO_STATUSES = new Set(['Upcoming', 'Open', 'Closed', 'Listed']);
const KNOWN_IPO_STATUSES = new Set([
  'Awaiting Verification',
  'Draft',
  'Rejected',
  'Proposed OFS',
  'Upcoming',
  'Open',
  'Closed',
  'Listed',
  'Archived',
  'Unpublished',
  'Pending Deletion',
  'Deleted',
]);
const KNOWN_IPO_VERIFICATION_STATUSES = new Set([
  'awaiting_verification',
  'verified',
  'unpublished',
  'archived',
  'rejected',
  'proposed',
]);
const KNOWN_IPO_DELETION_STATUSES = new Set([
  'none',
  'pending_approval',
  'approved',
  'deleted',
]);

export interface IpoDeletionEligibility {
  isPublic: boolean;
  isIncompleteLegacyRecord: boolean;
  requiresApprovalFirst: boolean;
  alreadyDeleted: boolean;
  canRequestDeletion: boolean;
  canApproveDeletion: boolean;
  canDeletePermanently: boolean;
  categoryLabel:
    | 'Public Live'
    | 'Legacy Incomplete Verified'
    | 'Deleted'
    | 'Pending Approval'
    | 'Approved For Deletion'
    | 'Archived'
    | 'Unpublished'
    | 'Draft / Awaiting Verification'
    | 'Rejected'
    | 'Non-Public';
  reason: string;
}

/**
 * Canonical IPO permanent deletion eligibility classifier with strict parity against
 * `isEligibleForIpoDeletion(existing())` in firestore.rules:
 * - Public IPOs (verified + isArchived === false + deletionStatus === 'none' + Upcoming/Open/Closed/Listed) cannot be deleted directly.
 * - `pending_approval` and `Pending Deletion` without `deletionStatus === 'approved'` CANNOT bypass deletion approval.
 * - `deleted` / `'Deleted'` terminal states cannot be deleted again.
 * - Eligible non-public records (`approved`, archived, unpublished, Draft, Awaiting Verification, Rejected, Proposed) are deletable by both Owner and Publisher.
 */
export function classifyIpoDeletionEligibility(ipo: {
  id?: string;
  verificationStatus?: string;
  status?: string;
  isArchived?: boolean;
  deletionStatus?: string;
}): IpoDeletionEligibility {
  const status = String(ipo.status ?? '');
  const verificationStatus = String(ipo.verificationStatus ?? '');
  const hasIsArchivedBool = typeof ipo.isArchived === 'boolean';
  const hasDeletionStatusStr =
    typeof ipo.deletionStatus === 'string' && ipo.deletionStatus.length > 0;
  const deletionStatus = hasDeletionStatusStr ? String(ipo.deletionStatus) : undefined;

  const isPublicRule =
    verificationStatus === 'verified' &&
    ipo.isArchived === false &&
    deletionStatus === 'none' &&
    PUBLIC_LIVE_IPO_STATUSES.has(status);

  if (deletionStatus === 'deleted' || status === 'Deleted') {
    return {
      isPublic: false,
      isIncompleteLegacyRecord: false,
      requiresApprovalFirst: false,
      alreadyDeleted: true,
      canRequestDeletion: false,
      canApproveDeletion: false,
      canDeletePermanently: false,
      categoryLabel: 'Deleted',
      reason: 'IPO record is already in terminal Deleted state.',
    };
  }

  if (isPublicRule) {
    return {
      isPublic: true,
      isIncompleteLegacyRecord: false,
      requiresApprovalFirst: false,
      alreadyDeleted: false,
      canRequestDeletion: true,
      canApproveDeletion: false,
      canDeletePermanently: false,
      categoryLabel: 'Public Live',
      reason: 'Public IPOs cannot be deleted directly. Archive, Unpublish, or mark Pending Deletion first.',
    };
  }

  if (
    deletionStatus === 'pending_approval' ||
    (status === 'Pending Deletion' && deletionStatus !== 'approved')
  ) {
    return {
      isPublic: false,
      isIncompleteLegacyRecord: false,
      requiresApprovalFirst: true,
      alreadyDeleted: false,
      canRequestDeletion: false,
      canApproveDeletion: true,
      canDeletePermanently: false,
      categoryLabel: 'Pending Approval',
      reason: 'Awaiting explicit Owner/Publisher approval ("Approve Deletion") before permanent deletion.',
    };
  }

  const eligibleByRules =
    deletionStatus === 'approved' ||
    ipo.isArchived === true ||
    status === 'Archived' ||
    status === 'Unpublished' ||
    status === 'Awaiting Verification' ||
    status === 'Draft' ||
    status === 'Rejected' ||
    verificationStatus === 'archived' ||
    verificationStatus === 'unpublished' ||
    verificationStatus === 'awaiting_verification' ||
    verificationStatus === 'rejected' ||
    verificationStatus === 'proposed';

  if (!eligibleByRules) {
    const incompleteVerified =
      verificationStatus === 'verified' && (!hasIsArchivedBool || !hasDeletionStatusStr);
    return {
      isPublic: isIpoPubliclyVisible(ipo),
      isIncompleteLegacyRecord: incompleteVerified,
      requiresApprovalFirst: false,
      alreadyDeleted: false,
      canRequestDeletion: true,
      canApproveDeletion: false,
      canDeletePermanently: false,
      categoryLabel: incompleteVerified ? 'Legacy Incomplete Verified' : 'Non-Public',
      reason: incompleteVerified
        ? 'Legacy verified IPO lacks explicit isArchived/deletionStatus defaults. Archive, Unpublish, or mark Pending Deletion & Approve before deleting.'
        : 'Record does not meet non-public deletion eligibility criteria.',
    };
  }

  let categoryLabel: IpoDeletionEligibility['categoryLabel'] = 'Non-Public';
  if (deletionStatus === 'approved') {
    categoryLabel = 'Approved For Deletion';
  } else if (ipo.isArchived === true || status === 'Archived' || verificationStatus === 'archived') {
    categoryLabel = 'Archived';
  } else if (status === 'Unpublished' || verificationStatus === 'unpublished') {
    categoryLabel = 'Unpublished';
  } else if (status === 'Rejected' || verificationStatus === 'rejected') {
    categoryLabel = 'Rejected';
  } else if (
    status === 'Draft' ||
    status === 'Awaiting Verification' ||
    verificationStatus === 'awaiting_verification' ||
    verificationStatus === 'proposed'
  ) {
    categoryLabel = 'Draft / Awaiting Verification';
  }

  return {
    isPublic: false,
    isIncompleteLegacyRecord: false,
    requiresApprovalFirst: false,
    alreadyDeleted: false,
    canRequestDeletion: deletionStatus !== 'approved',
    canApproveDeletion: false,
    canDeletePermanently: true,
    categoryLabel,
    reason: 'Eligible non-public IPO record; Owner or Publisher may execute controlled permanent deletion.',
  };
}

export interface ProductionIpoSchemaAnomaly {
  id: string;
  companyName: string;
  status: string;
  verificationStatus: string;
  isArchived: unknown;
  deletionStatus: unknown;
  issues: string[];
}

export interface ProductionIpoSchemaInventory {
  totalRecords: number;
  withIsArchivedCount: number;
  withDeletionStatusCount: number;
  missingEitherFieldCount: number;
  missingIsArchivedIds: string[];
  missingDeletionStatusIds: string[];
  missingEitherFieldIds: string[];
  verifiedLegacy2FilterCount: number;
  verifiedPublic4FilterCount: number;
  droppedUnderNewQueryIds: string[];
  archivedCount: number;
  unpublishedCount: number;
  pendingDeletionCount: number;
  draftOrAwaitingCount: number;
  rejectedCount: number;
  deletedCount: number;
  invalidOrUnknownStatuses: ProductionIpoSchemaAnomaly[];
}

/**
 * Pure read-only inventory analyzer for production /ipos documents reporting all schema,
 * visibility-query compatibility, lifecycle, and anomaly counts without modifying any data.
 */
export function buildProductionIpoSchemaInventory(
  ipos: Array<Partial<ManagedIpoRecord> & { id: string }>,
): ProductionIpoSchemaInventory {
  let withIsArchivedCount = 0;
  let withDeletionStatusCount = 0;
  const missingIsArchivedIds: string[] = [];
  const missingDeletionStatusIds: string[] = [];
  const missingEitherSet = new Set<string>();
  let verifiedLegacy2FilterCount = 0;
  let verifiedPublic4FilterCount = 0;
  const droppedUnderNewQueryIds: string[] = [];
  let archivedCount = 0;
  let unpublishedCount = 0;
  let pendingDeletionCount = 0;
  let draftOrAwaitingCount = 0;
  let rejectedCount = 0;
  let deletedCount = 0;
  const invalidOrUnknownStatuses: ProductionIpoSchemaAnomaly[] = [];

  for (const raw of ipos) {
    const id = raw.id;
    const status = String(raw.status ?? '');
    const verificationStatus = String(raw.verificationStatus ?? '');
    const hasIsArchived = typeof raw.isArchived === 'boolean';
    const hasDeletionStatus =
      typeof raw.deletionStatus === 'string' && raw.deletionStatus.length > 0;

    if (hasIsArchived) {
      withIsArchivedCount++;
    } else {
      missingIsArchivedIds.push(id);
      missingEitherSet.add(id);
    }

    if (hasDeletionStatus) {
      withDeletionStatusCount++;
    } else {
      missingDeletionStatusIds.push(id);
      missingEitherSet.add(id);
    }

    const matchesOld2Filter =
      verificationStatus === 'verified' && PUBLIC_LIVE_IPO_STATUSES.has(status);
    const matchesNew4Filter =
      matchesOld2Filter && raw.isArchived === false && raw.deletionStatus === 'none';

    if (matchesOld2Filter) verifiedLegacy2FilterCount++;
    if (matchesNew4Filter) verifiedPublic4FilterCount++;
    if (matchesOld2Filter && !matchesNew4Filter) {
      droppedUnderNewQueryIds.push(id);
    }

    if (raw.deletionStatus === 'deleted' || status === 'Deleted') {
      deletedCount++;
    } else if (
      raw.deletionStatus === 'pending_approval' ||
      raw.deletionStatus === 'approved' ||
      status === 'Pending Deletion'
    ) {
      pendingDeletionCount++;
    } else if (
      raw.isArchived === true ||
      status === 'Archived' ||
      verificationStatus === 'archived'
    ) {
      archivedCount++;
    } else if (status === 'Unpublished' || verificationStatus === 'unpublished') {
      unpublishedCount++;
    } else if (status === 'Rejected' || verificationStatus === 'rejected') {
      rejectedCount++;
    } else if (
      status === 'Draft' ||
      status === 'Awaiting Verification' ||
      verificationStatus === 'awaiting_verification' ||
      verificationStatus === 'proposed'
    ) {
      draftOrAwaitingCount++;
    }

    const issues: string[] = [];
    if (!status || !KNOWN_IPO_STATUSES.has(status)) {
      issues.push(`Unknown or missing status: "${status || '(empty)'}"`);
    }
    if (!verificationStatus || !KNOWN_IPO_VERIFICATION_STATUSES.has(verificationStatus)) {
      issues.push(
        `Unknown or missing verificationStatus: "${verificationStatus || '(empty)'}"`,
      );
    }
    if (!hasIsArchived) {
      issues.push('Missing boolean isArchived field (invisible under 4-filter public query).');
    }
    if (!hasDeletionStatus) {
      issues.push('Missing deletionStatus field (invisible under 4-filter public query).');
    } else if (!KNOWN_IPO_DELETION_STATUSES.has(String(raw.deletionStatus))) {
      issues.push(`Unknown deletionStatus: "${String(raw.deletionStatus)}"`);
    }
    if (
      verificationStatus === 'verified' &&
      (raw.isArchived === true ||
        (hasDeletionStatus && raw.deletionStatus !== 'none') ||
        (status && !PUBLIC_LIVE_IPO_STATUSES.has(status)))
    ) {
      issues.push(
        `Inconsistent verified state (status="${status}", isArchived=${String(raw.isArchived)}, deletionStatus="${String(raw.deletionStatus)}")`,
      );
    }

    if (issues.length > 0) {
      invalidOrUnknownStatuses.push({
        id,
        companyName: raw.companyName || '(Unknown Company)',
        status,
        verificationStatus,
        isArchived: raw.isArchived,
        deletionStatus: raw.deletionStatus,
        issues,
      });
    }
  }

  return {
    totalRecords: ipos.length,
    withIsArchivedCount,
    withDeletionStatusCount,
    missingEitherFieldCount: missingEitherSet.size,
    missingIsArchivedIds,
    missingDeletionStatusIds,
    missingEitherFieldIds: [...missingEitherSet],
    verifiedLegacy2FilterCount,
    verifiedPublic4FilterCount,
    droppedUnderNewQueryIds,
    archivedCount,
    unpublishedCount,
    pendingDeletionCount,
    draftOrAwaitingCount,
    rejectedCount,
    deletedCount,
    invalidOrUnknownStatuses,
  };
}

export interface IpoBackfillDryRunItem {
  id: string;
  companyName: string;
  patchFields: Partial<Pick<ManagedIpoRecord, 'isArchived' | 'deletionStatus'>>;
  wouldRestorePublicVisibility: boolean;
  note: string;
}

export interface IpoBackfillDryRunReport {
  generatedAt: string;
  dryRunOnly: true;
  recordsRequiringBackfill: number;
  droppedVerifiedRecordsRescuedCount: number;
  strategySummary: string;
  items: IpoBackfillDryRunItem[];
}

/**
 * Generates a read-only backwards-compatible dry-run backfill proposal for legacy /ipos documents
 * missing `isArchived` or `deletionStatus` so Owner can inspect exact field defaults before approving
 * any future migration or rule rollout. Executes ZERO database writes.
 */
export function buildIpoBackfillDryRunReport(
  ipos: Array<Partial<ManagedIpoRecord> & { id: string }>,
): IpoBackfillDryRunReport {
  const items: IpoBackfillDryRunItem[] = [];
  let droppedVerifiedRecordsRescuedCount = 0;

  for (const raw of ipos) {
    const patchFields: Partial<Pick<ManagedIpoRecord, 'isArchived' | 'deletionStatus'>> = {};
    const status = String(raw.status ?? '');
    const verificationStatus = String(raw.verificationStatus ?? '');

    if (typeof raw.isArchived !== 'boolean') {
      patchFields.isArchived = status === 'Archived' || verificationStatus === 'archived';
    }
    if (typeof raw.deletionStatus !== 'string' || !raw.deletionStatus) {
      patchFields.deletionStatus =
        status === 'Deleted'
          ? 'deleted'
          : status === 'Pending Deletion'
            ? 'pending_approval'
            : 'none';
    }

    if (Object.keys(patchFields).length === 0) continue;

    const effectiveArchived =
      typeof raw.isArchived === 'boolean' ? raw.isArchived : patchFields.isArchived;
    const effectiveDeletion =
      typeof raw.deletionStatus === 'string' && raw.deletionStatus
        ? raw.deletionStatus
        : patchFields.deletionStatus;

    const wasVerifiedLive =
      verificationStatus === 'verified' && PUBLIC_LIVE_IPO_STATUSES.has(status);
    const wouldBePublicNow =
      wasVerifiedLive && raw.isArchived === false && raw.deletionStatus === 'none';
    const wouldBePublicAfter =
      wasVerifiedLive && effectiveArchived === false && effectiveDeletion === 'none';
    const wouldRestorePublicVisibility = !wouldBePublicNow && wouldBePublicAfter;
    if (wouldRestorePublicVisibility) droppedVerifiedRecordsRescuedCount++;

    items.push({
      id: raw.id,
      companyName: raw.companyName || '(Unknown Company)',
      patchFields,
      wouldRestorePublicVisibility,
      note: wouldRestorePublicVisibility
        ? 'Verified live IPO currently dropped by 4-filter query; backfill restores public visibility safely.'
        : 'Backfills required schema defaults while keeping non-public record private.',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    dryRunOnly: true,
    recordsRequiringBackfill: items.length,
    droppedVerifiedRecordsRescuedCount,
    strategySummary:
      'Backwards-compatible rollout: (1) Audit & backfill missing isArchived/deletionStatus defaults (isArchived=false, deletionStatus="none" for active verified docs) in an approved maintenance batch BEFORE enforcing strict 4-filter rules/query in production, OR serve a derived /publicCatalog/ipoFeed projection synced by Admin writes if historical /ipos docs must remain untouched.',
    items,
  };
}

export function isOfficialSebiUrl(rawUrl: string | null | undefined): boolean {
  const clean = (rawUrl ?? '').trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'sebi.gov.in' || host === 'www.sebi.gov.in';
  } catch {
    return false;
  }
}

export interface ManualIpoVerificationGuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Prevents manual IPO form entries from bypassing official SEBI verification into public /ipo & /calendar visibility.
 * - New manual IPOs MUST save as private 'Draft' or 'Awaiting Verification' (never directly 'verified').
 * - Existing unverified dossiers cannot be flipped to 'verified' via manual dropdown without Section 10 SEBI approval.
 * - Already-verified SEBI dossiers may still save minor field edits while preserving their official SEBI provenance.
 */
export function evaluateManualIpoVerificationGuard(params: {
  isNew: boolean;
  requestedVerificationStatus: ManagedIpoRecord['verificationStatus'];
  existingVerificationStatus?: ManagedIpoRecord['verificationStatus'];
  existingLastVerifiedAt?: string;
  sourceUrl?: string;
  officialDocuments?: string[];
  allowReviewedPromotion?: boolean;
}): ManualIpoVerificationGuardResult {
  if (params.requestedVerificationStatus !== 'verified') {
    return { allowed: true };
  }
  if (params.allowReviewedPromotion) {
    return { allowed: true };
  }
  const hasOfficialDoc =
    isOfficialSebiUrl(params.sourceUrl) ||
    (params.officialDocuments ?? []).some((u) => isOfficialSebiUrl(u));

  if (!params.isNew && params.existingVerificationStatus === 'verified' && (hasOfficialDoc || Boolean(params.existingLastVerifiedAt))) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      'Manual IPO entries cannot be marked Verified or published directly from a form dropdown. Save as Draft or Awaiting Verification first, or queue an official sebi.gov.in filing to Section 10 (IPO Source Review) for verification approval.',
  };
}

export const IPO_MANAGEMENT_CATEGORIES: IpoManagementCategory[] = [
  'Upcoming',
  'Open',
  'Closed',
  'Listed',
  'Awaiting Verification',
  'Draft',
  'Rejected',
  'Archived',
  'Pending Deletion',
  'Deleted',
];

function extractRecordMillis(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof val === 'object') {
    const obj = val as { toMillis?: () => number; seconds?: number };
    if (typeof obj.toMillis === 'function') {
      try {
        return obj.toMillis();
      } catch {
        return null;
      }
    }
    if (typeof obj.seconds === 'number' && Number.isFinite(obj.seconds)) {
      return obj.seconds * 1000;
    }
  }
  if (typeof val === 'string' && val.trim()) {
    const iso = normalizeToIsoDate(val);
    if (iso) {
      const parsed = Date.parse(`${iso}T00:00:00Z`);
      return Number.isFinite(parsed) ? parsed : null;
    }
    // Strip IST middle dot notes like "18 Nov 2026 · 11:00 AM IST"
    const cleanDate = val.split('·')[0]?.trim();
    const dmyIso = normalizeToIsoDate(cleanDate);
    if (dmyIso) {
      const parsed = Date.parse(`${dmyIso}T00:00:00Z`);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const direct = Date.parse(val);
    return Number.isFinite(direct) ? direct : null;
  }
  return null;
}

function dateToSortMs(raw: string | null | undefined): number {
  const iso = normalizeToIsoDate(raw);
  if (!iso) return 0;
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractYearFromDates(values: Array<string | null | undefined>): number | null {
  for (const val of values) {
    if (!val) continue;
    const match = /\b(20\d{2}|19\d{2})\b/.exec(val);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

export function classifyUnifiedIpoCategory(
  record: Pick<ManagedIpoRecord, 'status' | 'verificationStatus' | 'isArchived' | 'deletionStatus' | 'openingDate' | 'closingDate' | 'listingDate'>,
  todayIst?: string,
): IpoManagementCategory {
  if (record.deletionStatus === 'deleted' || record.status === 'Deleted') {
    return 'Deleted';
  }
  if (
    record.deletionStatus === 'pending_approval' ||
    record.deletionStatus === 'approved' ||
    record.status === 'Pending Deletion'
  ) {
    return 'Pending Deletion';
  }
  if (record.isArchived || record.verificationStatus === 'archived' || record.status === 'Archived') {
    return 'Archived';
  }
  if (record.status === 'Rejected' || record.verificationStatus === 'rejected') {
    return 'Rejected';
  }
  if (record.status === 'Draft' || record.status === 'Unpublished' || record.verificationStatus === 'unpublished') {
    return 'Draft';
  }
  if (
    record.status === 'Awaiting Verification' ||
    record.verificationStatus === 'awaiting_verification' ||
    record.verificationStatus === 'proposed'
  ) {
    return 'Awaiting Verification';
  }
  const computed = calculateIpoStatusFromDates({
    openingDate: record.openingDate,
    closingDate: record.closingDate,
    listingDate: record.listingDate,
    verificationStatus: record.verificationStatus,
    currentStatus: record.status,
    isArchived: record.isArchived,
    deletionStatus: record.deletionStatus,
    todayIst,
  });
  if (computed === 'Listed' || computed === 'Closed' || computed === 'Open' || computed === 'Upcoming') {
    return computed;
  }
  return 'Awaiting Verification';
}

export function convertCatalogIpoToManagedIpo(row: IpoRow, todayIst?: string): ManagedIpoRecord {
  const officialUrls = [
    ...(row.officialDocuments ?? []).map((d) => d.url ?? '').filter((u) => /^https?:\/\//i.test(u)),
    ...(row.sourceUrl && /^https?:\/\//i.test(row.sourceUrl) ? [row.sourceUrl] : []),
  ];
  const uniqueUrls = [...new Set(officialUrls)].slice(0, 6);
  const openingDate = normalizeToIsoDate(row.openDate) ?? row.openDate ?? undefined;
  const closingDate = normalizeToIsoDate(row.closeDate) ?? row.closeDate ?? undefined;
  const allotmentDate = normalizeToIsoDate(row.allotmentDate) ?? row.allotmentDate ?? undefined;
  const listingDate = normalizeToIsoDate(row.listingDate) ?? row.listingDate ?? undefined;
  const filingDate = normalizeToIsoDate(row.filingDate) ?? row.filingDate ?? undefined;

  const verStatus: ManagedIpoRecord['verificationStatus'] =
    row.verificationStatus === 'verified'
      ? 'verified'
      : row.verificationStatus === 'archived'
        ? 'archived'
        : row.verificationStatus === 'unpublished'
          ? 'unpublished'
          : row.verificationStatus === 'rejected'
            ? 'rejected'
            : row.verificationStatus === 'proposed'
              ? 'proposed'
              : 'awaiting_verification';

  const mappedStatus =
    row.status === 'Proposed OFS'
      ? 'Awaiting Verification'
      : (row.status as ManagedIpoRecord['status']);

  const calculated = calculateIpoStatusFromDates({
    openingDate,
    closingDate,
    listingDate,
    verificationStatus: verStatus,
    currentStatus: mappedStatus,
    isArchived: verStatus === 'archived' || mappedStatus === 'Archived',
    deletionStatus: 'none',
    todayIst,
  });

  const migrationKey = buildStableIpoMigrationKey({
    id: row.id,
    companyName: row.company,
    segment: row.segment,
    filingDate,
    openingDate,
    listingDate,
    offerType: row.offerType,
    sourceUrl: row.sourceUrl,
    officialDocuments: uniqueUrls,
  });

  return {
    id: row.id,
    migrationKey,
    companyName: row.company,
    slug: row.slug,
    segment: row.segment,
    status: calculated,
    issueSize: row.issueSize ?? undefined,
    priceBand: row.priceBand ?? undefined,
    filingDate,
    openingDate,
    closingDate,
    allotmentDate,
    listingDate,
    sellingShareholder: row.sellingShareholder ?? undefined,
    offerType: row.offerType ?? undefined,
    summary: row.summary,
    officialDocuments: uniqueUrls,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl ?? uniqueUrls[0],
    verificationStatus: verStatus,
    isArchived: verStatus === 'archived' || calculated === 'Archived',
    deletionStatus: 'none',
    lastVerifiedAt: row.lastVerifiedAt ?? undefined,
    updatedByUid: 'built-in-catalog',
    updatedAt: row.lastVerifiedAt ?? filingDate ?? undefined,
  };
}

export function convertSebiFilingToManagedIpo(
  filing: SebiIpoFiling,
  todayIst?: string,
): ManagedIpoRecord {
  const filingDate = normalizeToIsoDate(filing.filingDate) ?? filing.filingDate;
  const openingDate = normalizeToIsoDate(filing.openDate) ?? filing.openDate ?? undefined;
  const closingDate = normalizeToIsoDate(filing.closeDate) ?? filing.closeDate ?? undefined;
  const slug = filing.id
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'sebi-ipo';

  const officialDocuments = [
    filing.sebiDocumentUrl,
    ...(filing.exchangeNoticeUrl ? [filing.exchangeNoticeUrl] : []),
  ]
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 6);

  const verificationStatus: ManagedIpoRecord['verificationStatus'] =
    filing.scheduleStatus === 'Awaiting Schedule Notice' && !openingDate
      ? 'awaiting_verification'
      : 'verified';

  const calculated = calculateIpoStatusFromDates({
    openingDate,
    closingDate,
    verificationStatus,
    currentStatus:
      filing.scheduleStatus === 'Awaiting Schedule Notice'
        ? 'Awaiting Verification'
        : filing.scheduleStatus,
    isArchived: false,
    deletionStatus: 'none',
    todayIst,
  });

  const migrationKey = buildStableIpoMigrationKey({
    id: filing.id,
    companyName: filing.companyName,
    segment: filing.category,
    filingDate,
    openingDate,
    offerType: filing.documentType,
    sourceUrl: filing.sebiDocumentUrl,
    officialDocuments,
  });

  return {
    id: filing.id,
    migrationKey,
    companyName: filing.companyName,
    slug,
    segment: filing.category,
    status: calculated,
    issueSize: filing.issueSize,
    priceBand: filing.priceBand ?? undefined,
    filingDate,
    openingDate,
    closingDate,
    offerType: `${filing.documentType} Filing`,
    summary: filing.summary,
    officialDocuments,
    sourceName: 'SEBI Official Public Issues',
    sourceUrl: filing.sebiDocumentUrl,
    verificationStatus,
    isArchived: false,
    deletionStatus: 'none',
    lastVerifiedAt: normalizeToIsoDate(filing.lastCheckedDate.split('·')[0]?.trim()) ?? undefined,
    updatedByUid: 'built-in-sebi-filings',
    updatedAt: filing.lastCheckedDate,
  };
}

function buildUnifiedItemFromManagedRecord(params: {
  record: ManagedIpoRecord;
  sourceOrigin: UnifiedManagedIpoItem['sourceOrigin'];
  isPersistedInFirestore: boolean;
  todayIst?: string;
  needsReview?: boolean;
  conflictNotes?: string[];
  deletedHistory?: UnifiedManagedIpoItem['deletedHistory'];
}): UnifiedManagedIpoItem {
  const { record } = params;
  const category = classifyUnifiedIpoCategory(record, params.todayIst);
  const openingDate = normalizeToIsoDate(record.openingDate) ?? record.openingDate?.trim() ?? null;
  const closingDate = normalizeToIsoDate(record.closingDate) ?? record.closingDate?.trim() ?? null;
  const listingDate = normalizeToIsoDate(record.listingDate) ?? record.listingDate?.trim() ?? null;
  const filingDate = normalizeToIsoDate(record.filingDate) ?? record.filingDate?.trim() ?? null;
  const updatedMs =
    extractRecordMillis(record.updatedAt) ??
    extractRecordMillis(record.createdAt) ??
    extractRecordMillis(record.lastVerifiedAt) ??
    dateToSortMs(listingDate ?? closingDate ?? openingDate ?? filingDate) ??
    0;
  const lastUpdatedIso =
    updatedMs > 0 ? new Date(updatedMs).toISOString().slice(0, 10) : null;
  const year = extractYearFromDates([openingDate, closingDate, listingDate, filingDate, lastUpdatedIso]);

  return {
    id: record.id,
    slug: record.slug,
    migrationKey:
      record.migrationKey ||
      buildStableIpoMigrationKey({
        id: record.id,
        companyName: record.companyName,
        segment: record.segment,
        filingDate,
        openingDate,
        listingDate,
        offerType: record.offerType,
        sourceUrl: record.sourceUrl,
        officialDocuments: record.officialDocuments,
      }),
    companyName: record.companyName,
    segment: record.segment,
    category,
    rawStatus: record.status,
    verificationStatus: record.verificationStatus,
    sourceOrigin: params.sourceOrigin,
    isPersistedInFirestore: params.isPersistedInFirestore,
    isPubliclyVisible: isIpoPubliclyVisible({
      ...record,
      status: record.status,
    }),
    needsReview: Boolean(params.needsReview),
    potentialDuplicateIds: [],
    conflictNotes: [...(params.conflictNotes ?? [])],
    openingDate,
    closingDate,
    listingDate,
    filingDate,
    year,
    lastUpdatedIso,
    lastUpdatedMs: updatedMs,
    officialSourceName: record.sourceName?.trim() || 'Not specified',
    officialSourceUrl:
      record.sourceUrl?.trim() ||
      (record.officialDocuments && record.officialDocuments[0]?.trim()) ||
      null,
    deletionStatus: record.deletionStatus ?? 'none',
    record,
    deletedHistory: params.deletedHistory,
  };
}

/**
 * Unifies all genuine IPO sources (Firestore /ipos, built-in IPO_ALL_RECORDS,
 * built-in SEBI_IPO_FILINGS, and retained Deleted IPO audit history) into a single
 * de-duplicated list while NEVER auto-merging conflicting company names and ALWAYS
 * flagging uncertain/duplicate records as Needs Review.
 */
export function buildUnifiedIpoManagementList(params: {
  firestoreIpos: ManagedIpoRecord[];
  staticCatalogIpos: IpoRow[];
  sebiFilings: SebiIpoFiling[];
  auditLogs?: AuditLogRecord[];
  reviews?: IpoSourceReviewRecord[];
  todayIso?: string;
}): UnifiedManagedIpoItem[] {
  const todayIso = params.todayIso ?? getIstDateString();
  const reviews = params.reviews ?? [];
  const auditLogs = params.auditLogs ?? [];

  const pendingReviewTargetIds = new Set(
    reviews.filter((r) => r.reviewStatus === 'Needs Review' && r.targetIpoId).map((r) => r.targetIpoId!),
  );
  const pendingReviewKeys = new Set(
    reviews.filter((r) => r.reviewStatus === 'Needs Review' && r.migrationKey).map((r) => r.migrationKey!),
  );

  const items: UnifiedManagedIpoItem[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const seenMigrationKeys = new Set<string>();

  // 1. Firestore /ipos documents always have primary authority for persisted state
  for (const fsIpo of params.firestoreIpos) {
    const migKey =
      fsIpo.migrationKey ||
      buildStableIpoMigrationKey({
        id: fsIpo.id,
        companyName: fsIpo.companyName,
        segment: fsIpo.segment,
        filingDate: fsIpo.filingDate,
        openingDate: fsIpo.openingDate,
        listingDate: fsIpo.listingDate,
        offerType: fsIpo.offerType,
        sourceUrl: fsIpo.sourceUrl,
        officialDocuments: fsIpo.officialDocuments,
      });
    const notes: string[] = [];
    let needsReview =
      pendingReviewTargetIds.has(fsIpo.id) || pendingReviewKeys.has(migKey);
    if (needsReview) {
      notes.push('Active SEBI source diff awaiting review in Section 10.');
    }
    if (!fsIpo.migrationKey) {
      notes.push('Missing persisted migrationKey.');
    }

    seenIds.add(fsIpo.id);
    if (fsIpo.slug) seenSlugs.add(fsIpo.slug.toLowerCase());
    seenMigrationKeys.add(migKey);

    items.push(
      buildUnifiedItemFromManagedRecord({
        record: fsIpo,
        sourceOrigin: 'firestore',
        isPersistedInFirestore: true,
        todayIst: todayIso,
        needsReview,
        conflictNotes: notes,
        deletedHistory:
          fsIpo.status === 'Deleted' || fsIpo.deletionStatus === 'deleted'
            ? {
                deletedAtIso:
                  (extractRecordMillis(fsIpo.updatedAt) &&
                    new Date(extractRecordMillis(fsIpo.updatedAt)!).toISOString().slice(0, 10)) ||
                  null,
                summary: 'Marked Deleted in /ipos collection.',
              }
            : undefined,
      }),
    );
  }

  // 2. Built-in static catalog IPO_ALL_RECORDS (excluding explicit sample/fixture placeholders)
  for (const row of params.staticCatalogIpos) {
    const cls = classifyBuiltInIpoCatalogRecord(row, todayIso);
    if (cls.classification === 'demonstration_sample') continue;

    const managed = convertCatalogIpoToManagedIpo(row, todayIso);
    const exactMatch =
      seenIds.has(managed.id) ||
      seenSlugs.has(managed.slug.toLowerCase()) ||
      (managed.migrationKey ? seenMigrationKeys.has(managed.migrationKey) : false);
    if (exactMatch) continue;

    seenIds.add(managed.id);
    seenSlugs.add(managed.slug.toLowerCase());
    if (managed.migrationKey) seenMigrationKeys.add(managed.migrationKey);

    const analysis = analyzeIpoCandidateMatch(params.firestoreIpos, {
      id: managed.id,
      migrationKey: managed.migrationKey,
      companyName: managed.companyName,
      segment: managed.segment,
      filingDate: managed.filingDate,
      openingDate: managed.openingDate,
      closingDate: managed.closingDate,
      listingDate: managed.listingDate,
      offerType: managed.offerType,
      sourceName: managed.sourceName || 'Built-in Editorial Dossier',
      sourceUrl: managed.sourceUrl || '',
      officialDocuments: managed.officialDocuments,
    });

    const notes: string[] = [];
    let needsReview = cls.classification === 'unknown_review';
    if (cls.classification === 'unknown_review') {
      notes.push(cls.evidence);
    }
    if (!analysis.autoMergeAllowed && analysis.conflictWarning) {
      needsReview = true;
      notes.push(analysis.conflictWarning);
    }

    items.push(
      buildUnifiedItemFromManagedRecord({
        record: managed,
        sourceOrigin: 'static_catalog',
        isPersistedInFirestore: false,
        todayIst: todayIso,
        needsReview,
        conflictNotes: notes,
      }),
    );
  }

  // 3. Built-in SEBI_IPO_FILINGS (7 filings shown on /calendar)
  for (const filing of params.sebiFilings) {
    const managed = convertSebiFilingToManagedIpo(filing, todayIso);
    const exactMatch =
      seenIds.has(managed.id) ||
      seenSlugs.has(managed.slug.toLowerCase()) ||
      (managed.migrationKey ? seenMigrationKeys.has(managed.migrationKey) : false);
    if (exactMatch) continue;

    seenIds.add(managed.id);
    seenSlugs.add(managed.slug.toLowerCase());
    if (managed.migrationKey) seenMigrationKeys.add(managed.migrationKey);

    const analysis = analyzeIpoCandidateMatch(
      items.map((it) => it.record),
      {
        id: managed.id,
        migrationKey: managed.migrationKey,
        companyName: managed.companyName,
        segment: managed.segment,
        filingDate: managed.filingDate,
        openingDate: managed.openingDate,
        closingDate: managed.closingDate,
        offerType: managed.offerType,
        documentType: filing.documentType,
        sourceName: managed.sourceName || 'SEBI Official Public Issues',
        sourceUrl: managed.sourceUrl || '',
        officialDocuments: managed.officialDocuments,
      },
    );

    const notes: string[] = [];
    let needsReview = false;
    if (!analysis.autoMergeAllowed && analysis.conflictWarning) {
      needsReview = true;
      notes.push(analysis.conflictWarning);
    }

    items.push(
      buildUnifiedItemFromManagedRecord({
        record: managed,
        sourceOrigin: 'sebi_filings',
        isPersistedInFirestore: false,
        todayIst: todayIso,
        needsReview,
        conflictNotes: notes,
      }),
    );
  }

  // 4. Retained Deleted IPO history from auditLogs (where doc was permanently deleted from /ipos)
  const seenDeletedAuditIds = new Set<string>();
  for (const log of auditLogs) {
    if (log.entityType !== 'ipo' || log.action !== 'complete_delete') continue;
    const entityId = (log.entityId || '').trim();
    if (!entityId || seenIds.has(entityId) || seenDeletedAuditIds.has(entityId)) continue;
    seenDeletedAuditIds.add(entityId);

    const quotedNameMatch = /"([^"]{2,160})"/.exec(log.summary || '');
    const companyName = quotedNameMatch?.[1] || `Deleted IPO (${entityId})`;
    const deletedMs = log.createdAtMs ?? extractRecordMillis(log.createdAt) ?? 0;
    const deletedAtIso = deletedMs > 0 ? new Date(deletedMs).toISOString().slice(0, 10) : null;
    const slug = sanitizeAuditSlug(companyName, entityId);

    const syntheticDeleted: ManagedIpoRecord = {
      id: entityId,
      migrationKey: `deleted_${entityId}`,
      companyName,
      slug,
      segment: 'Mainboard',
      status: 'Deleted',
      verificationStatus: 'unpublished',
      isArchived: false,
      deletionStatus: 'deleted',
      summary: log.summary,
      sourceName: 'Retained Deletion Audit Trail',
      updatedByUid: log.actorUid || 'audit-history',
      updatedAt: deletedMs || undefined,
    };

    items.push(
      buildUnifiedItemFromManagedRecord({
        record: syntheticDeleted,
        sourceOrigin: 'deleted_history',
        isPersistedInFirestore: false,
        todayIst: todayIso,
        needsReview: false,
        conflictNotes: ['Retained deletion history record from immutable auditLogs.'],
        deletedHistory: {
          deletedAtIso,
          actorEmail: log.actorEmail,
          previousStatus: log.previousStatus,
          summary: log.summary,
        },
      }),
    );
  }

  // 5. Cross-check potential duplicates across non-deleted items WITHOUT auto-merging
  const activeItems = items.filter((it) => it.category !== 'Deleted');
  for (let i = 0; i < activeItems.length; i++) {
    const keyI = normalizeIpoCompanyKey(activeItems[i].companyName);
    if (keyI.length < 3) continue;
    for (let j = i + 1; j < activeItems.length; j++) {
      const keyJ = normalizeIpoCompanyKey(activeItems[j].companyName);
      if (keyI === keyJ) {
        activeItems[i].potentialDuplicateIds.push(activeItems[j].id);
        activeItems[j].potentialDuplicateIds.push(activeItems[i].id);
        activeItems[i].needsReview = true;
        activeItems[j].needsReview = true;
      }
    }
  }

  return items;
}

function sanitizeAuditSlug(name: string, fallbackId: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  if (clean.length >= 3) return clean;
  const idClean = fallbackId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 100);
  return idClean.length >= 3 ? idClean : 'deleted-ipo';
}

export interface IpoManagementFilterCriteria {
  search?: string;
  segment?: 'All' | IpoSegment;
  category?: 'All' | 'Needs Review' | IpoManagementCategory;
  verificationStatus?: 'All' | ManagedIpoRecord['verificationStatus'];
  year?: 'All' | number;
  sortField?: IpoManagementSortField;
}

export function filterAndSortManagedIpos(
  items: UnifiedManagedIpoItem[],
  criteria: IpoManagementFilterCriteria,
): UnifiedManagedIpoItem[] {
  const q = (criteria.search ?? '').trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (criteria.segment && criteria.segment !== 'All' && item.segment !== criteria.segment) {
      return false;
    }
    if (criteria.category && criteria.category !== 'All') {
      if (criteria.category === 'Needs Review') {
        if (!item.needsReview) return false;
      } else if (item.category !== criteria.category) {
        return false;
      }
    }
    if (
      criteria.verificationStatus &&
      criteria.verificationStatus !== 'All' &&
      item.verificationStatus !== criteria.verificationStatus
    ) {
      return false;
    }
    if (criteria.year && criteria.year !== 'All' && item.year !== criteria.year) {
      return false;
    }
    if (q) {
      const hay = `${item.companyName} ${item.id} ${item.slug} ${item.officialSourceName} ${item.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sortField = criteria.sortField ?? 'updated_desc';
  return [...filtered].sort((a, b) => {
    if (sortField === 'company_asc') {
      return a.companyName.localeCompare(b.companyName);
    }
    if (sortField === 'opening_desc') {
      const diff = dateToSortMs(b.openingDate) - dateToSortMs(a.openingDate);
      return diff !== 0 ? diff : a.companyName.localeCompare(b.companyName);
    }
    if (sortField === 'opening_asc') {
      const aMs = dateToSortMs(a.openingDate) || Number.MAX_SAFE_INTEGER;
      const bMs = dateToSortMs(b.openingDate) || Number.MAX_SAFE_INTEGER;
      const diff = aMs - bMs;
      return diff !== 0 ? diff : a.companyName.localeCompare(b.companyName);
    }
    if (sortField === 'closing_desc') {
      const diff = dateToSortMs(b.closingDate) - dateToSortMs(a.closingDate);
      return diff !== 0 ? diff : a.companyName.localeCompare(b.companyName);
    }
    if (sortField === 'listing_desc') {
      const diff = dateToSortMs(b.listingDate) - dateToSortMs(a.listingDate);
      return diff !== 0 ? diff : a.companyName.localeCompare(b.companyName);
    }
    const diff = b.lastUpdatedMs - a.lastUpdatedMs;
    return diff !== 0 ? diff : a.companyName.localeCompare(b.companyName);
  });
}

export function summarizeIpoManagementCategories(
  items: UnifiedManagedIpoItem[],
): Record<'All' | 'Needs Review' | IpoManagementCategory, number> {
  const counts: Record<'All' | 'Needs Review' | IpoManagementCategory, number> = {
    All: items.length,
    'Needs Review': 0,
    Upcoming: 0,
    Open: 0,
    Closed: 0,
    Listed: 0,
    'Awaiting Verification': 0,
    Draft: 0,
    Rejected: 0,
    Archived: 0,
    'Pending Deletion': 0,
    Deleted: 0,
  };
  for (const item of items) {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    if (item.needsReview) counts['Needs Review'] += 1;
  }
  return counts;
}

export interface IpoRowActionDescriptor {
  id: IpoRowActionId;
  label: string;
  tone: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
}

/**
 * Returns the exact per-status action set enforcing Role permissions,
 * live-public deletion safeguards, and Pending Deletion two-step discipline.
 */
export function getAvailableIpoRowActions(
  item: UnifiedManagedIpoItem,
  permissions: {
    canManageIposAndReviews: boolean;
    canApprovePermanentDeletion: boolean;
    canExecutePermanentDeletion: boolean;
  },
): IpoRowActionDescriptor[] {
  const canEdit = permissions.canManageIposAndReviews;
  const canDelete = permissions.canExecutePermanentDeletion;
  const canApproveDelete = permissions.canApprovePermanentDeletion;
  const actions: IpoRowActionDescriptor[] = [];

  if (!canEdit && item.category !== 'Deleted') {
    return [];
  }

  switch (item.category) {
    case 'Draft': {
      actions.push({ id: 'edit', label: 'Edit', tone: 'ghost' });
      actions.push({ id: 'submit_review', label: 'Submit for Review', tone: 'primary' });
      if (canDelete && item.isPersistedInFirestore) {
        actions.push({ id: 'execute_delete', label: 'Delete', tone: 'danger' });
      }
      break;
    }
    case 'Awaiting Verification': {
      actions.push({ id: 'edit', label: 'Edit', tone: 'ghost' });
      actions.push({
        id: 'verify',
        label: 'Verify',
        tone: 'primary',
        title: 'Requires an official sebi.gov.in filing URL on this record.',
      });
      actions.push({ id: 'reject', label: 'Reject', tone: 'danger' });
      if (canDelete && item.isPersistedInFirestore) {
        actions.push({ id: 'execute_delete', label: 'Delete', tone: 'danger' });
      }
      break;
    }
    case 'Upcoming':
    case 'Open': {
      actions.push({ id: 'edit', label: 'Edit', tone: 'ghost' });
      actions.push({ id: 'unpublish', label: 'Unpublish', tone: 'ghost' });
      actions.push({ id: 'archive', label: 'Archive', tone: 'ghost' });
      if (canDelete) {
        actions.push({
          id: 'execute_delete',
          label: 'Delete',
          tone: 'danger',
          disabled: item.isPubliclyVisible || !item.isPersistedInFirestore,
          title: item.isPubliclyVisible
            ? 'Blocked while live public. Unpublish, Archive, or Mark Pending Deletion first.'
            : !item.isPersistedInFirestore
              ? 'Built-in record must be Unpublished or Archived before deletion.'
              : 'Delete non-public IPO record.',
        });
      }
      break;
    }
    case 'Closed':
    case 'Listed': {
      actions.push({ id: 'edit', label: 'Edit', tone: 'ghost' });
      actions.push({ id: 'archive', label: 'Archive', tone: 'ghost' });
      actions.push({ id: 'restore', label: 'Restore', tone: 'ghost' });
      if (canDelete) {
        actions.push({
          id: 'execute_delete',
          label: 'Delete',
          tone: 'danger',
          disabled: item.isPubliclyVisible || !item.isPersistedInFirestore,
          title: item.isPubliclyVisible
            ? 'Blocked while live public. Archive or Unpublish first before deleting.'
            : !item.isPersistedInFirestore
              ? 'Built-in record must be Archived or Unpublished before deletion.'
              : 'Delete non-public IPO record.',
        });
      }
      break;
    }
    case 'Rejected': {
      actions.push({ id: 'edit', label: 'Edit', tone: 'ghost' });
      actions.push({ id: 'return_review', label: 'Return to Review', tone: 'primary' });
      if (canDelete && item.isPersistedInFirestore) {
        actions.push({ id: 'execute_delete', label: 'Delete', tone: 'danger' });
      }
      break;
    }
    case 'Archived': {
      actions.push({ id: 'restore', label: 'Restore', tone: 'primary' });
      if (canDelete && item.isPersistedInFirestore) {
        actions.push({ id: 'execute_delete', label: 'Delete', tone: 'danger' });
      }
      break;
    }
    case 'Pending Deletion': {
      actions.push({ id: 'cancel_delete', label: 'Cancel', tone: 'ghost' });
      if (item.deletionStatus !== 'approved' && canApproveDelete) {
        actions.push({ id: 'approve_delete', label: 'Approve', tone: 'primary' });
      }
      if (item.deletionStatus === 'approved' && canDelete) {
        actions.push({ id: 'execute_delete', label: 'Execute', tone: 'danger' });
      }
      break;
    }
    case 'Deleted': {
      actions.push({ id: 'view_history', label: 'View History', tone: 'ghost' });
      break;
    }
  }

  return actions;
}



