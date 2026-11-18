import type {
  ArticleRecord,
  ExplainerRecord,
  IpoRow,
  MarketInstrument,
  NewsCategory,
  NewsItem,
} from '../types/sakarbazaar';

export const PREDEFINED_SEARCH_TERMS: string[] = [
  'NIFTY 50',
  'SENSEX',
  'RBI',
  'Repo Rate',
  'Inflation',
  'IPO',
  'Mainboard IPO',
  'SME IPO',
  'OFS',
  'DRHP',
  'RHP',
  'GMP',
  'Allotment',
  'Listing',
  'Coal India',
  'Mahanadi Coalfields',
  'MCL IPO',
  'Reliance Industries',
  'HDFC Bank',
  'ICICI Bank',
  'TCS',
  'Infosys',
  'NHC Foods',
  'Sachmaas Foods',
  'FII',
  'DII',
  'USD INR',
  'Gold',
  'Electric Vehicles',
  'Renewable Energy',
  'India Egypt Trade',
];

const SEARCH_ALIASES: Record<string, string[]> = {
  ipo: ['ipos', 'initial public offering', 'primary market', 'ofs', 'drhp', 'rhp', 'allotment', 'listing'],
  ipos: ['ipo', 'initial public offering', 'primary market', 'ofs', 'drhp', 'rhp'],
  mcl: ['mahanadi', 'mahanadi coalfields', 'mahanadi coalfields limited', 'coal india', 'cil', 'mcl ipo'],
  mahanadi: ['mcl', 'mahanadi coalfields', 'coal india', 'cil'],
  cil: ['coal india', 'coal india limited', 'mcl', 'mahanadi coalfields'],
  coal: ['coal india', 'mahanadi coalfields', 'mcl', 'talcher', 'ib valley', 'cil'],
  rbi: ['reserve bank of india', 'repo', 'repo rate', 'mpc', 'monetary policy', 'crr', 'shaktikanta das'],
  repo: ['repo rate', 'rbi', 'mpc', 'policy rate', 'monetary policy'],
  inflation: ['cpi', 'mospi', 'consumer price index', 'inflation rate', 'headline inflation'],
  cpi: ['inflation', 'consumer price index', 'mospi'],
  ofs: ['offer for sale', 'selling shareholder', 'ipo', 'divestment', 'mcl', 'coal india'],
  drhp: ['draft red herring prospectus', 'sebi', 'rhp', 'offer document', 'prospectus', 'ipo'],
  rhp: ['red herring prospectus', 'sebi', 'drhp', 'ipo', 'price band'],
  gmp: ['grey market premium', 'unofficial pre listing', 'kostak'],
  allotment: ['basis of allotment', 'ipo allotment', 'listing date', 'refund'],
  listing: ['listing date', 'exchange debut', 'ipo', 'listing price'],
  ev: ['evs', 'electric vehicle', 'electric vehicles', 'automotive manufacturing', 'sustainable mobility', 'infinity energy'],
  evs: ['ev', 'electric vehicle', 'electric vehicles'],
  egypt: ['cairo', 'india egypt', 'infinity energy', 'piyush goyal'],
  fintech: ['financial technology', 'digital payments', 'upi'],
  nhc: ['nhc foods', 'nhc foods limited', '517554', 'sachmaas', 'agro commodities'],
  nhcfoods: ['nhc foods', 'nhc foods limited', '517554', 'sachmaas foods'],
  renewable: ['renewables', 'clean energy', 'renewable energy', 'solar', 'wind'],
  market: ['markets', 'nifty', 'sensex', 'nse', 'bse', 'secondary market'],
  markets: ['market', 'nifty', 'sensex', 'nse', 'bse'],
  bank: ['banks', 'banking', 'nifty bank', 'rbi', 'lenders'],
  banks: ['bank', 'banking', 'nifty bank'],
  fii: ['fpi', 'foreign institutional investors', 'foreign portfolio investors', 'institutional flows', 'dii'],
  dii: ['domestic institutional investors', 'mutual funds', 'lic', 'institutional flows', 'fii'],
  reliance: ['reliance industries', 'ril', 'mukesh ambani', 'nifty 50', 'reliance'],
  hdfc: ['hdfc bank', 'hdfcbank', 'nifty bank', 'nifty 50'],
  icici: ['icici bank', 'icicibank', 'nifty bank', 'nifty 50'],
  tcs: ['tata consultancy services', 'tata', 'nifty it', 'nifty 50'],
  infy: ['infosys', 'nifty it', 'nifty 50'],
  infosys: ['infy', 'nifty it', 'nifty 50'],
  gold: ['mcx', 'bullion', '10g', 'precious metals', 'commodity'],
  usd: ['usd inr', 'rupee', 'dollar', 'fbil', 'forex', 'currency'],
  sme: ['sme ipo', 'nifty sme emerge', 'emerge', 'bse sme'],
  asba: ['application supported by blocked amount', 'ipo', 'upi'],
};

const EXACT_PLURAL_EXCEPTIONS = new Set([
  'news',
  'economics',
  'analytics',
  'markets',
  'ipos',
  'evs',
  'etfs',
  'nbfcs',
]);

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[₹€$£%]/g, ' ')
    .replace(/[–—_/\\.,:;!?()[\]{}"'`]+/g, ' ')
    .replace(/[-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stemToken(token: string): string {
  const clean = token.trim().toLowerCase();
  if (!clean) return '';
  if (clean === 'ipos') return 'ipo';
  if (clean === 'evs') return 'ev';
  if (clean === 'etfs') return 'etf';
  if (clean === 'nbfcs') return 'nbfc';
  if (clean.length <= 3 && !EXACT_PLURAL_EXCEPTIONS.has(clean)) {
    return clean;
  }
  if (clean.endsWith('ies') && clean.length > 4) {
    return `${clean.slice(0, -3)}y`;
  }
  if (clean.endsWith('es') && clean.length > 4 && /(ches|shes|xes|zes|ses)$/.test(clean)) {
    return clean.slice(0, -2);
  }
  if (clean.endsWith('s') && !clean.endsWith('ss') && clean.length > 3) {
    return clean.slice(0, -1);
  }
  return clean;
}

export function tokenizeNormalized(text: string): string[] {
  const norm = normalizeSearchText(text);
  if (!norm) return [];
  const rawTokens = norm.split(' ').filter(Boolean);
  const out = new Set<string>();
  for (const t of rawTokens) {
    out.add(t);
    out.add(stemToken(t));
  }
  return [...out];
}

export function expandQueryTerms(query: string): {
  normalizedPhrase: string;
  stemmedPhrase: string;
  tokenGroups: string[][];
} {
  const normalizedPhrase = normalizeSearchText(query);
  if (!normalizedPhrase) {
    return { normalizedPhrase: '', stemmedPhrase: '', tokenGroups: [] };
  }

  const rawWords = normalizedPhrase.split(' ').filter(Boolean);
  const stemmedPhrase = rawWords.map(stemToken).join(' ');

  const tokenGroups: string[][] = rawWords.map((word) => {
    const stemmed = stemToken(word);
    const variants = new Set<string>([word, stemmed]);
    for (const key of [word, stemmed]) {
      const aliasList = SEARCH_ALIASES[key];
      if (aliasList) {
        for (const alias of aliasList) {
          variants.add(normalizeSearchText(alias));
          for (const aliasWord of normalizeSearchText(alias).split(' ')) {
            if (aliasWord.length >= 2) {
              variants.add(aliasWord);
              variants.add(stemToken(aliasWord));
            }
          }
        }
      }
    }
    return [...variants].filter(Boolean);
  });

  // Also expand full phrase aliases (e.g., "primary market", "coal india")
  const phraseAliases = SEARCH_ALIASES[normalizedPhrase];
  if (phraseAliases && phraseAliases.length > 0 && tokenGroups.length > 0) {
    for (const alias of phraseAliases) {
      tokenGroups[0].push(normalizeSearchText(alias));
    }
  }

  return { normalizedPhrase, stemmedPhrase, tokenGroups };
}

function scoreCorpusMatch(fields: string[], query: string): number {
  const { normalizedPhrase, stemmedPhrase, tokenGroups } = expandQueryTerms(query);
  if (!normalizedPhrase || tokenGroups.length === 0) return 0;

  const normalizedCorpus = fields.map((f) => normalizeSearchText(f)).filter(Boolean);
  if (normalizedCorpus.length === 0) return 0;

  const joinedCorpus = normalizedCorpus.join(' ');
  const corpusTokens = tokenizeNormalized(joinedCorpus);
  const stemmedCorpus = corpusTokens.join(' ');

  let score = 0;

  if (joinedCorpus.includes(normalizedPhrase)) {
    score += 10;
  }
  if (stemmedPhrase && stemmedCorpus.includes(stemmedPhrase)) {
    score += 8;
  }

  // Every query word group must match either as substring or stemmed token
  let matchedGroups = 0;
  for (const group of tokenGroups) {
    const groupMatched = group.some((variant) => {
      if (!variant) return false;
      if (joinedCorpus.includes(variant)) return true;
      return corpusTokens.some(
        (ct) => ct === variant || (variant.length >= 3 && ct.includes(variant)),
      );
    });
    if (groupMatched) {
      matchedGroups += 1;
      score += 4;
    }
  }

  // Require all query tokens to match for multi-word queries so searches stay precise
  if (matchedGroups < tokenGroups.length) {
    return 0;
  }

  // Boost matches in primary title/headline/company fields (first 2 entries)
  const primaryText = normalizedCorpus.slice(0, 2).join(' ');
  if (primaryText && tokenGroups.some((g) => g.some((v) => primaryText.includes(v)))) {
    score += 3;
  }

  return score;
}

function buildArticleSearchFields(article: ArticleRecord): string[] {
  return [
    article.headline,
    article.company ?? '',
    article.headlineHi ?? '',
    article.deck,
    article.deckHi ?? '',
    article.category,
    article.subCategory ?? '',
    article.ticker,
    article.sourceName,
    article.tags.join(' '),
    article.keywords.join(' '),
    article.entities.join(' '),
    article.aliases.join(' '),
    article.keyPoints.join(' '),
    article.sections.map((s) => `${s.heading} ${s.paragraphs.join(' ')}`).join(' '),
    article.risksAndMonitorables?.join(' ') ?? '',
  ];
}

function buildIpoSearchFields(ipo: IpoRow): string[] {
  return [
    ipo.company,
    ipo.segment,
    ipo.status,
    ipo.sellingShareholder ?? '',
    ipo.offerType ?? '',
    ipo.summary,
    ipo.keywords.join(' '),
    ipo.entities.join(' '),
    ipo.aliases.join(' '),
    ipo.risksAndMonitorables?.join(' ') ?? '',
    ipo.sourceName,
  ];
}

function buildExplainerSearchFields(exp: ExplainerRecord): string[] {
  return [
    exp.title,
    exp.tag,
    exp.titleHi,
    exp.tagHi,
    exp.summary,
    exp.summaryHi,
    exp.keywords.join(' '),
    exp.aliases.join(' '),
    exp.keyPoints.join(' '),
    exp.sections.map((s) => `${s.heading} ${s.paragraphs.join(' ')}`).join(' '),
    exp.glossaryTerms?.map((g) => `${g.term} ${g.meaning}`).join(' ') ?? '',
  ];
}

function buildInstrumentSearchFields(inst: MarketInstrument): string[] {
  return [
    inst.instrumentName,
    inst.symbol,
    inst.exchange,
    inst.instrumentType,
    inst.note ?? '',
    inst.currency,
    inst.source,
  ];
}

export interface SiteSearchResults {
  articles: ArticleRecord[];
  ipos: IpoRow[];
  explainers: ExplainerRecord[];
  instruments: MarketInstrument[];
  totalCount: number;
}

export interface SearchSuggestionItem {
  id: string;
  text: string;
  category: string;
  type: 'article' | 'ipo' | 'market' | 'explainer' | 'keyword';
  path: string;
  subtitle?: string;
}

export function searchSiteContent(
  query: string,
  articles: ArticleRecord[],
  ipos: IpoRow[],
  explainers: ExplainerRecord[],
  instruments: MarketInstrument[] = [],
): SiteSearchResults {
  if (!normalizeSearchText(query)) {
    return { articles: [], ipos: [], explainers: [], instruments: [], totalCount: 0 };
  }

  const scoredArticles = articles
    .map((item) => ({ item, score: scoreCorpusMatch(buildArticleSearchFields(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);

  const scoredIpos = ipos
    .map((item) => ({ item, score: scoreCorpusMatch(buildIpoSearchFields(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);

  const scoredExplainers = explainers
    .map((item) => ({ item, score: scoreCorpusMatch(buildExplainerSearchFields(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);

  const scoredInstruments = instruments
    .map((item) => ({ item, score: scoreCorpusMatch(buildInstrumentSearchFields(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);

  return {
    articles: scoredArticles,
    ipos: scoredIpos,
    explainers: scoredExplainers,
    instruments: scoredInstruments,
    totalCount:
      scoredArticles.length +
      scoredIpos.length +
      scoredExplainers.length +
      scoredInstruments.length,
  };
}

function calculateMatchScore(text: string, queryNorm: string): number {
  const norm = normalizeSearchText(text);
  if (!norm || !queryNorm) return 0;
  if (norm === queryNorm) return 100; // Exact match

  const words = norm.split(/\s+/);

  // If query is a single character, ONLY accept exact word starts (e.g. "f" -> "FII", "Fintech")
  if (queryNorm.length === 1) {
    if (words.some((w) => w.startsWith(queryNorm))) {
      return 80;
    }
    return 0; // Reject middle-of-word single character occurrences
  }

  // Multi-character queries
  if (words.some((w) => w === queryNorm)) return 95; // Exact word match
  if (words.some((w) => w.startsWith(queryNorm))) return 80; // Word prefix match
  if (norm.startsWith(queryNorm)) return 85; // String prefix match
  if (queryNorm.length >= 3 && norm.includes(queryNorm)) return 40; // Substring match

  return 0;
}

export function getSearchSuggestions(
  query: string,
  articles: ArticleRecord[],
  ipos: IpoRow[],
  explainers: ExplainerRecord[],
  instruments: MarketInstrument[] = [],
  limit = 7,
): SearchSuggestionItem[] {
  const norm = normalizeSearchText(query);
  if (!norm || norm.length < 1) return [];

  const scoredList: { item: SearchSuggestionItem; score: number }[] = [];
  const seen = new Set<string>();

  // 1. Companies & Market Instruments (High priority for ticker/name search)
  for (const inst of instruments) {
    const symScore = calculateMatchScore(inst.symbol, norm);
    const nameScore = calculateMatchScore(inst.instrumentName, norm);
    const maxScore = Math.max(symScore, nameScore);

    if (maxScore > 0) {
      const key = `comp-${inst.symbol.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        scoredList.push({
          score: maxScore + 5, // slight boost for company/instrument
          item: {
            id: `inst-${inst.id}`,
            text: `${inst.symbol} — ${inst.instrumentName}`,
            category: 'Companies',
            type: 'market',
            path: `/companies/${inst.symbol.toUpperCase()}`,
            subtitle: `${inst.exchange} · ${inst.instrumentType.toUpperCase()}`,
          },
        });
      }
    }
  }

  // 2. Articles & Dispatches (News)
  for (const a of articles) {
    const headScore = calculateMatchScore(a.headline, norm);
    const compScore = a.company ? calculateMatchScore(a.company, norm) : 0;
    const tickScore = calculateMatchScore(a.ticker, norm);
    const maxScore = Math.max(headScore, compScore, tickScore);

    if (maxScore > 0) {
      const key = `art-${a.slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        scoredList.push({
          score: maxScore,
          item: {
            id: `art-${a.id}`,
            text: a.headline,
            category: 'News',
            type: 'article',
            path: `/article/${a.slug}`,
            subtitle: `${a.category} · ${a.time}`,
          },
        });
      }
    }
  }

  // 3. IPO Dossiers
  for (const ipo of ipos) {
    const compScore = calculateMatchScore(ipo.company, norm);
    if (compScore > 0) {
      const key = `ipo-${ipo.slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        scoredList.push({
          score: compScore,
          item: {
            id: `ipo-${ipo.id}`,
            text: ipo.company,
            category: 'IPOs',
            type: 'ipo',
            path: `/ipo/${ipo.slug}`,
            subtitle: `${ipo.segment} · ${ipo.status}`,
          },
        });
      }
    }
  }

  // 4. Topics & Keywords (Predefined search terms)
  for (const term of PREDEFINED_SEARCH_TERMS) {
    const termScore = calculateMatchScore(term, norm);
    if (termScore > 0) {
      const key = `term-${term.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        scoredList.push({
          score: termScore - 5, // keywords rank slightly below direct company/news items
          item: {
            id: `term-${term}`,
            text: term,
            category: 'Topics',
            type: 'keyword',
            path: `/search?q=${encodeURIComponent(term)}`,
            subtitle: 'Topic Guide',
          },
        });
      }
    }
  }

  // 5. Explainers
  for (const exp of explainers) {
    const titleScore = calculateMatchScore(exp.title, norm);
    const tagScore = calculateMatchScore(exp.tag, norm);
    const maxScore = Math.max(titleScore, tagScore);

    if (maxScore > 0) {
      const key = `exp-${exp.slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        scoredList.push({
          score: maxScore - 5,
          item: {
            id: `exp-${exp.id}`,
            text: exp.title,
            category: 'Topics',
            type: 'explainer',
            path: `/explainers/${exp.slug}`,
            subtitle: exp.tag,
          },
        });
      }
    }
  }

  // Sort by score descending
  scoredList.sort((a, b) => b.score - a.score);

  return scoredList.map((entry) => entry.item).slice(0, limit);
}

export function filterNewsItemsBySearch(
  items: NewsItem[],
  category: NewsCategory,
  searchTerm: string,
): NewsItem[] {
  const byCat = items.filter((item) => category === 'All' || item.category === category);
  if (!normalizeSearchText(searchTerm)) return byCat;

  return byCat.filter(
    (item) =>
      scoreCorpusMatch(
        [
          item.headline,
          item.headlineHi ?? '',
          item.category,
          item.subCategory ?? '',
          item.ticker,
          item.summary,
          item.paragraphs.join(' '),
        ],
        searchTerm,
      ) > 0,
  );
}

export function filterArticlesByCategoryAndSearch(
  articles: ArticleRecord[],
  category: NewsCategory,
  searchTerm: string,
): ArticleRecord[] {
  const byCat = articles.filter((a) => category === 'All' || a.category === category);
  if (!normalizeSearchText(searchTerm)) return byCat;

  return byCat
    .map((a) => ({ a, score: scoreCorpusMatch(buildArticleSearchFields(a), searchTerm) }))
    .filter((entry) => entry.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((entry) => entry.a);
}

export function extractSuggestedKeywords(
  articles: ArticleRecord[],
  ipos: IpoRow[],
  explainers: ExplainerRecord[],
  limit = 10,
): string[] {
  const counts = new Map<string, number>();

  const register = (term: string, weight = 1) => {
    const clean = term.trim();
    if (!clean || clean.length < 2 || clean.length > 32) return;
    counts.set(clean, (counts.get(clean) ?? 0) + weight);
  };

  for (const a of articles) {
    register(a.category, 3);
    if (a.company) register(a.company, 3);
    register(a.ticker, 2);
    for (const tag of a.tags) register(tag, 2);
  }
  for (const ipo of ipos) {
    register(ipo.company, 3);
    if (ipo.sellingShareholder) register(ipo.sellingShareholder, 2);
  }
  for (const exp of explainers) {
    for (const kw of exp.keywords.slice(0, 3)) register(kw, 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([kw]) => kw);
}
