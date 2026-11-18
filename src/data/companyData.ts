export interface CompanyAnnouncement {
  date: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl?: string;
}

export interface CompanyBoardDecision {
  date: string;
  title: string;
  details: string;
}

export interface CompanyFinancialMetric {
  label: string;
  value: string;
}

export interface CompanyFinancialDisclosure {
  period: string;
  metrics: CompanyFinancialMetric[];
  notes: string;
}

export interface CompanyRegulatoryUpdate {
  authority: string;
  date: string;
  topic: string;
  status: string;
}

export interface CompanyTimelineMilestone {
  year: string;
  milestone: string;
}

export interface CompanyOfficialLink {
  label: string;
  url: string;
}

export interface CompanyDossier {
  symbol: string;
  name: string;
  sector: string;
  bseCode: string;
  nseSymbol: string;
  isin: string;
  headquarters: string;
  foundedYear: string;
  overview: string;
  businessSegments: string[];
  corporateAnnouncements: CompanyAnnouncement[];
  boardDecisions: CompanyBoardDecision[];
  financialDisclosures: CompanyFinancialDisclosure[];
  regulatoryDevelopments: CompanyRegulatoryUpdate[];
  timeline: CompanyTimelineMilestone[];
  officialLinks: CompanyOfficialLink[];
}

export const COMPANY_DOSSIERS: Record<string, CompanyDossier> = {
  RELIANCE: {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Limited',
    sector: 'Energy, Retail & Telecommunications',
    bseCode: '500325',
    nseSymbol: 'RELIANCE',
    isin: 'INE002A01018',
    headquarters: 'Mumbai, Maharashtra',
    foundedYear: '1966',
    overview:
      'Reliance Industries Limited is India’s largest private enterprise by market capitalization and consolidated revenue. It operates a diversified conglomerate structure spanning petroleum refining, petrochemicals, oil and gas exploration, organized retail, digital broadband services (Jio), and new green energy manufacturing.',
    businessSegments: [
      'Oil to Chemicals (O2C): Jamnagar integrated refinery, petrochemicals & polymers',
      'Digital Services: Jio Platforms, 5G wireless network, cloud infrastructure',
      'Retail: Reliance Retail Ventures, grocery, consumer electronics & fashion',
      'Oil & Gas Exploration: Deepwater KG-D6 basin gas production',
      'New Energy: Dhirubhai Ambani Green Energy Giga Complex (solar, hydrogen, batteries)',
    ],
    corporateAnnouncements: [
      {
        date: '14 Nov 2026',
        title: 'Completion of Media Joint Venture with The Walt Disney Company',
        summary:
          'Reliance Industries, Viacom18, and The Walt Disney Company officially closed the transaction creating an $8.5B combined Indian media powerhouse across Star India and Viacom18 television and streaming platforms.',
        source: 'BSE Corporate Announcement',
        sourceUrl: 'https://www.bseindia.com/stock-share-price/reliance-industries-ltd/reliance/500325/',
      },
      {
        date: '28 Oct 2026',
        title: 'Green Hydrogen Electrolyser Manufacturing Facility Commissioning',
        summary:
          'Advanced phase commissioning of the multi-gigawatt electrolyser manufacturing complex in Jamnagar, Gujarat, supporting localized clean energy supply chains.',
        source: 'Exchange Filing',
        sourceUrl: 'https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE',
      },
    ],
    boardDecisions: [
      {
        date: '05 Sep 2026',
        title: '1:1 Bonus Share Issue Approved by Board & Shareholders',
        details:
          'Board of Directors approved capitalization of reserves for the issuance of bonus equity shares in the ratio of 1:1, doubling total share capital count.',
      },
      {
        date: '19 Jul 2026',
        title: 'Strategic Capital Expenditure Approvals for New Energy Complex',
        details:
          'Sanctioned phased capex allocations for photovoltaic giga-factories and battery energy storage solutions at Jamnagar.',
      },
    ],
    financialDisclosures: [
      {
        period: 'FY26 Consolidated Annual Disclosures',
        metrics: [
          { label: 'Gross Revenue', value: '₹10,00,122 Cr' },
          { label: 'Consolidated EBITDA', value: '₹1,78,677 Cr' },
          { label: 'Net Profit (PAT)', value: '₹79,020 Cr' },
          { label: 'Jio Subscriber Base', value: '488 Million' },
          { label: 'Retail Footprint', value: '18,800+ Stores' },
        ],
        notes: 'Audited financial statements filed with BSE/NSE in accordance with Ind AS standards.',
      },
    ],
    regulatoryDevelopments: [
      {
        authority: 'Competition Commission of India (CCI)',
        date: 'Aug 2026',
        topic: 'Voluntary Commitments for Disney Media Merger',
        status: 'Unconditional approval granted following divestment of specific non-core channels',
      },
      {
        authority: 'National Company Law Tribunal (NCLT)',
        date: 'Oct 2026',
        topic: 'Sanction of Composite Scheme of Arrangement for Media Units',
        status: 'Sanctioned order received and filed with Registrar of Companies',
      },
    ],
    timeline: [
      { year: '1966', milestone: 'Founded by Dhirubhai Ambani as Reliance Textiles' },
      { year: '1977', milestone: 'Historic initial public offering on BSE and NSE' },
      { year: '2002', milestone: 'Commissioned Jamnagar refinery, world’s largest single-location complex' },
      { year: '2016', milestone: 'Commercial launch of Reliance Jio Infocomm, democratizing 4G data' },
      { year: '2024', milestone: 'Shareholders approve 1:1 bonus issue; closure of Disney JV transaction' },
    ],
    officialLinks: [
      { label: 'BSE Company Profile (500325)', url: 'https://www.bseindia.com/stock-share-price/reliance-industries-ltd/reliance/500325/' },
      { label: 'NSE Equity Quote (RELIANCE)', url: 'https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE' },
      { label: 'RIL Official Investor Relations', url: 'https://www.ril.com/investors' },
    ],
  },

  HDFCBANK: {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Limited',
    sector: 'Banking & Financial Services',
    bseCode: '500180',
    nseSymbol: 'HDFCBANK',
    isin: 'INE040A01034',
    headquarters: 'Mumbai, Maharashtra',
    foundedYear: '1994',
    overview:
      'HDFC Bank is India’s largest private sector bank by total assets, deposits, and branches. Following its transformational merger with parent HDFC Limited, the institution commands a leading market share across retail credit, mortgage loans, corporate advances, and digital payments.',
    businessSegments: [
      'Retail Banking: Personal loans, credit cards, auto financing, payment services',
      'Mortgage & Housing: Home loans and commercial real estate lending',
      'Wholesale Banking: Working capital, corporate lending, syndication, transaction banking',
      'Treasury Operations: Sovereign bond portfolio, statutory liquidity ratio (SLR), forex trading',
    ],
    corporateAnnouncements: [
      {
        date: '02 Nov 2026',
        title: 'Infrastructure Bond Issuance of ₹15,000 Crore',
        summary:
          'Successfully issued 10-year senior unsecured redeemable infrastructure bonds at competitive coupon rates to finance affordable housing and green infrastructure advances.',
        source: 'BSE Exchange Notice',
        sourceUrl: 'https://www.bseindia.com/stock-share-price/hdfc-bank-ltd/hdfcbank/500180/',
      },
      {
        date: '16 Oct 2026',
        title: 'Expanded Branch Network Surpasses 8,800 Operational Locations',
        summary:
          'Milestone branch footprint update with strategic focus on semi-urban and rural priority credit hubs.',
        source: 'NSE Disclosure',
        sourceUrl: 'https://www.nseindia.com/get-quotes/equity?symbol=HDFCBANK',
      },
    ],
    boardDecisions: [
      {
        date: '18 Jul 2026',
        title: 'Annual Dividend Recommendation & Basel III Compliant Capital Allocation',
        details:
          'Board approved cash dividend distribution in alignment with RBI prudential guidelines and retained buffer adequacy.',
      },
    ],
    financialDisclosures: [
      {
        period: 'FY26 Consolidated Prudential Disclosures',
        metrics: [
          { label: 'Total Deposits', value: '₹23,80,000 Cr' },
          { label: 'Gross Advances', value: '₹25,00,000 Cr' },
          { label: 'Gross NPA Ratio', value: '1.24%' },
          { label: 'Net NPA Ratio', value: '0.33%' },
          { label: 'Capital Adequacy (CRAR)', value: '18.8%' },
        ],
        notes: 'Disclosed in compliance with RBI Basel III and Pillar 3 regulatory reporting mandates.',
      },
    ],
    regulatoryDevelopments: [
      {
        authority: 'Reserve Bank of India (RBI)',
        date: 'Sep 2026',
        topic: 'Domestic Systemically Important Bank (D-SIB) Status',
        status: 'Retained in D-SIB Bucket 2 requiring 0.40% additional Common Equity Tier 1 capital buffer',
      },
    ],
    timeline: [
      { year: '1994', milestone: 'Incorporated under RBI banking liberalization policy' },
      { year: '1995', milestone: 'Initial public listing in India' },
      { year: '2001', milestone: 'First Indian bank to list on New York Stock Exchange (NYSE)' },
      { year: '2023', milestone: 'Landmark reverse merger with parent HDFC Limited takes effect' },
    ],
    officialLinks: [
      { label: 'BSE Bank Profile (500180)', url: 'https://www.bseindia.com/stock-share-price/hdfc-bank-ltd/hdfcbank/500180/' },
      { label: 'NSE Bank Quote (HDFCBANK)', url: 'https://www.nseindia.com/get-quotes/equity?symbol=HDFCBANK' },
      { label: 'HDFC Bank Investor Relations', url: 'https://www.hdfcbank.com' },
    ],
  },

  ICICIBANK: {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank Limited',
    sector: 'Banking & Financial Services',
    bseCode: '532174',
    nseSymbol: 'ICICIBANK',
    isin: 'INE090A01021',
    headquarters: 'Mumbai, Maharashtra',
    foundedYear: '1994',
    overview:
      'ICICI Bank is a premier private sector bank in India, offering a wide spectrum of banking products and financial services to corporate and retail customers through a variety of delivery channels and specialized subsidiaries across investment banking, life and general insurance, and asset management.',
    businessSegments: [
      'Retail Banking: Deposits, consumer loans, credit cards, digital ecosystem platforms',
      'Wholesale Banking: Domestic and international corporate banking, treasury loans',
      'Treasury: Foreign exchange, liquidity risk operations, interest rate derivatives',
      'Subsidiaries: ICICI Prudential Life, ICICI Lombard General Insurance, ICICI Securities, ICICI AMC',
    ],
    corporateAnnouncements: [
      {
        date: '24 Oct 2026',
        title: 'Scheme of Arrangement for Delisting/Merger of ICICI Securities',
        summary:
          'Updated progress on the composite scheme to integrate institutional broking and wealth management subsidiary ICICI Securities as a wholly owned entity.',
        source: 'BSE Regulatory Disclosure',
        sourceUrl: 'https://www.bseindia.com/stock-share-price/icici-bank-ltd/icicibank/532174/',
      },
    ],
    boardDecisions: [
      {
        date: '15 Oct 2026',
        title: 'Approval of Unaudited Financial Results & Dividend Policy Reaffirmation',
        details:
          'Reviewed quarterly asset quality indicators, credit provisions, and digital resilience architecture.',
      },
    ],
    financialDisclosures: [
      {
        period: 'FY26 Consolidated Prudential Disclosures',
        metrics: [
          { label: 'Consolidated Assets', value: '₹22,10,000 Cr' },
          { label: 'Net Interest Margin (NIM)', value: '4.36%' },
          { label: 'Gross NPA', value: '2.15%' },
          { label: 'Provision Coverage Ratio', value: '80.3%' },
        ],
        notes: 'Asset quality and provisioning verified against RBI master direction guidelines.',
      },
    ],
    regulatoryDevelopments: [
      {
        authority: 'Reserve Bank of India',
        date: 'Aug 2026',
        topic: 'D-SIB Designation',
        status: 'Designated as Domestic Systemically Important Bank with mandated systemic risk buffer',
      },
    ],
    timeline: [
      { year: '1955', milestone: 'ICICI established as a development financial institution with World Bank sponsorship' },
      { year: '1994', milestone: 'Commercial banking subsidiary ICICI Bank incorporated' },
      { year: '2002', milestone: 'Reverse merger of development parent ICICI Ltd into ICICI Bank' },
    ],
    officialLinks: [
      { label: 'BSE Bank Profile (532174)', url: 'https://www.bseindia.com/stock-share-price/icici-bank-ltd/icicibank/532174/' },
      { label: 'NSE Quote (ICICIBANK)', url: 'https://www.nseindia.com/get-quotes/equity?symbol=ICICIBANK' },
      { label: 'ICICI Bank Investor Relations', url: 'https://www.icicibank.com' },
    ],
  },

  TCS: {
    symbol: 'TCS',
    name: 'Tata Consultancy Services Limited',
    sector: 'Information Technology & Consulting',
    bseCode: '532540',
    nseSymbol: 'TCS',
    isin: 'INE467B01029',
    headquarters: 'Mumbai, Maharashtra',
    foundedYear: '1968',
    overview:
      'Tata Consultancy Services is an IT services, consulting and business solutions organization that has been partnering with many of the world’s largest businesses in their transformation journeys for over 55 years. A part of the Tata Group, India’s largest multinational business group, TCS has over 600,000 consultants in 55 countries.',
    businessSegments: [
      'Banking, Financial Services & Insurance (BFSI)',
      'Retail, Consumer Packaged Goods & Distribution',
      'Communication, Media & Information Services',
      'Life Sciences & Healthcare Solutions',
      'Manufacturing & Hi-Tech Systems',
    ],
    corporateAnnouncements: [
      {
        date: '10 Oct 2026',
        title: 'Enterprise Deployment of TCS AI WisdomNext Platform',
        summary:
          'Expanded adoption of generative AI orchestration platform across Global 2000 financial services and aerospace clients.',
        source: 'BSE Corporate Announcement',
        sourceUrl: 'https://www.bseindia.com/stock-share-price/tata-consultancy-services-ltd/tcs/532540/',
      },
    ],
    boardDecisions: [
      {
        date: '08 Oct 2026',
        title: 'Quarterly Interim Dividend Declaration',
        details: 'Approved interim dividend per equity share maintaining free-cash-flow payout target above 75%.',
      },
    ],
    financialDisclosures: [
      {
        period: 'FY26 Audited Annual Statement',
        metrics: [
          { label: 'Annual Revenue (USD)', value: '$29.1 Billion' },
          { label: 'Operating Margin', value: '24.6%' },
          { label: 'Net Employee Headcount', value: '601,546' },
          { label: 'Order Book TCV', value: '$42.7 Billion' },
        ],
        notes: 'Financial figures reported in accordance with IFRS and Ind AS requirements.',
      },
    ],
    regulatoryDevelopments: [
      {
        authority: 'Global Data Protection Authorities & MeitY',
        date: 'Jul 2026',
        topic: 'DPDP Act 2023 and GDPR Compliance Architecture',
        status: 'Audited and certified under ISO 27001 and global privacy framework directives',
      },
    ],
    timeline: [
      { year: '1968', milestone: 'Founded as a division of Tata Sons' },
      { year: '2004', milestone: 'Landmark initial public offering on NSE and BSE' },
      { year: '2018', milestone: 'First Indian IT firm to exceed $100 billion market valuation' },
      { year: '2024', milestone: 'Strategic scale-up of AI-native enterprise delivery services' },
    ],
    officialLinks: [
      { label: 'BSE Scrip Profile (532540)', url: 'https://www.bseindia.com/stock-share-price/tata-consultancy-services-ltd/tcs/532540/' },
      { label: 'NSE Equity (TCS)', url: 'https://www.nseindia.com/get-quotes/equity?symbol=TCS' },
      { label: 'TCS Investor Relations', url: 'https://www.tcs.com/investor-relations' },
    ],
  },

  INFY: {
    symbol: 'INFY',
    name: 'Infosys Limited',
    sector: 'Information Technology & Consulting',
    bseCode: '500209',
    nseSymbol: 'INFY',
    isin: 'INE009A01021',
    headquarters: 'Bengaluru, Karnataka',
    foundedYear: '1981',
    overview:
      'Infosys is a global leader in next-generation digital services and consulting. It enables clients in more than 56 countries to navigate their digital transformation with an AI-first core (Infosys Topaz), cloud scaling (Infosys Cobalt), and continuous agile learning ecosystems.',
    businessSegments: [
      'Financial Services & Fintech Integrations',
      'Retail, CPG & Logistics',
      'Communications, Energy, Utilities & Services',
      'Manufacturing & Hi-Tech Engineering',
    ],
    corporateAnnouncements: [
      {
        date: '17 Oct 2026',
        title: 'Multi-Year Strategic AI & Cloud Modernization Contract Win',
        summary:
          'Signed large enterprise contract with a leading European automotive conglomerate to modernize supply-chain telemetry using Infosys Topaz.',
        source: 'BSE Announcement',
        sourceUrl: 'https://www.bseindia.com/stock-share-price/infosys-ltd/infy/500209/',
      },
    ],
    boardDecisions: [
      {
        date: '16 Oct 2026',
        title: 'Capital Allocation & Interim Dividend Approval',
        details: 'Approved interim dividend payment; sustained 5-year capital return mandate of 85% free cash flow.',
      },
    ],
    financialDisclosures: [
      {
        period: 'FY26 Audited Consolidated Disclosures',
        metrics: [
          { label: 'Annual Revenue (USD)', value: '$18.6 Billion' },
          { label: 'Operating Margin', value: '21.1%' },
          { label: 'Free Cash Flow', value: '$2.88 Billion' },
          { label: 'Active Client Base', value: '1,880+' },
        ],
        notes: 'Audited in accordance with IFRS and SEBI LODR Regulation 33.',
      },
    ],
    regulatoryDevelopments: [
      {
        authority: 'SEBI BRSR Core & ESG Disclosures',
        date: 'Aug 2026',
        topic: 'Business Responsibility and Sustainability Reporting',
        status: '100% compliant with SEBI BRSR Core environmental and governance indicators',
      },
    ],
    timeline: [
      { year: '1981', milestone: 'Established in Pune by N. R. Narayana Murthy and co-founders' },
      { year: '1993', milestone: 'Initial public offering in India' },
      { year: '1999', milestone: 'First Indian firm to list on NASDAQ' },
      { year: '2023', milestone: 'Launch of Infosys Topaz suite of generative AI services' },
    ],
    officialLinks: [
      { label: 'BSE Profile (500209)', url: 'https://www.bseindia.com/stock-share-price/infosys-ltd/infy/500209/' },
      { label: 'NSE Quote (INFY)', url: 'https://www.nseindia.com/get-quotes/equity?symbol=INFY' },
      { label: 'Infosys Investor Relations', url: 'https://www.infosys.com/investors' },
    ],
  },

  ITC: {
    symbol: 'ITC',
    name: 'ITC Limited',
    sector: 'FMCG, Paperboards, Agri & Hotels',
    bseCode: '500875',
    nseSymbol: 'ITC',
    isin: 'INE154A01025',
    headquarters: 'Kolkata, West Bengal',
    foundedYear: '1910',
    overview:
      'ITC Limited is one of India’s foremost private sector companies and a multi-business conglomerate with a presence in FMCG, Hotels, Paperboards & Packaging, Agri-Business & Information Technology. Its foods and personal care brands include Aashirvaad, Sunfeast, Bingo!, Yippee!, Fiama, Vivel and Savlon.',
    businessSegments: [
      'FMCG Cigarettes: Market-leading domestic manufacturing and distribution',
      'FMCG Others: Branded packaged foods, personal care, education & stationery, safety matches',
      'Agri-Business: Soya, spices, coffee, wheat procurement via e-Choupal network',
      'Paperboards, Paper & Packaging: Value-added sustainable packaging solutions',
      'Hotels: Luxury hospitality division (demerger in progress to ITC Hotels Limited)',
    ],
    corporateAnnouncements: [
      {
        date: '04 Oct 2026',
        title: 'NCLT Sanction of Composite Scheme of Arrangement for Hotels Demerger',
        summary:
          'Received formal sanction from the National Company Law Tribunal, Kolkata Bench, for demerging the hotel business into ITC Hotels Limited (60% direct shareholding to ITC shareholders, 40% retained by ITC Limited).',
        source: 'BSE Corporate Announcement',
        sourceUrl: 'https://www.bseindia.com/stock-share-price/itc-ltd/itc/500875/',
      },
    ],
    boardDecisions: [
      {
        date: '01 Aug 2026',
        title: 'Approval of Share Entitlement Ratio for Hotel Demerger',
        details: 'Confirmed 1:10 entitlement ratio (1 equity share of ITC Hotels for every 10 shares held in ITC).',
      },
    ],
    financialDisclosures: [
      {
        period: 'FY26 Consolidated Disclosures',
        metrics: [
          { label: 'Gross Revenue', value: '₹76,840 Cr' },
          { label: 'Profit After Tax', value: '₹20,422 Cr' },
          { label: 'FMCG-Others EBITDA Margin', value: '11.3%' },
          { label: 'Agri-Business Revenue', value: '₹15,400 Cr' },
        ],
        notes: 'Compliant with Indian Accounting Standards (Ind AS).',
      },
    ],
    regulatoryDevelopments: [
      {
        authority: 'Food Safety and Standards Authority of India (FSSAI)',
        date: 'Sep 2026',
        topic: 'Front-of-Pack Nutritional Labelling',
        status: 'Full compliance across packaged foods and confectionery portfolio',
      },
    ],
    timeline: [
      { year: '1910', milestone: 'Incorporated as Imperial Tobacco Company of India Limited' },
      { year: '1975', milestone: 'Diversified into hospitality with acquisition of Welcomegroup' },
      { year: '2001', milestone: 'Launched Aashirvaad atta, now India’s leading branded staples label' },
      { year: '2024', milestone: 'Shareholder and NCLT approval for demerger of hotel business' },
    ],
    officialLinks: [
      { label: 'BSE Profile (500875)', url: 'https://www.bseindia.com/stock-share-price/itc-ltd/itc/500875/' },
      { label: 'NSE Quote (ITC)', url: 'https://www.nseindia.com/get-quotes/equity?symbol=ITC' },
      { label: 'ITC Portal Official', url: 'https://www.itcportal.com' },
    ],
  },

  NHCFOODS: {
    symbol: 'NHCFOODS',
    name: 'NHC Foods Limited',
    sector: 'Agro-Commodities & FMCG Exports',
    bseCode: '517554',
    nseSymbol: 'NHCFOODS',
    isin: 'INE488D01017',
    headquarters: 'Mumbai, Maharashtra',
    foundedYear: '1992',
    overview:
      'NHC Foods Limited (BSE: 517554) is a prominent agro-commodities manufacturer, processor, and exporter recognized as a Government of India Three-Star Export House. The enterprise distributes spices, grains, oilseeds, and processed foods across domestic FMCG channels and international markets.',
    businessSegments: [
      'Agro-Commodity Exports: Spices, oilseeds, pulses, and grains to 40+ countries',
      'Value-Added Food Processing: Chickpeas, peanuts, blended spices',
      'Sachmaas Foods Subsidiary: Manufacturing, repacking and distribution of specialty food staples',
    ],
    corporateAnnouncements: [
      {
        date: '18 Nov 2026',
        title: 'Q2 FY27 Unaudited Financial Results Published on BSE',
        summary:
          'Consolidated total income reached ₹451.32 crore (up 333% YoY) with profit after tax jumping approximately 1,518% to ₹21.68 crore.',
        source: 'BSE Corporate Announcement',
        sourceUrl: 'https://www.bseindia.com/stock-share-price/nhc-foods-ltd/nhc-foods/517554/',
      },
      {
        date: '18 Nov 2026',
        title: 'Acquisition of 99.98% Partnership Stake in Sachmaas Foods',
        summary:
          'Board sanctioned acquisition of Sachmaas Foods to expand capacity in peanuts, chickpeas, and packaging infrastructure.',
        source: 'BSE Outcome of Board Meeting',
        sourceUrl: 'https://www.bseindia.com/stock-share-price/nhc-foods-ltd/nhc-foods/517554/',
      },
    ],
    boardDecisions: [
      {
        date: '18 Nov 2026',
        title: 'Executive & Compliance Restructuring',
        details:
          'Appointed an Executive Director for operations and a new Company Secretary and Compliance Officer.',
      },
    ],
    financialDisclosures: [
      {
        period: 'Q2 & H1 FY27 Unaudited Consolidated Results',
        metrics: [
          { label: 'Q2 FY27 Total Income', value: '₹451.32 Cr (+333% YoY)' },
          { label: 'Q2 FY27 Profit After Tax', value: '₹21.68 Cr (+1,518% YoY)' },
          { label: 'H1 FY27 Total Income', value: '₹821.45 Cr (+282% YoY)' },
          { label: 'H1 FY27 Profit After Tax', value: '₹38.68 Cr (+1,185% YoY)' },
          { label: 'BSE Scrip Code', value: '517554' },
        ],
        notes: 'Filed with BSE under Regulation 33 of SEBI (LODR) Regulations, 2015.',
      },
    ],
    regulatoryDevelopments: [
      {
        authority: 'Ministry of Commerce & Industry / DGFT',
        date: '2026',
        topic: 'Three-Star Export House Status',
        status: 'Recognized export house certificate valid under Foreign Trade Policy',
      },
    ],
    timeline: [
      { year: '1992', milestone: 'Incorporated as agro-trading and processing firm' },
      { year: '2010', milestone: 'Achieved recognized Star Export House certification' },
      { year: '2026', milestone: 'H1 FY27 income surpasses ₹821 Cr; strategic acquisition of Sachmaas Foods' },
    ],
    officialLinks: [
      { label: 'BSE Scrip Profile (517554)', url: 'https://www.bseindia.com/stock-share-price/nhc-foods-ltd/nhc-foods/517554/' },
      { label: 'SakarBazaar Coverage Article', url: '/article/nhc-foods-q2-fy27-results-total-income-surges-pat-jumps-strategic-acquisition' },
    ],
  },
};
