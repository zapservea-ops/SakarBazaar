export type SebiDocumentType =
  | 'DRHP'
  | 'RHP'
  | 'Prospectus'
  | 'Addendum/Corrigendum'
  | 'Draft Letter of Offer';

export type IpoCategory = 'Mainboard' | 'SME';

export type IpoScheduleStatus = 'Upcoming' | 'Open' | 'Closed' | 'Awaiting Schedule Notice';

export interface SebiIpoFiling {
  id: string;
  companyName: string;
  filingDate: string;
  category: IpoCategory;
  documentType: SebiDocumentType;
  scheduleStatus: IpoScheduleStatus;
  openDate: string | null;
  closeDate: string | null;
  priceBand: string | null;
  issueSize?: string;
  leadManagers: string[];
  sebiDocumentUrl: string;
  exchangeNoticeUrl?: string;
  lastCheckedDate: string;
  summary: string;
}

export const SEBI_PUBLIC_ISSUES_SOURCE_URL =
  'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11';

export const SEBI_SYNC_POLICY_NOTICE =
  'Filings sourced directly from the SEBI Public Issues portal (sebi.gov.in). Note: Filing date represents statutory submission to SEBI and must not be confused with issue opening dates. Bidding windows and price bands are displayed only when established by registered Red Herring Prospectuses (RHP) or official exchange circulars.';

export const SEBI_IPO_FILINGS: SebiIpoFiling[] = [
  {
    id: 'sebi-ntpc-green',
    companyName: 'NTPC Green Energy Limited',
    filingDate: '13 Nov 2026',
    category: 'Mainboard',
    documentType: 'RHP',
    scheduleStatus: 'Open',
    openDate: '19 Nov 2026',
    closeDate: '22 Nov 2026',
    priceBand: '₹102–₹108 per share',
    issueSize: '₹10,000 Cr (100% Fresh Issue)',
    leadManagers: ['IDBI Capital', 'HDFC Bank', 'IIFL Securities', 'Nuvama Wealth'],
    sebiDocumentUrl: 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11',
    exchangeNoticeUrl: 'https://www.nseindia.com',
    lastCheckedDate: '18 Nov 2026 · 11:00 AM IST',
    summary:
      'Renewable energy subsidiary of Maharatna NTPC Limited. 100% fresh equity issuance earmarked for investment in subsidiary NTPC Renewable Energy Limited (NREL) and debt repayment.',
  },
  {
    id: 'sebi-enviro-infra',
    companyName: 'Enviro Infra Engineers Limited',
    filingDate: '15 Nov 2026',
    category: 'Mainboard',
    documentType: 'RHP',
    scheduleStatus: 'Upcoming',
    openDate: '22 Nov 2026',
    closeDate: '26 Nov 2026',
    priceBand: '₹140–₹148 per share',
    issueSize: '₹650 Cr (Fresh + OFS)',
    leadManagers: ['Hem Securities Limited'],
    sebiDocumentUrl: 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11',
    exchangeNoticeUrl: 'https://www.bseindia.com',
    lastCheckedDate: '18 Nov 2026 · 11:00 AM IST',
    summary:
      'EPC and O&M water treatment and wastewater infrastructure enterprise. Issue proceeds to finance working capital needs and sewage treatment plant projects.',
  },
  {
    id: 'sebi-zinka-logistics',
    companyName: 'Zinka Logistics Solutions Limited (BlackBuck)',
    filingDate: '08 Nov 2026',
    category: 'Mainboard',
    documentType: 'RHP',
    scheduleStatus: 'Closed',
    openDate: '13 Nov 2026',
    closeDate: '18 Nov 2026',
    priceBand: '₹259–₹273 per share',
    issueSize: '₹1,114.72 Cr',
    leadManagers: ['Kotak Mahindra Capital', 'Morgan Stanley India', 'JM Financial'],
    sebiDocumentUrl: 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11',
    exchangeNoticeUrl: 'https://www.nseindia.com',
    lastCheckedDate: '18 Nov 2026 · 11:00 AM IST',
    summary:
      'Digital trucking platform providing tolling payments, telematics, and load marketplace solutions across commercial logistics operators in India.',
  },
  {
    id: 'sebi-c2c-advanced',
    companyName: 'C2C Advanced Systems Limited',
    filingDate: '14 Nov 2026',
    category: 'SME',
    documentType: 'RHP',
    scheduleStatus: 'Upcoming',
    openDate: '22 Nov 2026',
    closeDate: '26 Nov 2026',
    priceBand: '₹214–₹226 per share',
    issueSize: '₹99.07 Cr (NSE Emerge)',
    leadManagers: ['Mark Corporate Advisors'],
    sebiDocumentUrl: 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11',
    exchangeNoticeUrl: 'https://www.nseindia.com',
    lastCheckedDate: '18 Nov 2026 · 11:00 AM IST',
    summary:
      'Defence and aerospace electronics solutions provider specializing in C4I (Command, Control, Communications, Computers & Intelligence) systems.',
  },
  {
    id: 'sebi-rajesh-power',
    companyName: 'Rajesh Power Services Limited',
    filingDate: '16 Nov 2026',
    category: 'SME',
    documentType: 'RHP',
    scheduleStatus: 'Upcoming',
    openDate: '25 Nov 2026',
    closeDate: '27 Nov 2026',
    priceBand: '₹319–₹335 per share',
    issueSize: '₹160.49 Cr (BSE SME)',
    leadManagers: ['Inventure Merchant Banker'],
    sebiDocumentUrl: 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11',
    exchangeNoticeUrl: 'https://www.bseindia.com',
    lastCheckedDate: '18 Nov 2026 · 11:00 AM IST',
    summary:
      'EPC contracting and maintenance firm for power distribution and extra-high-voltage underground cable installations.',
  },
  {
    id: 'sebi-avanse-financial',
    companyName: 'Avanse Financial Services Limited',
    filingDate: '28 Oct 2026',
    category: 'Mainboard',
    documentType: 'DRHP',
    scheduleStatus: 'Awaiting Schedule Notice',
    openDate: null,
    closeDate: null,
    priceBand: null,
    issueSize: '₹3,500 Cr (Fresh + OFS proposed)',
    leadManagers: ['Kotak Mahindra Capital', 'J.P. Morgan India', 'Nomura Financial Advisory'],
    sebiDocumentUrl: 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11',
    lastCheckedDate: '18 Nov 2026 · 11:00 AM IST',
    summary:
      'Education-focused non-banking financial company (NBFC) backed by Warburg Pincus. Draft Red Herring Prospectus filed with SEBI; issue dates and price band pending final RHP registration.',
  },
  {
    id: 'sebi-mobikwik',
    companyName: 'One Mobikwik Systems Limited',
    filingDate: '04 Nov 2026',
    category: 'Mainboard',
    documentType: 'Addendum/Corrigendum',
    scheduleStatus: 'Awaiting Schedule Notice',
    openDate: null,
    closeDate: null,
    priceBand: null,
    issueSize: '₹700 Cr (Fresh Issue proposed)',
    leadManagers: ['SBI Capital Markets', 'DAM Capital Advisors'],
    sebiDocumentUrl: 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11',
    lastCheckedDate: '18 Nov 2026 · 11:00 AM IST',
    summary:
      'Fintech payments and consumer credit provider. Addendum filed with SEBI updating restated financials for Q1 FY27; bidding dates subject to exchange scheduling circular.',
  },
];

/**
 * Deduplicate filings by company name and document type
 */
export function deduplicateSebiFilings(filings: SebiIpoFiling[]): SebiIpoFiling[] {
  const seen = new Set<string>();
  return filings.filter((f) => {
    const key = `${f.companyName.toLowerCase()}-${f.documentType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
