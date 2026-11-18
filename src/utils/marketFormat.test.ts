import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDivergingBars,
  buildSparklinePoints,
  calculatePercentChange,
  extractSuggestedKeywords,
  filterArticlesByCategory,
  filterCalendarItems,
  filterIpoRows,
  filterNewsItems,
  formatIndianNumber,
  getArrowSymbol,
  getChangeClass,
  getIstMarketStatus,
  getSignPrefix,
  getVerifiedIpoCounts,
  isValidEmailAddress,
  searchSiteContent,
  slugifyTitle,
} from './marketFormat';
import {
  ARTICLES_CATALOG,
  CALENDAR_SCHEDULE,
  EXPLAINERS_CATALOG,
  IPO_ALL_RECORDS,
  NEWS_ITEMS,
} from '../data/sampleData';

test('formatIndianNumber formats using en-IN grouping and absolute value', () => {
  assert.equal(formatIndianNumber(26178.75), '26,178.75');
  assert.equal(formatIndianNumber(132400, 2), '1,32,400.00');
  assert.equal(formatIndianNumber(-312.4, 2), '312.40');
});

test('sign, class, and arrow helpers reflect positive, negative, and zero changes', () => {
  assert.equal(getSignPrefix(10), '+');
  assert.equal(getSignPrefix(-10), '−');
  assert.equal(getSignPrefix(0), '');

  assert.equal(getChangeClass(0.5), 'up');
  assert.equal(getChangeClass(-0.5), 'down');
  assert.equal(getChangeClass(0), '');

  assert.equal(getArrowSymbol(1), '▲');
  assert.equal(getArrowSymbol(-1), '▼');
  assert.equal(getArrowSymbol(0), '–');
});

test('calculatePercentChange computes change over prior close', () => {
  const pct = calculatePercentChange(110, 10);
  assert.equal(Number(pct.toFixed(2)), 10);
  assert.equal(calculatePercentChange(10, 10), 0);
});

test('getIstMarketStatus distinguishes market hours vs closed/weekend in IST', () => {
  const mondayOpen = new Date('2026-11-16T04:30:00Z');
  const openRes = getIstMarketStatus(mondayOpen, 'en');
  assert.equal(openRes.isOpen, true);
  assert.equal(openRes.statusText, 'Market session (IST)');

  const mondayClosed = new Date('2026-11-16T10:30:00Z');
  const closedRes = getIstMarketStatus(mondayClosed, 'hi');
  assert.equal(closedRes.isOpen, false);
  assert.equal(closedRes.statusText, 'बाज़ार बंद');

  const sunday = new Date('2026-11-15T05:30:00Z');
  assert.equal(getIstMarketStatus(sunday, 'en').isOpen, false);
});

test('SVG sparkline and diverging bar geometry produce valid coordinates', () => {
  const pts = buildSparklinePoints([4, 5, 9], 64, 22);
  assert.equal(pts.split(' ').length, 3);
  assert.ok(pts.startsWith('0,'));

  const bars = buildDivergingBars([100, -50]);
  assert.equal(bars.length, 2);
  assert.equal(bars[0].tone, 'up');
  assert.equal(bars[0].y + bars[0].height, 22);
  assert.equal(bars[1].tone, 'down');
  assert.equal(bars[1].y, 22);
});

test('filterNewsItems and filterArticlesByCategory work with real MCL and Economy dispatches', () => {
  const ipoOnly = filterNewsItems(NEWS_ITEMS, 'IPO', '');
  assert.equal(ipoOnly.length, 1);
  assert.equal(ipoOnly[0].slug, 'mahanadi-coalfields-ipo-proposed-offer-financial-details');

  const economy = filterArticlesByCategory(ARTICLES_CATALOG, 'Economy', '');
  assert.equal(economy.length, 1);
  assert.equal(economy[0].slug, 'india-egypt-explore-cooperation-evs-fintech-renewable-energy');
});

test('getVerifiedIpoCounts excludes unverified MCL IPO from confirmed open/upcoming counts', () => {
  const counts = getVerifiedIpoCounts(IPO_ALL_RECORDS);
  assert.equal(counts.confirmedOpen, 0);
  assert.equal(counts.confirmedUpcoming, 0);
  assert.equal(counts.verifiedTotal, 0);

  const proposedMainboard = filterIpoRows(IPO_ALL_RECORDS, 'Mainboard', 'Proposed OFS');
  assert.equal(proposedMainboard.length, 1);
  assert.equal(proposedMainboard[0].slug, 'mahanadi-coalfields-limited');
});

test('filterCalendarItems handles confirmed empty calendar state safely', () => {
  assert.equal(filterCalendarItems(CALENDAR_SCHEDULE, 'day', 'All').length, 0);
  assert.equal(filterCalendarItems(CALENDAR_SCHEDULE, 'week', 'All').length, 0);
  assert.equal(filterCalendarItems(CALENDAR_SCHEDULE, 'upcoming', 'All').length, 0);
});

test('searchSiteContent handles pluralization, aliases, full-body, and partial matching accurately', () => {
  // Plural / singular & case-insensitivity for IPO/IPOS
  const ipoLower = searchSiteContent('ipo', ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG);
  const iposUpper = searchSiteContent('IPOS', ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG);
  const iposLower = searchSiteContent('ipos', ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG);
  assert.ok(ipoLower.articles.some((a) => a.slug.includes('mahanadi')));
  assert.equal(iposUpper.ipos.length, 1);
  assert.equal(iposLower.totalCount, iposUpper.totalCount);

  // MCL & Coal India alias expansion
  const mcl = searchSiteContent('MCL', ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG);
  assert.equal(mcl.articles[0].slug, 'mahanadi-coalfields-ipo-proposed-offer-financial-details');
  assert.equal(mcl.ipos[0].slug, 'mahanadi-coalfields-limited');

  const coalIndia = searchSiteContent('Coal India', ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG);
  assert.ok(coalIndia.articles.length >= 1);
  assert.equal(coalIndia.ipos.length, 1);

  // Partial matching
  const partialMahan = searchSiteContent('mahan', ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG);
  assert.equal(partialMahan.articles.length, 1);
  assert.equal(partialMahan.ipos.length, 1);

  // India-Egypt article via person, company, sector, and body terms
  for (const query of ['Egypt', 'Piyush Goyal', 'Infinity Energy', 'fintech', 'EV']) {
    const res = searchSiteContent(query, ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG);
    assert.ok(
      res.articles.some((a) => a.slug === 'india-egypt-explore-cooperation-evs-fintech-renewable-energy'),
      `Expected query "${query}" to match India-Egypt article`,
    );
  }

  // Explainers
  const gmpRes = searchSiteContent('GMP', ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG);
  assert.equal(gmpRes.explainers.some((e) => e.slug === 'gmp-explained'), true);

  const rbiRes = searchSiteContent('RBI', ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG);
  assert.ok(rbiRes.explainers.length >= 2);

  // Empty & no results
  assert.equal(searchSiteContent('   ', ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG).totalCount, 0);
  assert.equal(searchSiteContent('sahyadri', ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG).totalCount, 0);
});

test('extractSuggestedKeywords derives real non-fictional terms from active catalog', () => {
  const keywords = extractSuggestedKeywords(ARTICLES_CATALOG, IPO_ALL_RECORDS, EXPLAINERS_CATALOG, 8);
  assert.ok(keywords.length > 0);
  assert.ok(!keywords.some((k) => k.toLowerCase().includes('sahyadri')));
});

test('isValidEmailAddress and slugifyTitle behave accurately', () => {
  assert.equal(isValidEmailAddress('reader@example.in'), true);
  assert.equal(isValidEmailAddress('invalid-email'), false);
  assert.equal(isValidEmailAddress(''), false);
  assert.equal(slugifyTitle('Mahanadi Coalfields Limited (MCL)!'), 'mahanadi-coalfields-limited-mcl');
});
