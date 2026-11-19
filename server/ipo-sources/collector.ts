export const SEBI_PUBLIC_ISSUES_URL =
  'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11';

export interface OfficialSourcePortalStatus {
  portalId: 'sebi';
  portalName: string;
  url: string;
  status: 'reachable' | 'blocked' | 'unavailable' | 'structure_changed';
  httpStatus?: number;
  pagesChecked: number;
  totalRowsParsed: number;
  message: string;
  checkedAt: string;
}

export interface OfficialIpoCandidateItem {
  companyName: string;
  segment: 'Mainboard' | 'SME';
  filingDate?: string;
  openingDate?: string;
  closingDate?: string;
  priceBand?: string;
  issueSize?: string;
  documentType?: string;
  documentUrl?: string;
  officialDocuments: string[];
  sourceName: string;
  sourceUrl: string;
  summary: string;
}

export interface OfficialIpoCheckResult {
  checkedAt: string;
  cached: boolean;
  cacheTtlSeconds: number;
  portals: OfficialSourcePortalStatus[];
  candidates: OfficialIpoCandidateItem[];
  policyNote: string;
}

export interface ParsedSebiPageResult {
  blocked: boolean;
  blockReason?: string;
  structureRecognized: boolean;
  candidates: OfficialIpoCandidateItem[];
  nextPageUrls: string[];
}

interface CacheEntry {
  expiresAtMs: number;
  result: OfficialIpoCheckResult;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes sensible cache (zero background billing)
const MAX_SEBI_PAGES = 3;
const MAX_DETAIL_FETCHES = 6;
let cachedCheck: CacheEntry | null = null;

export function isAllowedSebiUrl(rawUrl: string): boolean {
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

function resolveSebiUrl(href: string, baseUrl: string = SEBI_PUBLIC_ISSUES_URL): string | null {
  const clean = href.replace(/&amp;/g, '&').trim();
  if (!clean || clean.startsWith('#') || /^javascript:/i.test(clean)) return null;
  try {
    const resolved = new URL(clean, baseUrl).toString();
    return isAllowedSebiUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

function stripHtmlTags(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSebiDateString(raw: string): string | undefined {
  const clean = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  const months: Record<string, string> = {
    jan: '01',
    january: '01',
    feb: '02',
    february: '02',
    mar: '03',
    march: '03',
    apr: '04',
    april: '04',
    may: '05',
    jun: '06',
    june: '06',
    jul: '07',
    july: '07',
    aug: '08',
    august: '08',
    sep: '09',
    sept: '09',
    september: '09',
    oct: '10',
    october: '10',
    nov: '11',
    november: '11',
    dec: '12',
    december: '12',
  };

  // Formats like "Nov 18 2026" or "Nov 18, 2026"
  const mdy = /^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})$/.exec(clean);
  if (mdy) {
    const mon = months[mdy[1].toLowerCase()];
    if (mon) {
      return `${mdy[3]}-${mon}-${mdy[2].padStart(2, '0')}`;
    }
  }

  // Formats like "18 Nov 2026" or "18-Nov-2026"
  const dmyText = /^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/](\d{4})$/.exec(clean);
  if (dmyText) {
    const mon = months[dmyText[2].toLowerCase()];
    if (mon) {
      return `${dmyText[3]}-${mon}-${dmyText[1].padStart(2, '0')}`;
    }
  }

  // Numeric DD-MM-YYYY or DD/MM/YYYY
  const dmyNum = /^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/.exec(clean);
  if (dmyNum) {
    const day = Number(dmyNum[1]);
    const month = Number(dmyNum[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${dmyNum[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return undefined;
}

function classifySebiDocumentType(title: string): string {
  if (/\baddendum\b/i.test(title)) return 'Addendum';
  if (/\bcorrigendum\b/i.test(title)) return 'Corrigendum';
  if (/\b(drhp|draft red herring)\b/i.test(title)) return 'DRHP';
  if (/\b(rhp|red herring)\b/i.test(title)) return 'RHP';
  if (/\bprospectus\b/i.test(title)) return 'Prospectus';
  if (/\bdraft letter of offer\b/i.test(title)) return 'Draft Letter of Offer';
  return 'SEBI Public Issue Filing';
}

function extractCompanyNameFromSebiTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*[-–:|]\s*(DRHP|RHP|Draft Red Herring Prospectus|Red Herring Prospectus|Final Prospectus|Prospectus|Addendum|Corrigendum|Pre-Issue Advertisement|Offer Document).*$/i, '')
    .replace(/\s*\((DRHP|RHP|SME|Mainboard|Addendum|Corrigendum)\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}

function detectBlockedOrInterstitial(html: string): { blocked: boolean; reason?: string } {
  const lower = html.toLowerCase();
  if (!html.trim()) {
    return { blocked: true, reason: 'SEBI returned an empty HTTP body.' };
  }
  if (
    /<title[^>]*>\s*(access denied|attention required|just a moment|robot check|403 forbidden)/i.test(html) ||
    lower.includes('captcha') ||
    lower.includes('cf-browser-verification') ||
    lower.includes('akamai') && lower.includes('reference #') ||
    (lower.includes('enable javascript') && !lower.includes('homection') && !lower.includes('public issues'))
  ) {
    return {
      blocked: true,
      reason: 'SEBI returned an automated access challenge / WAF interstitial (not bypassed).',
    };
  }
  return { blocked: false };
}

/**
 * Parses ONLY the official SEBI Public Issues listing HTML page:
 * https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11
 */
export function parseSebiPublicIssuesHtml(
  html: string,
  pageUrl: string = SEBI_PUBLIC_ISSUES_URL,
): ParsedSebiPageResult {
  const blockCheck = detectBlockedOrInterstitial(html);
  if (blockCheck.blocked) {
    return {
      blocked: true,
      blockReason: blockCheck.reason,
      structureRecognized: false,
      candidates: [],
      nextPageUrls: [],
    };
  }

  const lower = html.toLowerCase();
  const hasListingSignals =
    /<table[\s>]/i.test(html) ||
    lower.includes('public issues') ||
    lower.includes('sid=3') ||
    lower.includes('filings/public-issues') ||
    lower.includes('sebi_data/attachdocs');

  const candidates: OfficialIpoCandidateItem[] = [];
  const seenKeys = new Set<string>();

  // 1. Parse HTML table rows (primary structure of SEBI HomeAction.do listings)
  const rowMatches = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  for (const rowHtml of rowMatches) {
    if (/<th\b/i.test(rowHtml) && !/<td\b/i.test(rowHtml)) continue;

    const cellMatches = rowHtml.match(/<td\b[\s\S]*?<\/td>/gi) ?? [];
    if (cellMatches.length === 0) continue;

    const anchorMatch = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(rowHtml);
    if (!anchorMatch) continue;

    const resolvedHref = resolveSebiUrl(anchorMatch[1], pageUrl);
    if (!resolvedHref) continue;

    const anchorTitle = stripHtmlTags(anchorMatch[2]);
    if (anchorTitle.length < 3) continue;

    // Exclude navigation/pagination anchors mistakenly wrapped in table cells
    if (/^(next|prev|previous|first|last|\d+|view all|home|back)$/i.test(anchorTitle)) {
      continue;
    }

    const cellTexts = cellMatches.map((c) => stripHtmlTags(c));
    let filingDate: string | undefined;
    for (const txt of cellTexts) {
      const normalized = normalizeSebiDateString(txt);
      if (normalized) {
        filingDate = normalized;
        break;
      }
      // Check if a date substring is embedded in the cell
      const embeddedDate =
        /([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[\s\-\/][A-Za-z]{3,9}[\s\-\/]\d{4}|\d{1,2}[\-\/]\d{1,2}[\-\/]\d{4})/.exec(
          txt,
        );
      if (embeddedDate) {
        const parsedEmbedded = normalizeSebiDateString(embeddedDate[1]);
        if (parsedEmbedded) {
          filingDate = parsedEmbedded;
          break;
        }
      }
    }

    const combinedText = cellTexts.join(' ');
    const isPdf = /\.pdf(\?|$)/i.test(resolvedHref);
    const companyName = extractCompanyNameFromSebiTitle(anchorTitle);
    if (companyName.length < 2) continue;

    const documentType = classifySebiDocumentType(`${anchorTitle} ${combinedText}`);
    const segment: 'Mainboard' | 'SME' = /\bsme\b/i.test(`${anchorTitle} ${combinedText}`)
      ? 'SME'
      : 'Mainboard';

    const dedupeKey = `${companyName.toLowerCase()}::${resolvedHref.toLowerCase()}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    candidates.push({
      companyName,
      segment,
      filingDate,
      documentType,
      documentUrl: isPdf ? resolvedHref : undefined,
      officialDocuments: [resolvedHref],
      sourceName: 'SEBI Official Public Issues Portal',
      sourceUrl: resolvedHref,
      summary: filingDate
        ? `${documentType} recorded on official SEBI Public Issues portal on ${filingDate}: ${anchorTitle}`
        : `${documentType} recorded on official SEBI Public Issues portal: ${anchorTitle}`,
    });
  }

  // 2. Fallback: if SEBI used non-table list markup containing /filings/public-issues/ anchors
  if (candidates.length === 0) {
    const anchorRegex = /<a\b[^>]*href=["']([^"']*(?:public-issues|attachdocs|web\/\?file=)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = anchorRegex.exec(html)) !== null) {
      const resolvedHref = resolveSebiUrl(match[1], pageUrl);
      if (!resolvedHref) continue;
      const anchorTitle = stripHtmlTags(match[2]);
      if (anchorTitle.length < 5) continue;
      const companyName = extractCompanyNameFromSebiTitle(anchorTitle);
      if (companyName.length < 2) continue;

      const dedupeKey = `${companyName.toLowerCase()}::${resolvedHref.toLowerCase()}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const documentType = classifySebiDocumentType(anchorTitle);
      const segment: 'Mainboard' | 'SME' = /\bsme\b/i.test(anchorTitle) ? 'SME' : 'Mainboard';
      const isPdf = /\.pdf(\?|$)/i.test(resolvedHref);

      candidates.push({
        companyName,
        segment,
        documentType,
        documentUrl: isPdf ? resolvedHref : undefined,
        officialDocuments: [resolvedHref],
        sourceName: 'SEBI Official Public Issues Portal',
        sourceUrl: resolvedHref,
        summary: `${documentType} linked on official SEBI Public Issues portal: ${anchorTitle}`,
      });
    }
  }

  // 3. Extract accessible SEBI pagination links (next page / numbered pages on HomeAction.do)
  const nextPageUrls: string[] = [];
  const seenPages = new Set<string>([pageUrl]);
  const paginationAnchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let pageMatch: RegExpExecArray | null;
  while ((pageMatch = paginationAnchorRegex.exec(html)) !== null) {
    const attrs = pageMatch[1];
    const label = stripHtmlTags(pageMatch[2]);
    const hrefMatch = /href=["']([^"']+)["']/i.exec(attrs);
    if (!hrefMatch) continue;

    const rawHref = hrefMatch[1];
    const looksLikePagination =
      (/HomeAction\.do/i.test(rawHref) && /(?:nextValue|page|doListing=yes)/i.test(rawHref) && /(?:\d+|next|›|»)/i.test(label)) ||
      /rel=["']next["']/i.test(attrs) ||
      (/\b(?:next|2|3)\b/i.test(label) && /(?:nextValue|pageNo|page=)/i.test(rawHref));

    if (!looksLikePagination) continue;
    const resolvedPageUrl = resolveSebiUrl(rawHref, pageUrl);
    if (resolvedPageUrl && !seenPages.has(resolvedPageUrl)) {
      seenPages.add(resolvedPageUrl);
      nextPageUrls.push(resolvedPageUrl);
    }
  }

  const structureRecognized = hasListingSignals && (candidates.length > 0 || /no\s+records?\s+found/i.test(lower) || /<table[\s>]/i.test(html));

  return {
    blocked: false,
    structureRecognized,
    candidates,
    nextPageUrls: nextPageUrls.slice(0, MAX_SEBI_PAGES - 1),
  };
}

/**
 * Inspects an official SEBI filing detail page (linked from the SEBI Public Issues listing)
 * to extract official PDF links, filing date, and ONLY explicitly stated offer fields.
 * Never invents dates or confuses SEBI filingDate with IPO openingDate/closingDate.
 */
export function extractSebiDocumentDetails(
  detailHtml: string,
  detailUrl: string,
): {
  documentUrl?: string;
  filingDate?: string;
  issueSize?: string;
  priceBand?: string;
  openingDate?: string;
  closingDate?: string;
} {
  if (!detailHtml || !isAllowedSebiUrl(detailUrl)) return {};

  const blockCheck = detectBlockedOrInterstitial(detailHtml);
  if (blockCheck.blocked) return {};

  // Find direct official SEBI PDF link (e.g. attachdocs/*.pdf or /web/?file=*.pdf)
  let documentUrl: string | undefined;
  const pdfRegex = /(?:href|src)=["']([^"']*(?:\.pdf|sebi_data\/attachdocs|web\/\?file=)[^"']*)["']/gi;
  let pdfMatch: RegExpExecArray | null;
  while ((pdfMatch = pdfRegex.exec(detailHtml)) !== null) {
    const resolved = resolveSebiUrl(pdfMatch[1], detailUrl);
    if (resolved) {
      documentUrl = resolved;
      break;
    }
  }

  const text = stripHtmlTags(detailHtml);

  const DATE_TOKEN =
    '([A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[\\s\\-\\/][A-Za-z]{3,9}[\\s\\-\\/]\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[\\-\\/]\\d{1,2}[\\-\\/]\\d{4})';

  let filingDate: string | undefined;
  const filingMatch = new RegExp(`(?:Date of Filing|Filing Date|Uploaded on|Date)\\s*[:\\-]\\s*${DATE_TOKEN}`, 'i').exec(text);
  if (filingMatch) {
    filingDate = normalizeSebiDateString(filingMatch[1]);
  }

  // Strictly only extract opening/closing dates or price band/issue size if explicitly labeled
  let openingDate: string | undefined;
  const openMatch = new RegExp(`(?:Issue Open(?:ing)? Date|Bid\\/Issue Opens? On)\\s*[:\\-]\\s*${DATE_TOKEN}`, 'i').exec(text);
  if (openMatch) {
    openingDate = normalizeSebiDateString(openMatch[1]);
  }

  let closingDate: string | undefined;
  const closeMatch = new RegExp(`(?:Issue Clos(?:ing|e) Date|Bid\\/Issue Closes? On)\\s*[:\\-]\\s*${DATE_TOKEN}`, 'i').exec(text);
  if (closeMatch) {
    closingDate = normalizeSebiDateString(closeMatch[1]);
  }

  let priceBand: string | undefined;
  const priceMatch = /Price Band\s*[:\-]\s*((?:Rs\.?|₹|INR)?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:to|[-–])\s*(?:Rs\.?|₹|INR)?\s*\d[\d,]*(?:\.\d+)?)?)/i.exec(text);
  if (priceMatch) {
    priceBand = priceMatch[1].replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  let issueSize: string | undefined;
  const sizeMatch = /(?:Total Issue Size|Issue Size)\s*[:\-]\s*((?:Rs\.?|₹|INR)?\s*\d[\d,]*(?:\.\d+)?\s*(?:Crores|Crore|Cr\.?|Lakhs|Lakh))/i.exec(text);
  if (sizeMatch) {
    issueSize = sizeMatch[1].replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  return {
    documentUrl,
    filingDate,
    issueSize,
    priceBand,
    openingDate,
    closingDate,
  };
}

async function fetchSebiPageWithTimeout(
  url: string,
  timeoutMs: number = 7500,
): Promise<{ ok: boolean; status: number; contentType: string; text: string; error?: string }> {
  if (!isAllowedSebiUrl(url)) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      text: '',
      error: 'URL blocked by SEBI-only source policy.',
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'SakarBazaarEditorialBot/1.0 (+https://www.sebi.gov.in compliance reader)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    });
    if (!isAllowedSebiUrl(res.url || url)) {
      return {
        ok: false,
        status: res.status,
        contentType: '',
        text: '',
        error: 'Redirected outside sebi.gov.in; blocked by SEBI-only source policy.',
      };
    }
    const contentType = res.headers.get('content-type') || '';
    const text = res.ok && /html|xml|text/i.test(contentType || 'text/html') ? await res.text() : '';
    return { ok: res.ok, status: res.status, contentType, text };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      text: '',
      error: err instanceof Error ? err.message : 'Network error or timeout contacting sebi.gov.in',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkOfficialIpoSources(options?: {
  forceRefresh?: boolean;
}): Promise<OfficialIpoCheckResult> {
  const nowMs = Date.now();
  if (!options?.forceRefresh && cachedCheck && cachedCheck.expiresAtMs > nowMs) {
    return {
      ...cachedCheck.result,
      cached: true,
    };
  }

  const checkedAt = new Date(nowMs).toISOString();
  const allCandidates: OfficialIpoCandidateItem[] = [];
  const seenKeys = new Set<string>();
  let pagesChecked = 0;

  const firstPage = await fetchSebiPageWithTimeout(SEBI_PUBLIC_ISSUES_URL);
  if (!firstPage.ok || !firstPage.text) {
    const status: OfficialSourcePortalStatus['status'] =
      firstPage.status === 403 || firstPage.status === 429 ? 'blocked' : 'unavailable';
    const message =
      status === 'blocked'
        ? `SEBI blocked automated access (HTTP ${firstPage.status}). Existing approved records remain untouched; verify filings directly on sebi.gov.in.`
        : `Unable to retrieve official SEBI Public Issues page (${firstPage.error || `HTTP ${firstPage.status}`}). Existing approved records remain untouched.`;

    const blockedResult: OfficialIpoCheckResult = {
      checkedAt,
      cached: false,
      cacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
      portals: [
        {
          portalId: 'sebi',
          portalName: 'SEBI Official Public Issues Filings',
          url: SEBI_PUBLIC_ISSUES_URL,
          status,
          httpStatus: firstPage.status || undefined,
          pagesChecked: 0,
          totalRowsParsed: 0,
          message,
          checkedAt,
        },
      ],
      candidates: [],
      policyNote:
        'SEBI-only automated verification respects sebi.gov.in access controls without bypassing CAPTCHA or anti-bot protections.',
    };
    return blockedResult;
  }

  const parsedFirst = parseSebiPublicIssuesHtml(firstPage.text, SEBI_PUBLIC_ISSUES_URL);
  pagesChecked = 1;

  if (parsedFirst.blocked) {
    return {
      checkedAt,
      cached: false,
      cacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
      portals: [
        {
          portalId: 'sebi',
          portalName: 'SEBI Official Public Issues Filings',
          url: SEBI_PUBLIC_ISSUES_URL,
          status: 'blocked',
          httpStatus: firstPage.status,
          pagesChecked: 1,
          totalRowsParsed: 0,
          message: `${parsedFirst.blockReason || 'SEBI access restricted.'} Existing approved IPO records remain untouched.`,
          checkedAt,
        },
      ],
      candidates: [],
      policyNote:
        'SEBI-only automated verification detected an interstitial/access block and stopped honestly without bypassing protections.',
    };
  }

  if (!parsedFirst.structureRecognized && parsedFirst.candidates.length === 0) {
    return {
      checkedAt,
      cached: false,
      cacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
      portals: [
        {
          portalId: 'sebi',
          portalName: 'SEBI Official Public Issues Filings',
          url: SEBI_PUBLIC_ISSUES_URL,
          status: 'structure_changed',
          httpStatus: firstPage.status,
          pagesChecked: 1,
          totalRowsParsed: 0,
          message:
            'SEBI page responded HTTP 200, but its listing markup differed from expected public-issue table/link structure. Extraction aborted honestly to prevent inaccurate records.',
          checkedAt,
        },
      ],
      candidates: [],
      policyNote:
        'Structure verification guard prevented unverified extraction. Inspect the official SEBI page manually and update parser rules if SEBI redesigned the table.',
    };
  }

  function mergeCandidates(items: OfficialIpoCandidateItem[]) {
    for (const item of items) {
      const key = `${item.companyName.toLowerCase()}::${item.sourceUrl.toLowerCase()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        allCandidates.push(item);
      }
    }
  }

  mergeCandidates(parsedFirst.candidates);

  // Respectfully inspect accessible pagination pages (up to MAX_SEBI_PAGES total)
  for (const nextUrl of parsedFirst.nextPageUrls.slice(0, MAX_SEBI_PAGES - 1)) {
    const nextRes = await fetchSebiPageWithTimeout(nextUrl, 5500);
    if (!nextRes.ok || !nextRes.text) continue;
    const parsedNext = parseSebiPublicIssuesHtml(nextRes.text, nextUrl);
    if (parsedNext.blocked || !parsedNext.structureRecognized) break;
    pagesChecked++;
    mergeCandidates(parsedNext.candidates);
  }

  // Enrich up to MAX_DETAIL_FETCHES HTML detail links on sebi.gov.in for linked PDFs & explicitly stated offer details
  let detailCount = 0;
  for (const cand of allCandidates) {
    if (detailCount >= MAX_DETAIL_FETCHES) break;
    if (!cand.sourceUrl || /\.pdf(\?|$)/i.test(cand.sourceUrl)) continue;
    if (!isAllowedSebiUrl(cand.sourceUrl)) continue;
    detailCount++;
    const detailRes = await fetchSebiPageWithTimeout(cand.sourceUrl, 4500);
    if (!detailRes.ok || !detailRes.text) continue;
    const extra = extractSebiDocumentDetails(detailRes.text, cand.sourceUrl);
    if (extra.documentUrl && !cand.officialDocuments.includes(extra.documentUrl)) {
      cand.documentUrl = extra.documentUrl;
      cand.officialDocuments = [cand.sourceUrl, extra.documentUrl];
    }
    if (!cand.filingDate && extra.filingDate) {
      cand.filingDate = extra.filingDate;
    }
    if (extra.issueSize) cand.issueSize = extra.issueSize;
    if (extra.priceBand) cand.priceBand = extra.priceBand;
    if (extra.openingDate) cand.openingDate = extra.openingDate;
    if (extra.closingDate) cand.closingDate = extra.closingDate;
  }

  const trimmedCandidates = allCandidates.slice(0, 30);
  const result: OfficialIpoCheckResult = {
    checkedAt,
    cached: false,
    cacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
    portals: [
      {
        portalId: 'sebi',
        portalName: 'SEBI Official Public Issues Filings',
        url: SEBI_PUBLIC_ISSUES_URL,
        status: 'reachable',
        httpStatus: firstPage.status,
        pagesChecked,
        totalRowsParsed: trimmedCandidates.length,
        message:
          trimmedCandidates.length > 0
            ? `Retrieved ${trimmedCandidates.length} public-issue filing record(s) across ${pagesChecked} SEBI page(s). Opening/closing dates remain "Not announced" unless explicitly stated in official SEBI documents.`
            : `SEBI Public Issues portal reachable (${pagesChecked} page checked); zero public-issue rows found in the listing.`,
        checkedAt,
      },
    ],
    candidates: trimmedCandidates,
    policyNote:
      'Automated collection uses ONLY the official SEBI Public Issues portal and documents linked from it. SEBI filing dates are tracked separately from IPO opening/closing dates. All new or updated entries stay in Needs Review until Owner/Publisher approval.',
  };

  cachedCheck = {
    expiresAtMs: nowMs + CACHE_TTL_MS,
    result,
  };

  return result;
}

export function clearOfficialIpoSourceCache(): void {
  cachedCheck = null;
}
