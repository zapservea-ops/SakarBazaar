import type { IpoRow, IpoSourceDiffItem, ManagedIpoRecord } from '../types/sakarbazaar';

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
 */
export function calculateIpoStatusFromDates(params: {
  openingDate?: string | null;
  closingDate?: string | null;
  listingDate?: string | null;
  verificationStatus?: 'awaiting_verification' | 'verified';
  todayIst?: string;
}): 'Awaiting Verification' | 'Upcoming' | 'Open' | 'Closed' | 'Listed' {
  const today = params.todayIst ?? getIstDateString();
  const openIso = normalizeToIsoDate(params.openingDate);
  const closeIso = normalizeToIsoDate(params.closingDate);
  const listIso = normalizeToIsoDate(params.listingDate);

  if (params.verificationStatus === 'awaiting_verification' && !openIso && !listIso) {
    return 'Awaiting Verification';
  }

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

export function formatOfficialIpoField(value: string | null | undefined): string {
  const clean = (value ?? '').trim();
  return clean || 'Not announced';
}

export interface DetectedIpoCandidate {
  companyName: string;
  segment: 'Mainboard' | 'SME';
  issueSize?: string;
  priceBand?: string;
  lotSize?: string;
  filingDate?: string;
  openingDate?: string;
  closingDate?: string;
  listingDate?: string;
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

export function findMatchingManagedIpo<T extends { id?: string; companyName: string }>(
  ipos: T[],
  companyName: string,
): T | undefined {
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
    reviewStatus: 'Needs Review' | 'Approved' | 'Rejected';
    diffs?: IpoSourceDiffItem[];
  }>,
  companyName: string,
  candidateDiffs: IpoSourceDiffItem[],
): boolean {
  const candKey = normalizeIpoCompanyKey(companyName);
  const candExact = companyName.trim().toLowerCase();
  const candSig = computeDiffFingerprint(candidateDiffs);

  for (const rev of existingReviews) {
    const revExact = rev.companyName.trim().toLowerCase();
    const revKey = normalizeIpoCompanyKey(rev.companyName);
    const sameCompany = revExact === candExact || (candKey.length >= 3 && revKey === candKey);
    if (!sameCompany) continue;

    if (rev.reviewStatus === 'Needs Review') {
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

  // Also record newly detected official SEBI document/filing link when not yet linked on existing record
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

export function mapManagedIpoToPublicRow(doc: ManagedIpoRecord): IpoRow {
  const computedStatus =
    doc.status === 'Awaiting Verification' && doc.verificationStatus === 'awaiting_verification'
      ? 'Awaiting Verification'
      : calculateIpoStatusFromDates({
          openingDate: doc.openingDate,
          closingDate: doc.closingDate,
          listingDate: doc.listingDate,
          verificationStatus: doc.verificationStatus,
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

