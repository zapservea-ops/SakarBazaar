import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEBI_PUBLIC_ISSUES_URL,
  extractSebiDocumentDetails,
  isAllowedSebiUrl,
  normalizeSebiDateString,
  parseSebiPublicIssuesHtml,
} from './collector.ts';

test('isAllowedSebiUrl strictly permits only sebi.gov.in URLs and rejects third-party sites', () => {
  assert.equal(isAllowedSebiUrl(SEBI_PUBLIC_ISSUES_URL), true);
  assert.equal(isAllowedSebiUrl('https://www.sebi.gov.in/filings/public-issues/nov-2026/acme-rhp.html'), true);
  assert.equal(isAllowedSebiUrl('https://www.nseindia.com/api/ipo-current-issue'), false);
  assert.equal(isAllowedSebiUrl('https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx'), false);
  assert.equal(isAllowedSebiUrl('https://chittorgarh.com/ipo/test'), false);
});

test('normalizeSebiDateString converts common SEBI listing formats cleanly to YYYY-MM-DD', () => {
  assert.equal(normalizeSebiDateString('Nov 18, 2026'), '2026-11-18');
  assert.equal(normalizeSebiDateString('18 Nov 2026'), '2026-11-18');
  assert.equal(normalizeSebiDateString('18-11-2026'), '2026-11-18');
  assert.equal(normalizeSebiDateString('2026-11-18'), '2026-11-18');
});

test('parseSebiPublicIssuesHtml extracts rows, filingDate separate from openingDate, and SEBI pagination links', () => {
  const sampleHtml = `
    <html>
      <body>
        <h1>Public Issues</h1>
        <table class="table table-bordered">
          <thead><tr><th>Date</th><th>Title</th></tr></thead>
          <tbody>
            <tr>
              <td>Nov 18, 2026</td>
              <td><a href="/filings/public-issues/nov-2026/acme-solar-rhp.html">Acme Solar Holdings Limited - RHP</a></td>
            </tr>
            <tr>
              <td>17-11-2026</td>
              <td><a href="/filings/public-issues/nov-2026/bharat-sme-drhp.html">Bharat Tech SME Limited - DRHP</a></td>
            </tr>
            <tr>
              <td>16 Nov 2026</td>
              <td><a href="https://thirdparty-portal.example.com/fake-ipo">Unapproved Third-Party Link</a></td>
            </tr>
          </tbody>
        </table>
        <div class="pagination">
          <a href="/sebiweb/home/HomeAction.do?doListing=yes&amp;sid=3&amp;ssid=15&amp;smid=11&amp;nextValue=2" rel="next">Next</a>
        </div>
      </body>
    </html>
  `;

  const parsed = parseSebiPublicIssuesHtml(sampleHtml, SEBI_PUBLIC_ISSUES_URL);
  assert.equal(parsed.blocked, false);
  assert.equal(parsed.structureRecognized, true);
  assert.equal(parsed.candidates.length, 2);

  assert.equal(parsed.candidates[0].companyName, 'Acme Solar Holdings Limited');
  assert.equal(parsed.candidates[0].documentType, 'RHP');
  assert.equal(parsed.candidates[0].filingDate, '2026-11-18');
  assert.equal(parsed.candidates[0].openingDate, undefined);
  assert.equal(parsed.candidates[0].closingDate, undefined);
  assert.equal(parsed.candidates[0].segment, 'Mainboard');
  assert.equal(
    parsed.candidates[0].sourceUrl,
    'https://www.sebi.gov.in/filings/public-issues/nov-2026/acme-solar-rhp.html',
  );

  assert.equal(parsed.candidates[1].companyName, 'Bharat Tech SME Limited');
  assert.equal(parsed.candidates[1].documentType, 'DRHP');
  assert.equal(parsed.candidates[1].segment, 'SME');
  assert.equal(parsed.candidates[1].filingDate, '2026-11-17');

  assert.equal(parsed.nextPageUrls.length, 1);
  assert.ok(parsed.nextPageUrls[0].includes('nextValue=2'));
});

test('parseSebiPublicIssuesHtml honestly detects CAPTCHA/access blocks and changed structures', () => {
  const blockedHtml = `<html><head><title>Access Denied</title></head><body>Please verify captcha to proceed.</body></html>`;
  const blockedRes = parseSebiPublicIssuesHtml(blockedHtml, SEBI_PUBLIC_ISSUES_URL);
  assert.equal(blockedRes.blocked, true);
  assert.equal(blockedRes.candidates.length, 0);

  const redesignedHtml = `<html><body><div class="new-app-root">Empty SPA Shell</div></body></html>`;
  const changedRes = parseSebiPublicIssuesHtml(redesignedHtml, SEBI_PUBLIC_ISSUES_URL);
  assert.equal(changedRes.blocked, false);
  assert.equal(changedRes.structureRecognized, false);
});

test('extractSebiDocumentDetails extracts official SEBI PDF URL and explicitly labeled fields only', () => {
  const detailHtml = `
    <html><body>
      <div>Date of Filing: 18 Nov 2026</div>
      <div>Issue Opening Date: 25 Nov 2026</div>
      <div>Issue Closing Date: 27 Nov 2026</div>
      <div>Price Band: ₹310 - ₹326</div>
      <div>Total Issue Size: ₹1,450 Crore</div>
      <a href="/sebi_data/attachdocs/nov-2026/acme_rhp.pdf">Download RHP PDF</a>
    </body></html>
  `;
  const details = extractSebiDocumentDetails(
    detailHtml,
    'https://www.sebi.gov.in/filings/public-issues/nov-2026/acme-rhp.html',
  );
  assert.equal(details.documentUrl, 'https://www.sebi.gov.in/sebi_data/attachdocs/nov-2026/acme_rhp.pdf');
  assert.equal(details.filingDate, '2026-11-18');
  assert.equal(details.openingDate, '2026-11-25');
  assert.equal(details.closingDate, '2026-11-27');
  assert.equal(details.priceBand, '₹310 - ₹326');
  assert.equal(details.issueSize, '₹1,450 Crore');
});
