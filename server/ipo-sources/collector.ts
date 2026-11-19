export interface OfficialSourcePortalStatus {
  portalId: 'sebi' | 'nse' | 'bse';
  portalName: string;
  url: string;
  status: 'reachable' | 'blocked' | 'unavailable';
  httpStatus?: number;
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

interface CacheEntry {
  expiresAtMs: number;
  result: OfficialIpoCheckResult;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes sensible cache (zero background billing)
let cachedCheck: CacheEntry | null = null;

function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSebiRssCandidates(
  xmlText: string,
  sourceUrl: string,
): OfficialIpoCandidateItem[] {
  const candidates: OfficialIpoCandidateItem[] = [];
  const itemMatches = xmlText.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];

  for (const itemXml of itemMatches) {
    const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(itemXml);
    const linkMatch = /<link>([\s\S]*?)<\/link>/i.exec(itemXml);
    const pubDateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(itemXml);
    const descMatch = /<description>([\s\S]*?)<\/description>/i.exec(itemXml);

    const title = stripHtmlTags(titleMatch?.[1] ?? '');
    if (!title) continue;

    // Only keep actual DRHP / RHP / Prospectus / Public Issue filings from official SEBI RSS
    if (!/(drhp|rhp|prospectus|public\s+issue|ipo|letter\s+of\s+offer)/i.test(title)) {
      continue;
    }

    const cleanCompany = title
      .replace(/\s*-\s*(DRHP|RHP|Draft Red Herring Prospectus|Red Herring Prospectus|Addendum|Corrigendum).*$/i, '')
      .trim()
      .slice(0, 150);

    if (cleanCompany.length < 2) continue;

    const docType = /\b(drhp|draft red herring)\b/i.test(title)
      ? 'DRHP'
      : /\b(rhp|red herring)\b/i.test(title)
        ? 'RHP'
        : 'Public Issue Filing';
    const segment: 'Mainboard' | 'SME' = /\bsme\b/i.test(title) ? 'SME' : 'Mainboard';
    const link = stripHtmlTags(linkMatch?.[1] ?? '') || sourceUrl;
    const pubDateRaw = stripHtmlTags(pubDateMatch?.[1] ?? '');
    const desc = stripHtmlTags(descMatch?.[1] ?? '');

    candidates.push({
      companyName: cleanCompany,
      segment,
      filingDate: pubDateRaw ? pubDateRaw.slice(0, 32) : undefined,
      documentType: docType,
      sourceName: 'SEBI Official Public Issues RSS',
      sourceUrl: link.startsWith('http') ? link : sourceUrl,
      summary: desc ? desc.slice(0, 400) : `${docType} filing detected on SEBI RSS feed: ${title}`,
    });

    if (candidates.length >= 20) break;
  }

  return candidates;
}

async function fetchWithRespectfulTimeout(
  url: string,
  timeoutMs: number = 6500,
): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'SakarBazaarEditorialBot/1.0 (+https://sebi.gov.in compliance reader)',
        Accept: 'application/xml,text/xml,application/json,text/html;q=0.8',
      },
    });
    const text = res.ok ? await res.text() : '';
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      text: '',
      error: err instanceof Error ? err.message : 'Network error or timeout',
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
  const portals: OfficialSourcePortalStatus[] = [];
  const candidates: OfficialIpoCandidateItem[] = [];

  // 1. SEBI Public Issues RSS
  const sebiRssUrl = 'https://www.sebi.gov.in/sebirss.xml';
  const sebiRes = await fetchWithRespectfulTimeout(sebiRssUrl);
  if (sebiRes.ok && sebiRes.text) {
    const parsed = parseSebiRssCandidates(sebiRes.text, sebiRssUrl);
    candidates.push(...parsed);
    portals.push({
      portalId: 'sebi',
      portalName: 'SEBI Public Issues & Filings RSS',
      url: sebiRssUrl,
      status: 'reachable',
      httpStatus: sebiRes.status,
      message:
        parsed.length > 0
          ? `Retrieved ${parsed.length} issue-related RSS filing item(s).`
          : 'Feed reachable; no new DRHP/RHP entries in current RSS window.',
      checkedAt,
    });
  } else {
    portals.push({
      portalId: 'sebi',
      portalName: 'SEBI Public Issues & Filings RSS',
      url: sebiRssUrl,
      status: sebiRes.status === 403 || sebiRes.status === 429 ? 'blocked' : 'unavailable',
      httpStatus: sebiRes.status || undefined,
      message:
        sebiRes.status === 403 || sebiRes.status === 429
          ? `Access restricted by SEBI edge protection (HTTP ${sebiRes.status}). Existing verified records retained; verify manually on sebi.gov.in.`
          : `Unable to reach SEBI feed (${sebiRes.error || `HTTP ${sebiRes.status}`}). Existing verified records retained.`,
      checkedAt,
    });
  }

  // 2. NSE Public Issues Feed (respectful probe only — never bypasses Akamai/anti-bot)
  const nseUrl = 'https://www.nseindia.com/api/ipo-current-issue';
  const nseRes = await fetchWithRespectfulTimeout(nseUrl, 5000);
  if (nseRes.ok && nseRes.text.trim().startsWith('[')) {
    try {
      const json = JSON.parse(nseRes.text) as Array<Record<string, unknown>>;
      let count = 0;
      for (const row of json.slice(0, 15)) {
        const companyName = String(row.companyName || row.symbol || '').trim();
        if (!companyName) continue;
        count++;
        candidates.push({
          companyName,
          segment: String(row.series || '').toUpperCase() === 'SME' ? 'SME' : 'Mainboard',
          openingDate: row.issueStartDate ? String(row.issueStartDate).trim() : undefined,
          closingDate: row.issueEndDate ? String(row.issueEndDate).trim() : undefined,
          priceBand: row.issuePrice ? String(row.issuePrice).trim() : undefined,
          issueSize: row.issueSize ? String(row.issueSize).trim() : undefined,
          sourceName: 'NSE India Official Current Issues',
          sourceUrl: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
          summary: `Detected on NSE official current-issues feed (${String(row.status || 'Active')}).`,
        });
      }
      portals.push({
        portalId: 'nse',
        portalName: 'NSE India Public Issues',
        url: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
        status: 'reachable',
        httpStatus: nseRes.status,
        message: `Retrieved ${count} issue record(s) from NSE feed.`,
        checkedAt,
      });
    } catch {
      portals.push({
        portalId: 'nse',
        portalName: 'NSE India Public Issues',
        url: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
        status: 'unavailable',
        httpStatus: nseRes.status,
        message: 'NSE response was not structured JSON (anti-bot interstitial). Existing verified records retained.',
        checkedAt,
      });
    }
  } else {
    portals.push({
      portalId: 'nse',
      portalName: 'NSE India Public Issues',
      url: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
      status: nseRes.status === 401 || nseRes.status === 403 ? 'blocked' : 'unavailable',
      httpStatus: nseRes.status || undefined,
      message:
        'NSE public API requires browser session cookies / Akamai clearance (not bypassed). Existing verified records retained; review manually on nseindia.com.',
      checkedAt,
    });
  }

  // 3. BSE Public Issues Portal
  const bseUrl = 'https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx?id=1&Type=P';
  const bseRes = await fetchWithRespectfulTimeout(bseUrl, 5000);
  portals.push({
    portalId: 'bse',
    portalName: 'BSE India Public Issues',
    url: bseUrl,
    status: bseRes.ok ? 'reachable' : bseRes.status === 403 ? 'blocked' : 'unavailable',
    httpStatus: bseRes.status || undefined,
    message: bseRes.ok
      ? 'BSE public issues page reachable; structured review candidates require human verification against exchange circulars.'
      : `BSE blocked or timed out automated check (${bseRes.error || `HTTP ${bseRes.status}`}). Existing verified records retained.`,
    checkedAt,
  });

  const result: OfficialIpoCheckResult = {
    checkedAt,
    cached: false,
    cacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
    portals,
    candidates,
    policyNote:
      'On-demand zero-billing official source check respects portal protections without bypassing CAPTCHA or anti-bot gates. Candidates always require human approval in IPO Source Review before updating public IPO tables.',
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
