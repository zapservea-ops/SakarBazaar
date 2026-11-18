import type {
  ArticleCitation,
  ArticleRecord,
  CalendarScheduleItem,
  ExplainerRecord,
  HomepageNewsCategory,
  IpoRow,
  MarketInstrument,
  MarketPulseItem,
  MediaAssetRecord,
  NewsCategory,
  NewsItem,
} from '../types/sakarbazaar';
import {
  BENCHMARK_INDICES_CATALOG,
  MACRO_INDICATORS_CATALOG,
  POPULAR_EQUITIES_CATALOG,
} from '../../server/market-data/instruments.ts';
import { buildUnavailableQuote } from '../../server/market-data/normalizer.ts';

export const OFFICIAL_PORTAL_REFERENCES: Record<
  'rbi' | 'nse' | 'bse' | 'sebi' | 'mospi' | 'pib' | 'commerce',
  ArticleCitation
> = {
  rbi: {
    id: 'cit-rbi',
    label: 'Monetary Policy & Weekly Statistical Supplement',
    portalName: 'Reserve Bank of India (rbi.org.in)',
    url: 'https://www.rbi.org.in',
    note: 'Official central bank portal for policy statements and reserve releases.',
  },
  nse: {
    id: 'cit-nse',
    label: 'Exchange Indices & Public Issue Filings',
    portalName: 'NSE India (nseindia.com)',
    url: 'https://www.nseindia.com',
    note: 'Verify official market indices, corporate filings, and IPO demand.',
  },
  bse: {
    id: 'cit-bse',
    label: 'Corporate Announcements & Public Issues',
    portalName: 'BSE India (bseindia.com)',
    url: 'https://www.bseindia.com',
    note: 'Verify exchange notices, SME/Mainboard listings, and disclosures.',
  },
  sebi: {
    id: 'cit-sebi',
    label: 'Offer Documents (DRHP / RHP) & Regulatory Circulars',
    portalName: 'SEBI (sebi.gov.in)',
    url: 'https://www.sebi.gov.in',
    note: 'Primary regulator portal for draft and final red herring prospectuses.',
  },
  mospi: {
    id: 'cit-mospi',
    label: 'CPI Inflation & National Accounts (GDP)',
    portalName: 'MoSPI (mospi.gov.in)',
    url: 'https://www.mospi.gov.in',
    note: 'Official portal for Consumer Price Index and quarterly GDP releases.',
  },
  pib: {
    id: 'cit-pib',
    label: 'Official Government Press Releases',
    portalName: 'Press Information Bureau (pib.gov.in)',
    url: 'https://pib.gov.in',
    note: 'Check official Press Information Bureau releases for ministerial meetings.',
  },
  commerce: {
    id: 'cit-commerce',
    label: 'Department of Commerce Communications',
    portalName: 'Ministry of Commerce & Industry (commerce.gov.in)',
    url: 'https://commerce.gov.in',
    note: 'Check official bilateral trade and ministerial delegation communiqués.',
  },
};

// Derived from the canonical server/market-data/instruments catalogue so benchmarks and all 15 listed
// equities stay single-sourced across backend and frontend (prices remain null until authorized feed).
export const MARKET_INSTRUMENTS: MarketInstrument[] = [
  ...BENCHMARK_INDICES_CATALOG,
  ...MACRO_INDICATORS_CATALOG,
].map((def) => buildUnavailableQuote(def));

export const CURATED_INDIAN_EQUITIES: MarketInstrument[] = POPULAR_EQUITIES_CATALOG.map((def) =>
  buildUnavailableQuote(def),
);

export const MEDIA_ASSETS: MediaAssetRecord[] = [
  {
    id: 'media-mcl-ipo-brief',
    fileName: 'WhatsApp_Video_2026-11-17_at_11.35.07_82d5da66.mp4',
    storagePath: 'public/assets/aistudio/WhatsApp_Video_2026-11-17_at_11.35.07_82d5da66.mp4',
    publicUrl: '/assets/aistudio/WhatsApp_Video_2026-11-17_at_11.35.07_82d5da66.mp4',
    mediaType: 'video/mp4',
    durationSec: 20,
    width: 1024,
    height: 576,
    title: 'Mahanadi Coalfields Limited (MCL) IPO — Supplied Video Explainer Brief',
    caption:
      'Editorial brief video supplied for Mahanadi Coalfields Limited (MCL) IPO coverage (1024×576 MP4, 20s). Figures shown in the clip reflect user-supplied prospectus material and remain awaiting official verification.',
    sourceNote: 'User-supplied video · Awaiting official DRHP/RHP verification',
    transcript:
      'Hindi visual & audio summary of user-supplied Mahanadi Coalfields Limited (MCL) IPO material: cites 21% domestic coal production contribution in FY26, proposed ₹129–₹136 price band, November 19–23 issue window, up to ₹8,981.12 crore 100% Offer for Sale by Coal India Limited, FY26 EBITDA margin of 47.45% and RoNW of 53.87%, along with closing SEBI verification notice.',
    associatedArticleSlug: 'mahanadi-coalfields-ipo-proposed-offer-financial-details',
  },
  {
    id: 'media-mcl-ipo-brief-2',
    fileName: 'WhatsApp_Video_2026-11-16_at_12.11.13.mp4',
    storagePath: 'public/assets/aistudio/WhatsApp_Video_2026-11-16_at_12.11.13.mp4',
    publicUrl: '/assets/aistudio/WhatsApp_Video_2026-11-16_at_12.11.13.mp4',
    mediaType: 'video/mp4',
    durationSec: 20,
    width: 1024,
    height: 576,
    title: 'Mahanadi Coalfields (MCL) IPO — Supplementary Video Asset',
    caption:
      'Supplementary video material supplied for Mahanadi Coalfields Limited (MCL) IPO coverage.',
    sourceNote: 'User-supplied media · Awaiting official verification',
    associatedArticleSlug: 'mahanadi-coalfields-ipo-proposed-offer-financial-details',
  },
  {
    id: 'media-nhc-foods-q2-fy27',
    fileName: 'nhc_foods_q2_fy27.mp4',
    storagePath: 'public/assets/aistudio/nhc_foods_q2_fy27.mp4',
    publicUrl: '/assets/aistudio/nhc_foods_q2_fy27.mp4',
    mediaType: 'video/mp4',
    durationSec: 15,
    width: 720,
    height: 1280,
    title: 'NHC Foods Q2 FY27 Financial Highlights & Expansion Brief',
    caption:
      'Video coverage reporting NHC Foods Limited Q2 FY27 consolidated income surge of 333%, PAT surge of 1,518%, and strategic 99.98% partnership acquisition in Sachmaas Foods.',
    sourceNote: 'Supplied video dispatch · Corroborated with BSE Corporate Announcement (BSE: 517554)',
    associatedArticleSlug: 'nhc-foods-q2-fy27-results-total-income-surges-pat-jumps-strategic-acquisition',
  },
];

export const MARKET_PULSE_ITEMS: MarketPulseItem[] = [
  {
    id: 'pulse-rbi-policy',
    title: 'RBI Monetary Policy: Repo Rate Kept at 6.50% with Neutral Stance',
    titleHi: 'आरबीआई मौद्रिक नीति: रेपो दर 6.50% पर अपरिवर्तित, तटस्थ रुख बरकरार',
    category: 'RBI',
    source: 'Reserve Bank of India (rbi.org.in)',
    sourceUrl: 'https://www.rbi.org.in',
    verificationStatus: 'verified',
    timestamp: '18 Nov 2026 · Official Resolution',
    summary:
      'The Monetary Policy Committee (MPC) maintained the policy repo rate at 6.50% with standing deposit facility (SDF) rate at 6.25% and marginal standing facility (MSF) rate at 6.75%. The committee reiterated its commitment to aligning headline CPI inflation with the 4.0% medium-term target on a durable basis while supporting growth.',
    summaryHi:
      'मौद्रिक नीति समिति ने रेपो दर को 6.50% पर यथावत रखा। समिति ने विकास को समर्थन देते हुए मुद्रास्फीति को 4.0% के लक्ष्य के अनुरूप बनाए रखने की प्रतिबद्धता दोहराई।',
    actionableContext:
      'Keeps banking lending benchmarks and home loan MCLR/EBLR resets steady. Bond yields remain anchored across the 10-year G-sec curve.',
    relatedPath: '/explainers/rbi-repo-rate-explained',
  },
  {
    id: 'pulse-mcl-ipo',
    title: 'Mahanadi Coalfields: Proposed ₹8,981 Cr OFS by Coal India in Preparation',
    titleHi: 'महानदी कोलफील्ड्स: कोल इंडिया द्वारा ₹8,981 करोड़ का ओएफएस प्रस्तावित',
    category: 'Corporate',
    source: 'Supplied brief · Awaiting official DRHP/RHP verification',
    sourceUrl: 'https://www.sebi.gov.in',
    verificationStatus: 'awaiting_verification',
    timestamp: '17 Nov 2026 · Editorial Dossier',
    summary:
      'User-supplied editorial material outlines a proposed 100% Offer for Sale of 66.18 crore equity shares (10% stake) by Maharatna parent Coal India Limited at ₹129–₹136. All proposed dates (Nov 19–23) and metrics remain subject to official SEBI and exchange filings.',
    summaryHi:
      'कोल इंडिया द्वारा 10% हिस्सेदारी के 66.18 करोड़ शेयरों के प्रस्तावित ऑफर फॉर सेल की सामग्री। आधिकारिक सेबी और एक्सचेंज फाइलिंग के माध्यम से पुष्टि अपेक्षित है।',
    actionableContext:
      'Proceeds from the 100% OFS accrue exclusively to selling shareholder Coal India Limited; MCL receives no fresh capital.',
    relatedPath: '/ipo/mahanadi-coalfields-limited',
  },
  {
    id: 'pulse-india-egypt-trade',
    title: 'India–Egypt Bilateral Dialogue: Discussions on EV, Fintech & Renewable Corridors',
    titleHi: 'भारत-मिस्र वार्ता: ईवी, फिनटेक और स्वच्छ ऊर्जा गलियारे पर चर्चा',
    category: 'Economy',
    source: 'Supplied ministerial brief · Awaiting PIB confirmation',
    sourceUrl: 'https://pib.gov.in',
    verificationStatus: 'awaiting_verification',
    timestamp: '17 Nov 2026 · Trade Dispatch',
    summary:
      'Union Commerce and Industry Minister Shri Piyush Goyal met with Egypt’s Infinity Energy in Cairo alongside an Indian business delegation to explore cross-border clean-energy investments, automotive EV supply chains, and fintech partnerships.',
    summaryHi:
      'केंद्रीय मंत्री पीयूष गोयल ने काहिरा में इन्फिनिटी एनर्जी के साथ ईवी निर्माण, फिनटेक और नवीकरणीय ऊर्जा में द्विपक्षीय सहयोग के अवसरों पर चर्चा की।',
    actionableContext:
      'Expands bilateral commercial engagement across the Suez economic zone and Indian clean mobility manufacturing ecosystems.',
    relatedPath: '/article/india-egypt-explore-cooperation-evs-fintech-renewable-energy',
  },
  {
    id: 'pulse-forex-reserves',
    title: 'India Forex Reserves & FBIL Reference Rate Monitor',
    titleHi: 'भारत का विदेशी मुद्रा भंडार और एफबीआईएल संदर्भ दर',
    category: 'Commodity/FX',
    source: 'FBIL & RBI Weekly Statistical Supplement',
    sourceUrl: 'https://www.rbi.org.in',
    verificationStatus: 'verified',
    timestamp: 'Weekly Supplement · Official Release',
    summary:
      'India’s foreign exchange reserves remain a key buffer covering more than 11 months of imports. FBIL reference rate for USD/INR tracks official interbank fixing at 1:30 PM IST on every working day.',
    summaryHi:
      'भारत का विदेशी मुद्रा भंडार आयात के 11 महीनों से अधिक को कवर करता है। एफबीआईएल संदर्भ दर प्रत्येक कार्य दिवस पर 1:30 बजे प्रकाशित होती है।',
    actionableContext:
      'RBI market operations continue to curb excess volatility in the rupee while absorbing capital flows.',
    relatedPath: '/markets',
  },
  {
    id: 'pulse-sebi-sme-governance',
    title: 'SEBI Strengthens Disclosure & Surveillance Norms for SME Issues',
    titleHi: 'सेबी ने एसएमई निर्गमों के लिए प्रकटीकरण और निगरानी मानदंड कड़े किए',
    category: 'Regulatory',
    source: 'SEBI (sebi.gov.in)',
    sourceUrl: 'https://www.sebi.gov.in',
    verificationStatus: 'verified',
    timestamp: 'Official Gazette & Circulars',
    summary:
      'Capital markets regulator SEBI has tightened eligibility norms, promoter lock-in criteria, and continuous financial reporting disclosures for SME exchange platforms (NSE Emerge and BSE SME) to safeguard retail investors against speculative listing-day price volatility.',
    summaryHi:
      'पूंजी बाजार नियामक सेबी ने खुदरा निवेशकों के हितों की सुरक्षा के लिए एसएमई प्लेटफॉर्म्स के लिए वित्तीय रिपोर्टिंग और पात्रता मानदंड कड़े किए हैं।',
    actionableContext:
      'Issuers on NSE Emerge and BSE SME must maintain enhanced transparency around related-party transactions and objects of the issue.',
    relatedPath: '/explainers/mainboard-vs-sme-ipo',
  },
  {
    id: 'pulse-inflation-cpi',
    title: 'MoSPI National Accounts: Headline CPI & Industrial Production Review',
    titleHi: 'सांख्यिकी मंत्रालय: उपभोक्ता मूल्य सूचकांक और औद्योगिक उत्पादन समीक्षा',
    category: 'Economy',
    source: 'Ministry of Statistics & Programme Implementation (mospi.gov.in)',
    sourceUrl: 'https://www.mospi.gov.in',
    verificationStatus: 'verified',
    timestamp: 'Monthly Official Statistical Release',
    summary:
      'MoSPI publishes Consumer Price Index (CPI) and Index of Industrial Production (IIP) monthly. Food and vegetable price indices remain closely monitored by the central bank and economic advisory councils for monetary policy input.',
    summaryHi:
      'सांख्यिकी मंत्रालय द्वारा सीपीआई और आईआईपी आँकड़े मासिक रूप से जारी किए जाते हैं। खाद्य मूल्य सूचकांक पर नीतिगत निर्णयों के लिए करीबी नजर रखी जाती है।',
    actionableContext:
      'Core inflation (excluding food and fuel) remains contained, supporting long-term sovereign bond yields.',
    relatedPath: '/explainers/inflation-and-cpi',
  },
  {
    id: 'pulse-nhc-foods-q2',
    title: 'NHC Foods Q2 FY27: Total Income Up 333% to ₹451 Cr, PAT Jumps Over 1,500% Amid Acquisition',
    titleHi: 'एनएचसी फूड्स Q2 FY27: कुल आय 333% बढ़कर ₹451 करोड़, PAT 1,500% उछला',
    category: 'Corporate',
    source: 'BSE Corporate Filings (BSE Code 517554)',
    sourceUrl: 'https://www.bseindia.com/stock-share-price/nhc-foods-ltd/nhc-foods/517554/',
    verificationStatus: 'verified',
    timestamp: '18 Nov 2026 · BSE Regulatory Outcome',
    summary:
      'Three-Star Export House NHC Foods reported consolidated Q2 FY27 total income of ₹451.32 Cr (+333% YoY) and PAT of ₹21.68 Cr (+1,518% YoY). Board approved acquiring a 99.98% partnership stake in Sachmaas Foods.',
    summaryHi:
      'थ्री-स्टार एक्सपोर्ट हाउस एनएचसी फूड्स ने Q2 FY27 में ₹451.32 करोड़ की कुल आय और ₹21.68 करोड़ का शुद्ध लाभ दर्ज किया। सचमास फूड्स में 99.98% हिस्सेदारी के अधिग्रहण को मंजूरी।',
    actionableContext:
      'Expands processing footprint in chickpeas and peanuts; H1 FY27 consolidated income crosses ₹821 crore.',
    relatedPath: '/article/nhc-foods-q2-fy27-results-total-income-surges-pat-jumps-strategic-acquisition',
  },
];

export const HOMEPAGE_NEWS_CATEGORIES: HomepageNewsCategory[] = [
  'All',
  'Markets',
  'IPO',
  'Corporate',
  'Economy',
  'RBI',
];

export const ALL_NEWS_CATEGORIES: NewsCategory[] = [
  'All',
  'Markets',
  'IPO',
  'Corporate',
  'Economy',
  'RBI',
  'Banking',
  'Technology',
  'Personal finance',
];

export const ARTICLES_CATALOG: ArticleRecord[] = [
  {
    id: 'art-mcl-ipo',
    slug: 'mahanadi-coalfields-ipo-proposed-offer-financial-details',
    category: 'IPO',
    subCategory: 'Primary Market',
    company: 'Mahanadi Coalfields Limited',
    headline: 'Mahanadi Coalfields IPO: Proposed ₹8,981 Crore Offer and Key Financial Details',
    headlineHi: 'महानदी कोलफील्ड्स IPO: ₹8,981 करोड़ के प्रस्तावित ऑफर और प्रमुख वित्तीय आँकड़ों का विवरण',
    deck: 'User-supplied editorial brief outlining a proposed 100% Offer for Sale of 66.18 crore shares by parent Coal India Limited at ₹129–₹136 per share. All dates and financial claims remain awaiting official DRHP/RHP and exchange verification.',
    deckHi: 'कोल इंडिया लिमिटेड द्वारा 66.18 करोड़ शेयरों के 100% ऑफर फॉर सेल और ₹129–₹136 प्राइस बैंड से जुड़ी प्रदत्त सामग्री। सभी तिथियाँ और आँकड़े आधिकारिक सत्यापन के अधीन हैं।',
    author: 'SakarBazaar Primary Markets Desk',
    authorRole: 'IPO & Disclosures Desk',
    publishedAt: '17 Nov 2026 · 09:05 PM IST',
    updatedAt: '17 Nov 2026 · 09:05 PM IST',
    time: '9:05 PM',
    readTime: '5 min read',
    ticker: 'MCL',
    sourceName: 'Supplied editorial material (Unverified)',
    sourceUrl: null,
    sourceNote: 'Awaiting Official Verification · Verify via SEBI, Coal India & NSE/BSE filings',
    verificationStatus: 'awaiting_verification',
    editorialStatus: 'Awaiting Verification',
    illustration: 'ipo-book',
    illustrationCaption:
      'Editorial brief illustration for Mahanadi Coalfields Limited (MCL) proposed Offer for Sale.',
    tags: ['IPO', 'MCL', 'Mahanadi Coalfields', 'Coal India', 'OFS', 'PSU', 'Coal', 'Odisha'],
    keywords: [
      'Mahanadi Coalfields Limited',
      'MCL IPO',
      'Coal India Limited',
      'CIL',
      'Offer for Sale',
      'OFS',
      '₹8,981.12 crore',
      '₹129-₹136',
      'Talcher',
      'Ib Valley',
      'Odisha',
      'NCWA-XII',
      'SEBI',
      'DRHP',
      'RHP',
      'NSE',
      'BSE',
    ],
    entities: [
      'Mahanadi Coalfields Limited',
      'Coal India Limited',
      'SEBI',
      'NSE',
      'BSE',
      'Talcher coalfields',
      'Ib Valley coalfields',
    ],
    aliases: ['mcl', 'mahanadi', 'coal india', 'cil', 'coal', 'ipo', 'ipos', 'ofs', 'psu'],
    keyPoints: [
      'Verification notice: All dates, issue size, valuation, production share, and financial metrics below come from user-supplied editorial material and remain awaiting official DRHP/RHP, Coal India, and NSE/BSE verification.',
      'Proposed offer structure: 100% Offer for Sale (OFS) of 66.18 crore equity shares (10% stake) by selling shareholder Coal India Limited, with offer proceeds going to Coal India Limited.',
      'Supplied price band & size: ₹129–₹136 per share, implying an offer of up to ₹8,981.12 crore and ₹90,009.74 crore valuation at the upper band, with proposed dates November 19–23, 2026.',
      'Supplied FY26 financial highlights: ₹30,549.59 crore operating revenue, 47.45% EBITDA margin, ₹10,698.12 crore PAT, 53.87% Return on Net Worth, and ₹2.76 crore debt.',
    ],
    sections: [
      {
        heading: 'Company overview (as described in supplied material)',
        paragraphs: [
          'According to editorial source material submitted to SakarBazaar, Mahanadi Coalfields Limited (MCL) is a wholly owned subsidiary of Maharatna public sector enterprise Coal India Limited. The supplied material describes MCL as India’s largest single coal producer, stating that it contributed 21% of domestic coal output in FY26.',
          'Operations are described as spanning 17 mines across Odisha’s Talcher and Ib Valley coalfields. These production, mine-count, and market-share figures require confirmation against official Coal India Limited and MCL disclosures and filed offer documents.',
        ],
      },
      {
        heading: 'Proposed IPO structure (awaiting official confirmation)',
        paragraphs: [
          'The supplied material states that the proposed public issue would open on 19 November 2026 and close on 23 November 2026 in a price band of ₹129 to ₹136 per equity share. At the upper end of that band, the issue size is stated as up to ₹8,981.12 crore, implying a total valuation of ₹90,009.74 crore.',
          'Because the transaction is described as a 100% Offer for Sale of 66.18 crore equity shares representing a 10% stake by Coal India Limited, MCL itself would not receive fresh capital from the offering; proceeds would accrue to selling shareholder Coal India Limited. SakarBazaar does not list these dates or terms as confirmed open or upcoming schedule items until the official RHP and exchange notices are verified.',
        ],
      },
      {
        heading: 'Supplied financial performance & risk monitorables',
        paragraphs: [
          'The supplied brief reports FY26 operating revenue of ₹30,549.59 crore, an EBITDA margin of 47.45%, profit after tax (PAT) of ₹10,698.12 crore, Return on Net Worth (RoNW) of 53.87%, and debt of ₹2.76 crore. For H1 FY27, the supplied material cites revenue of ₹16,093.04 crore (+9.29% YoY) and PAT of ₹4,880.66 crore (+6.71% YoY).',
          'Supplied risk factors and monitorables highlight rising receivables from state power utilities, pending NCWA-XII wage revisions, disputed tax liabilities, and legal contingent liabilities. Readers should independently review the risk factors and restated financial statements in official SEBI prospectus filings once available.',
        ],
      },
    ],
    financialMetrics: [
      { metric: 'Proposed issue window (unverified)', value: '19–23 Nov 2026' },
      { metric: 'Supplied price band', value: '₹129 – ₹136 per share' },
      { metric: 'Supplied issue size', value: 'Up to ₹8,981.12 crore' },
      { metric: 'Upper-band valuation', value: '₹90,009.74 crore' },
      { metric: 'Offer structure', value: '100% OFS · 66.18 Cr shares (10%)' },
      { metric: 'Selling shareholder', value: 'Coal India Limited' },
      { metric: 'FY26 operating revenue', value: '₹30,549.59 crore' },
      { metric: 'FY26 EBITDA margin', value: '47.45%' },
      { metric: 'FY26 Profit After Tax (PAT)', value: '₹10,698.12 crore' },
      { metric: 'FY26 Return on Net Worth (RoNW)', value: '53.87%' },
      { metric: 'Debt (supplied)', value: '₹2.76 crore' },
      { metric: 'H1 FY27 revenue (YoY)', value: '₹16,093.04 crore (+9.29%)' },
      { metric: 'H1 FY27 PAT (YoY)', value: '₹4,880.66 crore (+6.71%)' },
    ],
    risksAndMonitorables: [
      'Rising receivables from state power utilities.',
      'Pending NCWA-XII wage revisions and employee cost impact.',
      'Disputed tax liabilities and ongoing legal contingent liabilities.',
    ],
    verificationChecklist: [
      'Verify official DRHP / RHP filing on SEBI (sebi.gov.in).',
      'Verify official Coal India Limited and Mahanadi Coalfields Limited disclosures.',
      'Confirm exchange issue window, price band, share count, and OFS terms on NSE & BSE.',
      'Reconcile FY26 & H1 FY27 financial statements and domestic coal output share claims.',
    ],
    citations: [
      OFFICIAL_PORTAL_REFERENCES.sebi,
      OFFICIAL_PORTAL_REFERENCES.nse,
      OFFICIAL_PORTAL_REFERENCES.bse,
    ],
    media: MEDIA_ASSETS[0],
    relatedSlugs: ['india-egypt-explore-cooperation-evs-fintech-renewable-energy'],
    isFeatured: true,
    isPopular: true,
    isHomepageFeed: true,
  },
  {
    id: 'art-india-egypt-trade',
    slug: 'india-egypt-explore-cooperation-evs-fintech-renewable-energy',
    category: 'Economy',
    subCategory: 'International Trade',
    company: 'Infinity Energy',
    headline: 'India and Egypt Explore Cooperation in EVs, Fintech and Renewable Energy',
    headlineHi: 'भारत और मिस्र ने ईवी, फिनटेक और नवीकरणीय ऊर्जा में सहयोग की संभावनाएँ तलाशीं',
    deck: 'User-supplied editorial note describing discussions in Cairo between Union Commerce and Industry Minister Shri Piyush Goyal, an Indian business delegation, and Egypt’s Infinity Energy. Awaiting confirmation from official Commerce Ministry / PIB releases.',
    deckHi: 'काहिरा में केंद्रीय वाणिज्य एवं उद्योग मंत्री श्री पीयूष गोयल, भारतीय व्यापार प्रतिनिधिमंडल और मिस्र की इन्फिनिटी एनर्जी के बीच संभावित सहयोग पर प्रदत्त रिपोर्ट। आधिकारिक PIB/मंत्रालय पुष्टि शेष है।',
    author: 'SakarBazaar Policy & Trade Desk',
    authorRole: 'Economy & International Trade Desk',
    publishedAt: '17 Nov 2026 · 09:05 PM IST',
    updatedAt: '17 Nov 2026 · 09:05 PM IST',
    time: '9:05 PM',
    readTime: '3 min read',
    ticker: 'TRADE',
    sourceName: 'Supplied editorial material (Unverified)',
    sourceUrl: null,
    sourceNote: 'Awaiting Official Verification · Verify via Ministry of Commerce / PIB',
    verificationStatus: 'awaiting_verification',
    editorialStatus: 'Awaiting Verification',
    illustration: 'corporate-corridor',
    illustrationCaption:
      'Editorial illustration: India–Egypt industrial, clean-energy, EV, and fintech bilateral corridor.',
    tags: [
      'Piyush Goyal',
      'Egypt',
      'India–Egypt relations',
      'Infinity Energy',
      'Electric vehicles',
      'EV manufacturing',
      'Fintech',
      'Renewable energy',
      'International trade',
      'Clean energy',
      'Bilateral investment',
    ],
    keywords: [
      'Piyush Goyal',
      'Egypt',
      'Cairo',
      'India Egypt',
      'Infinity Energy',
      'Electric vehicles',
      'EV manufacturing',
      'Automotive manufacturing',
      'Fintech',
      'Renewable energy',
      'International trade',
      'Clean energy',
      'Bilateral investment',
      'Sustainable mobility',
      'Infrastructure development',
    ],
    entities: [
      'Shri Piyush Goyal',
      'Infinity Energy',
      'Ministry of Commerce and Industry',
      'India',
      'Egypt',
      'Cairo',
    ],
    aliases: ['ev', 'evs', 'fintech', 'clean energy', 'renewable', 'egypt', 'trade', 'cairo'],
    keyPoints: [
      'Verification notice: Meeting details, participants, and discussion points below come from user-supplied editorial material and await confirmation against official Ministry of Commerce or PIB releases.',
      'Focus sectors in supplied brief: Automotive manufacturing, electric vehicles (EVs), fintech, renewable energy, sustainable mobility, and infrastructure development.',
      'Delegation context: Discussions were described as taking place in Cairo alongside an Indian business delegation exploring cross-border investments and clean-energy supply chains.',
    ],
    sections: [
      {
        heading: 'Areas of bilateral discussion (from supplied material)',
        paragraphs: [
          'According to supplied editorial material, Union Commerce and Industry Minister Shri Piyush Goyal met with Egypt-based Infinity Energy to explore deeper bilateral cooperation spanning automotive manufacturing, electric vehicles, financial technology (fintech), and renewable energy.',
          'The supplied summary notes that the discussions took place during a high-level visit to Cairo alongside a major Indian business delegation, focusing on expanding cross-border investments, strengthening clean-energy supply chains, and encouraging industrial partnerships between Indian and Egyptian enterprises.',
        ],
      },
      {
        heading: 'Sustainable mobility & verification status',
        paragraphs: [
          'Both sides were described in the supplied material as highlighting potential for joint ventures in sustainable mobility and infrastructure development. No specific financial commitments, binding agreements, meeting dates, or direct official quotations were supplied.',
          'In line with SakarBazaar editorial standards, this report is retained as Awaiting Official Verification until confirmed via official Press Information Bureau (PIB) or Ministry of Commerce and Industry communications.',
        ],
      },
    ],
    verificationChecklist: [
      'Verify official meeting confirmation, exact date, and participant list via PIB (pib.gov.in).',
      'Check Ministry of Commerce & Industry (commerce.gov.in) bilateral visit releases.',
      'Confirm any formal joint statements or MoUs before marking as verified reporting.',
    ],
    citations: [OFFICIAL_PORTAL_REFERENCES.pib, OFFICIAL_PORTAL_REFERENCES.commerce],
    relatedSlugs: ['mahanadi-coalfields-ipo-proposed-offer-financial-details'],
    isFeatured: false,
    isPopular: true,
    isHomepageFeed: true,
  },
  {
    id: 'art-nhc-foods-q2-fy27',
    slug: 'nhc-foods-q2-fy27-results-total-income-surges-pat-jumps-strategic-acquisition',
    category: 'Corporate',
    subCategory: 'Earnings & M&A',
    company: 'NHC Foods Limited',
    headline: 'NHC Foods Q2 FY27 Results: Total Income Surges 333%, PAT Jumps Over 1,500% Amid Strategic Acquisition',
    headlineHi: 'एनएचसी फूड्स Q2 FY27 नतीजे: कुल आय में 333% की वृद्धि, रणनीतिक अधिग्रहण के बीच PAT 1,500% से अधिक उछला',
    deck: 'NHC Foods Limited (BSE: 517554), a Government Recognised Three-Star Export House, reports consolidated total income of ₹451.32 crore and profit after tax of ₹21.68 crore for Q2 FY27, while the Board approves acquiring a 99.98% stake in Sachmaas Foods.',
    deckHi: 'बीएसई-सूचीबद्ध कृषि-कमोडिटी कंपनी और थ्री-स्टार एक्सपोर्ट हाउस एनएचसी फूड्स ने Q2 FY27 में ₹451.32 करोड़ की कुल आय और ₹21.68 करोड़ का शुद्ध लाभ दर्ज किया, साथ ही सचमास फूड्स के 99.98% अधिग्रहण को मंजूरी दी।',
    author: 'SakarBazaar Corporate Desk',
    authorRole: 'Agro-Commodities & Corporate Earnings',
    publishedAt: '18 Nov 2026 · 11:30 AM IST',
    updatedAt: '18 Nov 2026 · 11:30 AM IST',
    time: '11:30 AM',
    readTime: '4 min read',
    ticker: 'NHCFOODS (517554)',
    sourceName: 'BSE Regulatory Corporate Announcements (Scrip: 517554)',
    sourceUrl: 'https://www.bseindia.com/stock-share-price/nhc-foods-ltd/nhc-foods/517554/',
    sourceNote: 'Official BSE Financial Results Filing & Corporate Disclosures · BSE Code 517554',
    verificationStatus: 'verified',
    editorialStatus: 'Published',
    illustration: 'corporate-corridor',
    illustrationCaption: 'NHC Foods Limited: Processing and international distribution of agro-commodities and consumer food products.',
    tags: [
      'NHC Foods',
      'BSE: 517554',
      'Q2 FY27',
      'Financial Results',
      'Sachmaas Foods',
      'Agro-commodities',
      'Three-Star Export House',
      'Corporate Governance',
    ],
    keywords: [
      'NHC Foods Limited',
      '517554',
      'Q2 FY27',
      'H1 FY27',
      'Sachmaas Foods',
      'Total Income',
      'Profit After Tax',
      'PAT',
      'Export House',
      'Agro commodities',
      'Chickpeas',
      'Peanuts',
      'BSE',
    ],
    entities: [
      'NHC Foods Limited',
      'Sachmaas Foods',
      'BSE Limited',
      'Government of India Export House',
    ],
    aliases: ['nhc', 'nhc foods', 'nhcfoods', '517554', 'sachmaas'],
    keyPoints: [
      'Q2 FY27 financial performance: Consolidated total income surged 333% year-on-year to ₹451.32 crore, compared to the corresponding period of the previous financial year.',
      'Profit after tax trajectory: PAT jumped approximately 1,518% to ₹21.68 crore, compared with ₹1.34 crore in Q2 FY26.',
      'Half-year FY27 consolidated performance: Total income expanded 282% to ₹821.45 crore, while net profit rose approximately 1,185% to ₹38.68 crore.',
      'Strategic partnership acquisition: The Board of Directors approved an investment in a 99.98% partnership stake in Sachmaas Foods, engaged in manufacturing, processing, repacking and trading of chickpeas, peanuts and allied food products.',
      'Corporate restructuring: Appointment of an Executive Director and a Company Secretary & Compliance Officer to reinforce governance standards.',
    ],
    sections: [
      {
        heading: 'Exceptional Financial Trajectory in Q2 FY27',
        paragraphs: [
          'NHC Foods Limited, a BSE-listed agro-commodities and FMCG enterprise and a Government Recognised Three-Star Export House (BSE Scrip Code: 517554), has reported exceptional consolidated financial results for the second quarter of FY27.',
          'Consolidated total income for Q2 FY27 surged 333% year-on-year to ₹451.32 crore, reflecting strong execution across its export pipelines and domestic distribution networks. Profit after tax (PAT) jumped approximately 1,518% to ₹21.68 crore, compared with ₹1.34 crore in the corresponding quarter of the previous financial year.',
        ],
      },
      {
        heading: 'First-Half (H1 FY27) Consolidated Highlights',
        paragraphs: [
          'The growth momentum was sustained across the first six months of the fiscal year. For H1 FY27, NHC Foods recorded consolidated total income of ₹821.45 crore, representing a 282% increase compared to ₹215.11 crore reported in H1 of the prior fiscal.',
          'Consolidated net profit for the half-year rose approximately 1,185% to ₹38.68 crore, driven by operating leverage, improved procurement efficiencies, and expanding export market realization across key agricultural commodity categories.',
        ],
      },
      {
        heading: 'Strategic Acquisition: 99.98% Stake in Sachmaas Foods',
        paragraphs: [
          'Further strengthening its business portfolio and value-added processing capabilities, the Board of Directors approved an investment in a 99.98% stake in Sachmaas Foods.',
          'Sachmaas Foods is an established partnership firm engaged in the manufacturing, processing, repacking and trading of chickpeas, peanuts, and other allied agricultural food products. The transaction provides NHC Foods with expanded processing infrastructure, localized procurement networks, and enhanced product variety for both domestic FMCG distribution and overseas markets.',
        ],
      },
      {
        heading: 'Board Restructuring & Corporate Governance',
        paragraphs: [
          'Alongside its financial and operational milestones, NHC Foods undertook executive and board-level restructuring to strengthen compliance and governance.',
          'The company announced the appointment of an Executive Director to oversee operational scale-up, as well as a new Company Secretary and Compliance Officer. These steps align management capacity with the enterprise’s rapid scale expansion across agricultural commodities and packaged foods.',
        ],
      },
    ],
    financialMetrics: [
      { metric: 'Q2 FY27 Total Income', value: '₹451.32 Cr (+333% YoY)' },
      { metric: 'Q2 FY27 Profit After Tax (PAT)', value: '₹21.68 Cr (+1,518% YoY)' },
      { metric: 'H1 FY27 Total Income', value: '₹821.45 Cr (+282% YoY)' },
      { metric: 'H1 FY27 Profit After Tax (PAT)', value: '₹38.68 Cr (+1,185% YoY)' },
      { metric: 'Sachmaas Foods Stake Acquired', value: '99.98% Partnership Stake' },
      { metric: 'BSE Scrip Code', value: '517554 (NHC Foods Ltd)' },
      { metric: 'Recognition', value: 'Govt. Recognised Three-Star Export House' },
    ],
    risksAndMonitorables: [
      'Agro-commodity price volatility and seasonal crop yields across domestic mandis.',
      'Integration and margin realization from the Sachmaas Foods processing footprint.',
      'Foreign exchange fluctuation given the enterprise’s significant export orientation.',
    ],
    verificationChecklist: [
      'Verified against BSE Corporate Announcements (BSE Code 517554).',
      'Unaudited financial results filed with BSE under Regulation 33 of SEBI LODR.',
      'Board meeting outcome for Sachmaas Foods partnership acquisition confirmed via exchange filings.',
    ],
    citations: [
      OFFICIAL_PORTAL_REFERENCES.bse,
      {
        id: 'cit-bse-nhc',
        label: 'BSE Company Profile & Announcements — NHC Foods Ltd',
        portalName: 'BSE India (Scrip Code 517554)',
        url: 'https://www.bseindia.com/stock-share-price/nhc-foods-ltd/nhc-foods/517554/',
        note: 'Official stock exchange repository for quarterly financial filings, corporate actions, and board outcomes.',
      },
    ],
    media: MEDIA_ASSETS[2],
    relatedSlugs: [
      'mahanadi-coalfields-ipo-proposed-offer-financial-details',
      'india-egypt-explore-cooperation-evs-fintech-renewable-energy',
    ],
    isFeatured: false,
    isPopular: true,
    isHomepageFeed: true,
  },
];

export const NEWS_ITEMS: NewsItem[] = ARTICLES_CATALOG.filter(
  (article) => article.isHomepageFeed,
).map((article) => ({
  id: article.id,
  slug: article.slug,
  time: article.time,
  category: article.category,
  subCategory: article.subCategory,
  headline: article.headline,
  headlineHi: article.headlineHi,
  ticker: article.ticker,
  sourceNote: article.sourceNote,
  verificationStatus: article.verificationStatus,
  summary: article.deck,
  paragraphs: article.sections.flatMap((sec) => sec.paragraphs),
}));

// Keep confirmed IPO records strictly separated from unverified submissions.
// Mahanadi Coalfields Limited appears only as an editorial "Awaiting Official Verification" dossier
// and is excluded from confirmed Open/Upcoming issue counts until verified against SEBI/NSE/BSE filings.
export const IPO_ALL_RECORDS: IpoRow[] = [
  {
    id: 'ipo-mcl-editorial',
    slug: 'mahanadi-coalfields-limited',
    segment: 'Mainboard',
    status: 'Awaiting Verification',
    verificationStatus: 'awaiting_verification',
    company: 'Mahanadi Coalfields Limited',
    exchange: 'Awaiting official exchange confirmation',
    issueSize: 'Up to ₹8,981.12 Cr (supplied)',
    upperBandValuation: '₹90,009.74 Cr (supplied upper band)',
    priceBand: '₹129–₹136 (supplied)',
    openDate: '19 Nov 2026 (unverified)',
    closeDate: '23 Nov 2026 (unverified)',
    allotmentDate: null,
    listingDate: null,
    offerType: '100% Offer for Sale (OFS)',
    sharesOffered: '66.18 crore equity shares',
    stakePercent: '10%',
    sellingShareholder: 'Coal India Limited',
    proceedsRecipient: 'Coal India Limited (OFS proceeds)',
    summary:
      'Wholly owned coal-mining subsidiary of Maharatna PSU Coal India Limited operating across 17 mines in Odisha (Talcher and Ib Valley). Proposed issue details and financials shown are user-supplied material awaiting official DRHP/RHP and exchange verification.',
    sourceName: 'Supplied editorial material (Awaiting DRHP/RHP & exchange confirmation)',
    sourceUrl: null,
    officialDocuments: [
      OFFICIAL_PORTAL_REFERENCES.sebi,
      OFFICIAL_PORTAL_REFERENCES.nse,
      OFFICIAL_PORTAL_REFERENCES.bse,
    ],
    financialMetrics: ARTICLES_CATALOG[0].financialMetrics,
    risksAndMonitorables: ARTICLES_CATALOG[0].risksAndMonitorables,
    verificationChecklist: ARTICLES_CATALOG[0].verificationChecklist,
    keywords: [
      'Mahanadi Coalfields Limited',
      'MCL',
      'Coal India Limited',
      'CIL',
      'IPO',
      'Mainboard',
      'OFS',
      'Offer for Sale',
      'Odisha',
      'Coal',
    ],
    entities: ['Mahanadi Coalfields Limited', 'Coal India Limited', 'SEBI', 'NSE', 'BSE'],
    aliases: ['mcl', 'mahanadi', 'coal india', 'cil', 'coal', 'ipo', 'ipos'],
    relatedArticleSlug: 'mahanadi-coalfields-ipo-proposed-offer-financial-details',
    lastVerifiedAt: null,
  },
];

// Confirmed calendar events only — no invented dates or unverified IPO open/listing schedules.
export const CALENDAR_SCHEDULE: CalendarScheduleItem[] = [];

export const EXPLAINERS_CATALOG: ExplainerRecord[] = [
  {
    id: 'exp-1',
    slug: 'ipo-basics',
    tag: 'Primary Market',
    tagHi: 'प्राइमरी मार्केट',
    readTime: '5 min read',
    title: 'IPO basics: Fresh issue, Offer for Sale, and price bands explained',
    titleHi: 'IPO की बुनियादी बातें: फ्रेश इश्यू, OFS और प्राइस बैंड',
    summary:
      'How a private Indian company raises public equity, what goes into a DRHP/RHP, and the difference between growth capital and promoter exits.',
    summaryHi:
      'भारतीय कंपनियाँ पब्लिक इक्विटी कैसे जुटाती हैं और फ्रेश इश्यू बनाम OFS में क्या अंतर है।',
    illustration: 'ipo-book',
    keywords: ['IPO', 'Fresh Issue', 'Offer for Sale', 'OFS', 'DRHP', 'RHP', 'Price Band', 'Primary Market'],
    aliases: ['ipo', 'ipos', 'ofs', 'drhp', 'rhp', 'primary market'],
    disclaimer:
      'Educational guide: Numeric examples used in this explainer are strictly hypothetical illustrations, not live market quotes.',
    keyPoints: [
      'Fresh issue proceeds enter the company’s balance sheet for capex, debt repayment, or working capital.',
      'Offer for Sale (OFS) proceeds go to selling promoters or existing shareholders rather than the issuer.',
      'Lot size sets the minimum rupee commitment per retail application.',
    ],
    sections: [
      {
        heading: 'Fresh Issue vs Offer for Sale (OFS)',
        paragraphs: [
          'Every IPO prospectus (RHP) specifies how much money is raised via new shares (Fresh Issue) versus existing shares sold by current holders (OFS). Reading the "Objects of the Issue" chapter shows whether capital funds company expansion or provides an exit to existing shareholders.',
        ],
      },
      {
        heading: 'Book-building and Price Bands',
        paragraphs: [
          'In book-built IPOs, issuers announce a floor and cap price (as a hypothetical example, ₹100–₹110 per share). Investor bids across QIB, NII, and Retail buckets help determine the final issue price within that band.',
        ],
      },
    ],
  },
  {
    id: 'exp-2',
    slug: 'ipo-subscription-explained',
    tag: 'Allotment Rules',
    tagHi: 'अलॉटमेंट नियम',
    readTime: '4 min read',
    title: 'Cut-off price vs limit bid: IPO subscription & allotment explained',
    titleHi: 'कट-ऑफ प्राइस बनाम लिमिट बिड: IPO सब्सक्रिप्शन और अलॉटमेंट',
    summary:
      'What happens when you tick Cut-off, how QIB/NII/Retail quotas work, and how lottery allotment decides oversubscribed issues.',
    summaryHi:
      'कट-ऑफ चुनने पर क्या होता है और ओवरसब्सक्राइब्ड IPO में अलॉटमेंट कैसे तय होता है।',
    illustration: 'ipo-book',
    keywords: ['IPO', 'Cut-off', 'Limit Bid', 'QIB', 'NII', 'RII', 'Allotment', 'ASBA', 'Subscription'],
    aliases: ['ipo', 'ipos', 'allotment', 'subscription', 'retail', 'qib', 'nii'],
    keyPoints: [
      'Retail investors (up to ₹2 lakh) can bid at Cut-off to stay eligible regardless of final discovered price.',
      'Oversubscribed retail books allocate at least one minimum lot per selected applicant via computerized draw.',
      'Multiple applications under the same PAN are rejected.',
    ],
    sections: [
      {
        heading: 'Cut-off vs Limit Bid',
        paragraphs: [
          'Ticking the Cut-off option means you agree to accept shares at whatever final issue price is discovered within the band. If demand pushes the final price to the cap price, limit bids placed at a lower price become ineligible.',
        ],
      },
      {
        heading: 'How QIB, NII, and Retail quotas differ',
        paragraphs: [
          'Standard mainboard issues typically earmark 50% for Qualified Institutional Buyers (QIBs), 15% for Non-Institutional Investors (NII/HNI), and 35% for Retail Individual Investors (RIIs).',
        ],
      },
    ],
  },
  {
    id: 'exp-3',
    slug: 'gmp-explained',
    tag: 'Risk & Regulation',
    tagHi: 'जोखिम और नियम',
    readTime: '4 min read',
    title: 'GMP explained: What Grey Market Premium is — and why it is unreliable',
    titleHi: 'GMP क्या है और यह अनियंत्रित क्यों माना जाता है',
    summary:
      'An objective look at unofficial pre-listing quotes, why they are unregulated, and why investors should rely on RHP fundamentals instead.',
    summaryHi:
      'अनौपचारिक प्री-लिस्टिंग प्रीमियम की वास्तविकता और SEBI-पंजीकृत दस्तावेज़ों पर भरोसा क्यों जरूरी है।',
    illustration: 'personal-finance',
    keywords: ['GMP', 'Grey Market Premium', 'IPO', 'SEBI', 'RHP', 'Listing'],
    aliases: ['gmp', 'grey market premium', 'ipo', 'ipos', 'sebi'],
    disclaimer:
      'Important disclaimer: Grey Market Premium (GMP) refers to unregulated, unofficial over-the-counter quotes outside SEBI and exchange oversight. SakarBazaar does not publish, endorse, or verify GMP figures, and GMP never predicts or guarantees listing-day prices.',
    keyPoints: [
      'GMP trades occur outside NSE, BSE, and SEBI jurisdiction with zero settlement guarantee.',
      'Thin informal volumes can swing sharply or be manipulated before listing day.',
      'RHP financials, valuation multiples, and risk factors are the only verified decision inputs.',
    ],
    sections: [
      {
        heading: 'Why grey market quotes exist',
        paragraphs: [
          'Between an IPO’s closing date and exchange listing day, informal cash-settled expectations circulate in unregulated circles. Because there is no central order book or clearing corporation, quotes vary widely and lack transparency.',
        ],
      },
      {
        heading: 'What to examine instead',
        paragraphs: [
          'Evaluate audited financial statements in the Red Herring Prospectus (RHP), peer valuation comparisons, debt levels, and contingent liabilities filed with SEBI.',
        ],
      },
    ],
  },
  {
    id: 'exp-4',
    slug: 'primary-vs-secondary-markets',
    tag: 'Market Structure',
    tagHi: 'बाज़ार संरचना',
    readTime: '4 min read',
    title: 'Primary vs secondary markets: Where capital is raised vs traded',
    titleHi: 'प्राइमरी बनाम सेकेंडरी मार्केट: पूंजी जुटाना और ट्रेडिंग',
    summary:
      'Tracing a share’s journey from IPO issuance in the primary market to daily price discovery on NSE and BSE.',
    summaryHi:
      'IPO से शेयर जारी होने से लेकर NSE/BSE पर दैनिक ट्रेडिंग तक की पूरी प्रक्रिया।',
    illustration: 'markets-pulse',
    keywords: ['Primary Market', 'Secondary Market', 'IPO', 'NSE', 'BSE', 'FPO', 'QIP'],
    aliases: ['primary market', 'secondary market', 'market', 'markets', 'ipo', 'ipos'],
    keyPoints: [
      'Primary market transactions occur directly between the issuer (or selling shareholders) and investors.',
      'Secondary market trades occur between investors on NSE and BSE without changing company capital.',
    ],
    sections: [
      {
        heading: 'Capital formation vs liquidity',
        paragraphs: [
          'Companies receive proceeds only in the primary market (IPOs, FPOs, rights issues, or QIPs). Once listed, secondary market liquidity allows existing investors to enter or exit at live bid-ask prices.',
        ],
      },
    ],
  },
  {
    id: 'exp-5',
    slug: 'fii-and-dii',
    tag: 'Institutional Flows',
    tagHi: 'संस्थागत प्रवाह',
    readTime: '4 min read',
    title: 'FII and DII flows: How foreign and domestic institutions move markets',
    titleHi: 'FII और DII प्रवाह: विदेशी और घरेलू संस्थागत निवेशक',
    summary:
      'Understanding daily provisional cash-market net buy/sell numbers and why DII SIP inflows matter.',
    summaryHi:
      'दैनिक FII/DII नेट खरीद-बिक्री आँकड़ों और घरेलू म्यूचुअल फंड SIP की भूमिका को समझना।',
    illustration: 'banking-ledger',
    keywords: ['FII', 'FPI', 'DII', 'Institutional Flows', 'Mutual Funds', 'SIP'],
    aliases: ['fii', 'fpi', 'dii', 'flows', 'markets'],
    keyPoints: [
      'FIIs/FPIs allocate capital across global emerging markets based on US yields, USD strength, and valuations.',
      'DIIs—including Indian mutual funds, insurers, and pension funds—deploy steady domestic household savings.',
    ],
    sections: [
      {
        heading: 'Why daily provisional figures should be read in trends',
        paragraphs: [
          'Single-day FII or DII net numbers often reflect block deals or index rebalancing. Multi-session and monthly trends give a clearer picture of institutional appetite.',
        ],
      },
    ],
  },
  {
    id: 'exp-6',
    slug: 'rbi-policy',
    tag: 'Monetary Policy',
    tagHi: 'मौद्रिक नीति',
    readTime: '5 min read',
    title: 'RBI policy decoded: Repo rate, CRR, and liquidity stance',
    titleHi: 'RBI की मौद्रिक नीति: रेपो दर, CRR और लिक्विडिटी रुख',
    summary:
      'How the six-member Monetary Policy Committee sets short-term interest rates and steers bank lending costs.',
    summaryHi:
      'छह-सदस्यीय MPC अल्पकालिक ब्याज दरों और बैंकों की उधारी लागत को कैसे प्रभावित करती है।',
    illustration: 'rbi-dial',
    keywords: ['RBI', 'Reserve Bank of India', 'Repo Rate', 'MPC', 'CRR', 'SDF', 'MSF', 'Monetary Policy'],
    aliases: ['rbi', 'reserve bank of india', 'repo', 'mpc', 'crr', 'banking'],
    keyPoints: [
      'Repo rate is the rate at which the RBI lends overnight funds to commercial banks against government securities.',
      'External benchmark-linked loans (EBLR) pass repo changes quickly to retail home and MSME borrowers.',
    ],
    sections: [
      {
        heading: 'The policy rate corridor',
        paragraphs: [
          'Alongside the repo rate, the Standing Deposit Facility (SDF) acts as the floor and the Marginal Standing Facility (MSF) acts as the ceiling for overnight money-market rates.',
        ],
      },
    ],
  },
  {
    id: 'exp-7',
    slug: 'inflation',
    tag: 'Macroeconomics',
    tagHi: 'मैक्रोइकॉनॉमिक्स',
    readTime: '4 min read',
    title: 'Inflation in India: Headline CPI vs Core CPI vs WPI',
    titleHi: 'भारत में मुद्रास्फीति: हेडलाइन CPI, कोर CPI और WPI',
    summary:
      'Why food prices sway headline CPI, why the RBI watches core inflation closely, and how wholesale prices differ.',
    summaryHi:
      'खाद्य कीमतें हेडलाइन CPI को कैसे प्रभावित करती हैं और RBI कोर महंगाई पर नज़र क्यों रखता है।',
    illustration: 'economy-cpi',
    keywords: ['CPI', 'WPI', 'Inflation', 'Core Inflation', 'RBI', 'MoSPI', 'Economy'],
    aliases: ['cpi', 'wpi', 'inflation', 'economy', 'rbi', 'mospi'],
    keyPoints: [
      'Food and beverages carry roughly 45.9% weight in India’s retail CPI basket.',
      'Core CPI strips out volatile food and fuel items to measure underlying demand pressures.',
    ],
    sections: [
      {
        heading: 'Retail vs Wholesale baskets',
        paragraphs: [
          'CPI tracks what households pay for goods and services, making it the RBI’s formal inflation-targeting anchor (4% ± 2%), whereas WPI measures factory-gate goods prices.',
        ],
      },
    ],
  },
  {
    id: 'exp-8',
    slug: 'financial-terminology',
    tag: 'Glossary',
    tagHi: 'शब्दावली',
    readTime: '6 min read',
    title: 'Indian market glossary: Key terms from ASBA to VIX',
    titleHi: 'भारतीय बाज़ार शब्दावली: ASBA से VIX तक प्रमुख शब्द',
    summary:
      'Quick reference definitions for everyday acronyms across equities, IPO filings, and RBI bulletins.',
    summaryHi:
      'शेयर बाज़ार, IPO और RBI बुलेटिन में प्रयुक्त प्रमुख शब्दों की सरल परिभाषाएँ।',
    illustration: 'tech-grid',
    keywords: ['Glossary', 'ASBA', 'DRHP', 'RHP', 'FII', 'DII', 'India VIX', 'Market Cap', 'Repo Rate'],
    aliases: ['asba', 'drhp', 'rhp', 'vix', 'glossary', 'ipo', 'rbi', 'fii', 'dii'],
    keyPoints: [
      'Covers primary-market, equity valuation, and central-bank terms in plain English.',
    ],
    sections: [
      {
        heading: 'Essential terms at a glance',
        paragraphs: [
          'Use this glossary alongside our IPO Desk and Markets pages whenever encountering regulatory or filing abbreviations.',
        ],
      },
    ],
    glossaryTerms: [
      { term: 'ASBA', meaning: 'Application Supported by Blocked Amount — funds stay in your bank account earning interest until IPO allotment.' },
      { term: 'DRHP / RHP', meaning: 'Draft / Red Herring Prospectus filed with SEBI containing audited financials, risk factors, and issue details.' },
      { term: 'FII / FPI', meaning: 'Foreign Institutional / Portfolio Investors registered with SEBI to invest in Indian securities.' },
      { term: 'DII', meaning: 'Domestic Institutional Investors such as Indian mutual funds, insurance companies, and banks.' },
      { term: 'India VIX', meaning: 'Implied near-term volatility index derived from Nifty 50 option prices.' },
      { term: 'Market Cap', meaning: 'Total equity value of a listed company (share price × total outstanding shares).' },
      { term: 'Repo Rate', meaning: 'Benchmark overnight lending rate from the RBI to banks against collateralized G-Secs.' },
      { term: 'Basis Point (bps)', meaning: 'One-hundredth of a percentage point (100 bps = 1.00%).' },
    ],
  },
];
