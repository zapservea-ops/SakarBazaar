import type {
  IpoStatus,
  LanguageCode,
  NewsCategory,
  TranslationStrings,
  VerificationStatus,
} from '../types/sakarbazaar';

export const TRANSLATIONS: Record<LanguageCode, TranslationStrings> = {
  en: {
    markets: 'Markets',
    ipo: 'IPO Intelligence',
    news: 'News',
    intelligence: 'Intelligence',
    companies: 'Companies',
    calendar: 'Calendar',
    watch: 'Watchlist',
    explain: 'Explainers',
    editorial: 'Editorial Desk',
    read: 'Read story',
    latest: 'Latest dispatches',
    snapshot: 'Market indicators',
    ipodesk: 'IPO Desk',
  },
  hi: {
    markets: 'बाज़ार',
    ipo: 'आईपीओ इंटेलिजेंस',
    news: 'समाचार',
    intelligence: 'इंटेलिजेंस',
    companies: 'कंपनियां',
    calendar: 'कैलेंडर',
    watch: 'वॉचलिस्ट',
    explain: 'विश्लेषण',
    editorial: 'एडिटोरियल डेस्क',
    read: 'पूरी खबर पढ़ें',
    latest: 'ताज़ा रिपोर्टिंग',
    snapshot: 'बाज़ार संकेतक',
    ipodesk: 'आईपीओ डेस्क',
  },
};

export interface UiDictionary {
  siteTagline: string;
  awaitingVerificationBadge: string;
  verifiedBadge: string;
  educationalBadge: string;
  liveDataUnavailable: string;
  liveDataUnavailableDetail: string;
  delayedDataNotice: string;
  staleDataNotice: string;
  marketClosedNotice: string;
  loadingMarketData: string;
  dayRangeLabel: string;
  lastUpdatedLabel: string;
  sourceLabel: string;
  searchPlaceholder: string;
  searchButton: string;
  clearSearch: string;
  loadMore: string;
  backButton: string;
  backToMarkets: string;
  allStories: string;
  relatedStories: string;
  popularStories: string;
  keyTakeaways: string;
  sourcesAndFilings: string;
  share: string;
  linkCopied: string;
  saveStory: string;
  saved: string;
  listen: string;
  stopListening: string;
  listenUnsupported: string;
  publishedLabel: string;
  updatedLabel: string;
  noResultsTitle: string;
  noResultsHint: string;
  marketsPageTitle: string;
  marketsPageSubtitle: string;
  indexOverview: string;
  equitiesOverview: string;
  fiiDiiHeading: string;
  marketNewsHeading: string;
  ipoPageTitle: string;
  ipoPageSubtitle: string;
  ipoVerificationNotice: string;
  ipoNoConfirmedNotice: string;
  ipoStatusAll: string;
  tableCompany: string;
  tableIssueSize: string;
  tablePriceBand: string;
  tableOpenClose: string;
  tableOfferType: string;
  tableVerification: string;
  tableTrack: string;
  newsPageTitle: string;
  newsPageSubtitle: string;
  calendarPageTitle: string;
  calendarPageSubtitle: string;
  calendarDay: string;
  calendarWeek: string;
  calendarUpcoming: string;
  watchlistPageTitle: string;
  watchlistPageSubtitle: string;
  savedStoriesHeading: string;
  trackedIposHeading: string;
  trackedIndicesHeading: string;
  addIndicesHeading: string;
  addIposHeading: string;
  removeLabel: string;
  emptySavedStories: string;
  emptyTrackedIpos: string;
  emptyTrackedIndices: string;
  explainersPageTitle: string;
  explainersPageSubtitle: string;
  searchPageTitle: string;
  searchPageSubtitle: string;
  todayCalendar: string;
  footerSections: string;
  footerCompany: string;
  footerDataNoteTitle: string;
  footerDataNoteBody: string;
  aboutLink: string;
  disclaimerLink: string;
  privacyLink: string;
  contactLink: string;
  rssLink: string;
  sitemapLink: string;
  openTracker: string;
  tableStatus: string;
  readGuide: string;
  allExplainers: string;
  moreExplainers: string;
  keyTerms: string;
  financialEducation: string;
  detailsLink: string;
  openLink: string;
  colDate: string;
  colTime: string;
  colCategory: string;
  colEvent: string;
  colDetails: string;
  colLink: string;
  tabAll: string;
  tabArticles: string;
  tabIpos: string;
  tabExplainers: string;
  browseExplainers: string;
  popularSearchesLabel: string;
  menuOpenLabel: string;
  menuCloseLabel: string;
}

export const UI_COPY: Record<LanguageCode, UiDictionary> = {
  en: {
    siteTagline: 'Indian markets, IPOs and verified financial journalism',
    awaitingVerificationBadge: 'Awaiting Official Verification',
    verifiedBadge: 'Verified',
    educationalBadge: 'Educational Guide',
    liveDataUnavailable: 'Market data currently unavailable. No authorized provider configured.',
    liveDataUnavailableDetail:
      'Market values will appear here once an authorized licensed exchange or financial data provider is configured on the server.',
    delayedDataNotice: 'Delayed market data.',
    staleDataNotice: 'Last available quote — data may be outdated.',
    marketClosedNotice: 'Indian exchanges closed — showing last available official quote.',
    loadingMarketData: 'Checking market feed status…',
    dayRangeLabel: 'Day High / Low',
    lastUpdatedLabel: 'Updated (IST)',
    sourceLabel: 'Source',
    searchPlaceholder: 'Search stories, IPOs, companies (e.g. IPO, MCL, Coal India)',
    searchButton: 'Search',
    clearSearch: 'Clear',
    loadMore: 'Load more',
    backButton: 'Back',
    backToMarkets: 'Homepage',
    allStories: 'All stories',
    relatedStories: 'Related dispatches',
    popularStories: 'Editorial highlights',
    keyTakeaways: 'Key takeaways',
    sourcesAndFilings: 'Verification checklist & official portals',
    share: 'Share',
    linkCopied: 'Link copied',
    saveStory: 'Save story',
    saved: 'Saved',
    listen: 'Listen',
    stopListening: 'Stop audio',
    listenUnsupported: 'Audio narration is unavailable in this browser.',
    publishedLabel: 'Published',
    updatedLabel: 'Updated',
    noResultsTitle: 'No matching entries found.',
    noResultsHint: 'Try another keyword, company name, or clear your category filter.',
    marketsPageTitle: 'Indian Markets & Indicators',
    marketsPageSubtitle:
      'Verified Indian benchmark indices, macro indicators, and listed equity identifiers ready for authorized live feed integration.',
    indexOverview: 'Indices & Macro Indicators',
    equitiesOverview: 'Tracked Indian Listed Equities Catalogue',
    fiiDiiHeading: 'Institutional Flows (FII / DII)',
    marketNewsHeading: 'Latest Dispatches',
    ipoPageTitle: 'IPO Intelligence & Prospectus Tracker',
    ipoPageSubtitle:
      'Verified IPO filings, upcoming issues and official document analysis separated strictly by verification status.',
    ipoVerificationNotice:
      'Unverified user-supplied IPO details remain labelled Awaiting Official Verification and are excluded from confirmed Open/Upcoming counts until verified against SEBI DRHP/RHP and NSE/BSE filings.',
    ipoNoConfirmedNotice:
      'No verified live Open or Upcoming IPO schedules are currently active. Below are dossiers currently awaiting official DRHP/RHP verification.',
    ipoStatusAll: 'All statuses',
    tableCompany: 'Company',
    tableIssueSize: 'Proposed issue size',
    tablePriceBand: 'Price band',
    tableOpenClose: 'Proposed window',
    tableOfferType: 'Offer structure',
    tableVerification: 'Verification',
    tableTrack: 'Track',
    newsPageTitle: 'Financial Intelligence News',
    newsPageSubtitle:
      'Editorial dispatches across corporate developments, economy, trade, and policy—clearly labelled with source and verification status.',
    calendarPageTitle: 'Economic & IPO Calendar',
    calendarPageSubtitle:
      'Verified regulatory, macro, and exchange schedule tracker. Unconfirmed dates are excluded until official notice.',
    calendarDay: 'Today',
    calendarWeek: 'This week',
    calendarUpcoming: 'Upcoming',
    watchlistPageTitle: 'Personal Watchlist',
    watchlistPageSubtitle:
      'Saved articles, tracked IPO dossiers, and market indicators persisted locally in your browser.',
    savedStoriesHeading: 'Saved stories',
    trackedIposHeading: 'Tracked IPO dossiers',
    trackedIndicesHeading: 'Tracked market indicators',
    addIndicesHeading: 'Add market indicators to track',
    addIposHeading: 'Add IPO dossiers to track',
    removeLabel: 'Remove',
    emptySavedStories:
      'No saved stories yet. Tap the bookmark button on any article to keep it here for reading.',
    emptyTrackedIpos:
      'No IPO dossiers tracked yet. Add any available dossier from the IPO Desk or below.',
    emptyTrackedIndices:
      'No indicators tracked yet. Select NIFTY 50, SENSEX, GOLD, or listed equities below to pin them to your watchlist.',
    explainersPageTitle: 'SakarBazaar Explainers',
    explainersPageSubtitle:
      'Plain-language guides to Indian primary markets, RBI monetary operations, institutional flows, and financial terminology.',
    searchPageTitle: 'Search SakarBazaar',
    searchPageSubtitle:
      'Search across newsroom dispatches, full article bodies, IPO dossiers, company names, aliases, and explainers.',
    todayCalendar: 'Calendar watch',
    footerSections: 'Sections',
    footerCompany: 'Editorial & Trust',
    footerDataNoteTitle: 'Verification & data policy',
    footerDataNoteBody:
      'SakarBazaar does not fabricate live prices, subscription counts, or GMP quotes. Unverified editorial submissions are clearly marked Awaiting Official Verification. Verify prospectuses and market notices directly via SEBI, NSE, BSE, RBI, and PIB. © 2026 SakarBazaar',
    aboutLink: 'About SakarBazaar',
    disclaimerLink: 'Editorial Disclaimer',
    privacyLink: 'Privacy & Storage',
    contactLink: 'Contact Newsroom',
    rssLink: 'RSS Feed',
    sitemapLink: 'Sitemap',
    openTracker: 'Open IPO Desk',
    tableStatus: 'Status',
    readGuide: 'Read guide →',
    allExplainers: 'All explainers →',
    moreExplainers: 'More explainers',
    keyTerms: 'Key Terms',
    financialEducation: 'Financial Education',
    detailsLink: 'View dossier →',
    openLink: 'Open →',
    colDate: 'Date',
    colTime: 'Time',
    colCategory: 'Category',
    colEvent: 'Event',
    colDetails: 'Details',
    colLink: 'Link',
    tabAll: 'All',
    tabArticles: 'Articles',
    tabIpos: 'IPOs',
    tabExplainers: 'Explainers',
    browseExplainers: 'Browse explainers →',
    popularSearchesLabel: 'Suggested keywords from current coverage',
    menuOpenLabel: 'Open navigation menu',
    menuCloseLabel: 'Close navigation menu',
  },
  hi: {
    siteTagline: 'भारतीय बाज़ार, आईपीओ और विश्वसनीय वित्तीय पत्रकारिता',
    awaitingVerificationBadge: 'आधिकारिक सत्यापन लंबित',
    verifiedBadge: 'सत्यापित',
    educationalBadge: 'शैक्षणिक गाइड',
    liveDataUnavailable: 'बाज़ार डेटा वर्तमान में उपलब्ध नहीं है। कोई अधिकृत प्रदाता कॉन्फ़िगर नहीं है।',
    liveDataUnavailableDetail:
      'सर्वर पर अधिकृत और लाइसेंस प्राप्त डेटा प्रदाता कॉन्फ़िगर होने पर यहाँ लाइव बाज़ार स्तर दिखाई देंगे।',
    delayedDataNotice: 'विलंबित बाज़ार डेटा।',
    staleDataNotice: 'अंतिम उपलब्ध भाव — डेटा पुराना हो सकता है।',
    marketClosedNotice: 'भारतीय बाज़ार बंद — अंतिम उपलब्ध आधिकारिक भाव दिखाया जा रहा है।',
    loadingMarketData: 'बाज़ार फ़ीड स्थिति जाँची जा रही है…',
    dayRangeLabel: 'दिन का उच्च / निम्न',
    lastUpdatedLabel: 'अद्यतन (IST)',
    sourceLabel: 'स्रोत',
    searchPlaceholder: 'खबरें, आईपीओ, कंपनियाँ खोजें (जैसे IPO, MCL, Coal India)',
    searchButton: 'खोजें',
    clearSearch: 'साफ़ करें',
    loadMore: 'और देखें',
    backButton: 'वापस',
    backToMarkets: 'होमपेज',
    allStories: 'सभी खबरें',
    relatedStories: 'संबंधित रिपोर्ट',
    popularStories: 'प्रमुख संपादकीय सामग्री',
    keyTakeaways: 'मुख्य बिंदु',
    sourcesAndFilings: 'सत्यापन सूची और आधिकारिक पोर्टल',
    share: 'शेयर करें',
    linkCopied: 'लिंक कॉपी हुआ',
    saveStory: 'सहेजें',
    saved: 'सहेजा गया',
    listen: 'सुनें',
    stopListening: 'ऑडियो रोकें',
    listenUnsupported: 'इस ब्राउज़र में ऑडियो वाचन उपलब्ध नहीं है।',
    publishedLabel: 'प्रकाशित',
    updatedLabel: 'अद्यतन',
    noResultsTitle: 'कोई मिलान नहीं मिला।',
    noResultsHint: 'दूसरा कीवर्ड आज़माएँ या श्रेणी फ़िल्टर साफ़ करें।',
    marketsPageTitle: 'भारतीय बाज़ार और संकेतक',
    marketsPageSubtitle:
      'अधिकृत लाइव डेटा एकीकरण के लिए तैयार प्रमुख भारतीय सूचकांक, मैक्रो संकेतक और सूचीबद्ध शेयर कैटलॉग।',
    indexOverview: 'प्रमुख सूचकांक और मैक्रो संकेतक',
    equitiesOverview: 'सूचीबद्ध भारतीय शेयर कैटलॉग',
    fiiDiiHeading: 'संस्थागत प्रवाह (FII / DII)',
    marketNewsHeading: 'ताज़ा रिपोर्ट',
    ipoPageTitle: 'आईपीओ इंटेलिजेंस और प्रॉस्पेक्टस ट्रैकर',
    ipoPageSubtitle:
      'सत्यापित आईपीओ फाइलिंग्स और आधिकारिक दस्तावेज़ विश्लेषण।',
    ipoVerificationNotice:
      'असत्यापित प्रदत्त आईपीओ विवरण "आधिकारिक सत्यापन लंबित" के रूप में चिह्नित रहते हैं और SEBI DRHP/RHP तथा NSE/BSE पुष्टि तक सक्रिय गिनती से बाहर रखे जाते हैं।',
    ipoNoConfirmedNotice:
      'वर्तमान में कोई सत्यापित खुला या आगामी आईपीओ कार्यक्रम सक्रिय नहीं है। नीचे आधिकारिक पुष्टि की प्रतीक्षा कर रहे विवरण दिए गए हैं।',
    ipoStatusAll: 'सभी स्थितियाँ',
    tableCompany: 'कंपनी',
    tableIssueSize: 'प्रस्तावित आकार',
    tablePriceBand: 'प्राइस बैंड',
    tableOpenClose: 'प्रस्तावित तिथियाँ',
    tableOfferType: 'ऑफर संरचना',
    tableVerification: 'सत्यापन स्थिति',
    tableTrack: 'ट्रैक',
    newsPageTitle: 'वित्तीय इंटेलिजेंस समाचार',
    newsPageSubtitle:
      'स्रोत और सत्यापन स्थिति के साथ कॉर्पोरेट, अर्थव्यवस्था, व्यापार और नीति संबंधी संपादकीय रिपोर्ट।',
    calendarPageTitle: 'आर्थिक और आईपीओ कैलेंडर',
    calendarPageSubtitle:
      'सत्यापित नियामकीय, मैक्रो और एक्सचेंज कार्यक्रम ट्रैकर। अपुष्ट तिथियाँ इसमें शामिल नहीं की जातीं।',
    calendarDay: 'आज',
    calendarWeek: 'इस सप्ताह',
    calendarUpcoming: 'आगामी',
    watchlistPageTitle: 'व्यक्तिगत वॉचलिस्ट',
    watchlistPageSubtitle:
      'आपके ब्राउज़र में स्थानीय रूप से सहेजी गई खबरें, ट्रैक किए गए आईपीओ विवरण और संकेतक।',
    savedStoriesHeading: 'सहेजी गई खबरें',
    trackedIposHeading: 'ट्रैक किए गए आईपीओ',
    trackedIndicesHeading: 'ट्रैक किए गए संकेतक',
    addIndicesHeading: 'बाज़ार संकेतक जोड़ें',
    addIposHeading: 'आईपीओ विवरण जोड़ें',
    removeLabel: 'हटाएँ',
    emptySavedStories:
      'अभी कोई खबर सहेजी नहीं गई है। सहेजने के लिए किसी भी लेख पर बुकमार्क बटन दबाएँ।',
    emptyTrackedIpos:
      'अभी कोई आईपीओ ट्रैक नहीं किया गया है। आईपीओ डेस्क या नीचे से जोड़ें।',
    emptyTrackedIndices:
      'अभी कोई संकेतक ट्रैक नहीं किया गया है। नीचे से NIFTY 50, SENSEX या शेयर चुनें।',
    explainersPageTitle: 'सकारबाज़ार विश्लेषण और गाइड',
    explainersPageSubtitle:
      'भारतीय प्राइमरी मार्केट, RBI मौद्रिक नीति, संस्थागत प्रवाह और वित्तीय शब्दावली की सरल व्याख्या।',
    searchPageTitle: 'सकारबाज़ार खोज',
    searchPageSubtitle: 'लेखों, पूरे विवरण, आईपीओ डोजियर, कंपनी नाम और गाइड में खोजें।',
    todayCalendar: 'कैलेंडर वॉच',
    footerSections: 'अनुभाग',
    footerCompany: 'संपादकीय और विश्वसनीयता',
    footerDataNoteTitle: 'सत्यापन और डेटा नीति',
    footerDataNoteBody:
      'सकारबाज़ार काल्पनिक मूल्य, सब्सक्रिप्शन या GMP आँकड़े प्रकाशित नहीं करता। असत्यापित सामग्री स्पष्ट रूप से "आधिकारिक सत्यापन लंबित" चिह्नित रहती है। SEBI, NSE, BSE, RBI और PIB से पुष्टि करें। © 2026 SakarBazaar',
    aboutLink: 'सकारबाज़ार के बारे में',
    disclaimerLink: 'अस्वीकरण',
    privacyLink: 'गोपनीयता और स्टोरेज',
    contactLink: 'न्यूज़रूम संपर्क',
    rssLink: 'RSS फ़ीड',
    sitemapLink: 'साइटमैप',
    openTracker: 'आईपीओ डेस्क खोलें',
    tableStatus: 'स्थिति',
    readGuide: 'गाइड पढ़ें →',
    allExplainers: 'सभी गाइड →',
    moreExplainers: 'अन्य विश्लेषण',
    keyTerms: 'प्रमुख शब्द',
    financialEducation: 'वित्तीय शिक्षा',
    detailsLink: 'विवरण देखें →',
    openLink: 'खोलें →',
    colDate: 'तिथि',
    colTime: 'समय',
    colCategory: 'श्रेणी',
    colEvent: 'कार्यक्रम',
    colDetails: 'विवरण',
    colLink: 'लिंक',
    tabAll: 'सभी',
    tabArticles: 'लेख',
    tabIpos: 'आईपीओ',
    tabExplainers: 'विश्लेषण',
    browseExplainers: 'सभी विश्लेषण देखें →',
    popularSearchesLabel: 'वर्तमान सामग्री से सुझाए गए कीवर्ड',
    menuOpenLabel: 'नेविगेशन मेनू खोलें',
    menuCloseLabel: 'नेविगेशन मेनू बंद करें',
  },
};

export const CATEGORY_LABELS: Record<LanguageCode, Record<NewsCategory, string>> = {
  en: {
    All: 'All',
    Markets: 'Markets',
    IPO: 'IPO',
    Corporate: 'Corporate',
    Economy: 'Economy',
    RBI: 'RBI',
    Banking: 'Banking',
    Technology: 'Technology',
    'Personal finance': 'Personal finance',
  },
  hi: {
    All: 'सभी',
    Markets: 'बाज़ार',
    IPO: 'आईपीओ',
    Corporate: 'कॉरपोरेट',
    Economy: 'अर्थव्यवस्था',
    RBI: 'आरबीआई',
    Banking: 'बैंकिंग',
    Technology: 'तकनीक',
    'Personal finance': 'पर्सनल फाइनेंस',
  },
};

export const IPO_STATUS_LABELS: Record<LanguageCode, Record<IpoStatus, string>> = {
  en: {
    'Awaiting Verification': 'Awaiting Official Verification',
    Open: 'Open',
    Upcoming: 'Upcoming',
    Closed: 'Recently closed',
    Listed: 'Listed',
  },
  hi: {
    'Awaiting Verification': 'आधिकारिक सत्यापन लंबित',
    Open: 'खुला',
    Upcoming: 'आगामी',
    Closed: 'हाल में बंद',
    Listed: 'सूचीबद्ध',
  },
};

export const VERIFICATION_STATUS_LABELS: Record<LanguageCode, Record<VerificationStatus, string>> = {
  en: {
    awaiting_verification: 'Awaiting Official Verification',
    verified: 'Verified',
    unverified: 'Unverified Draft',
  },
  hi: {
    awaiting_verification: 'आधिकारिक सत्यापन लंबित',
    verified: 'सत्यापित',
    unverified: 'असत्यापित ड्राफ्ट',
  },
};
