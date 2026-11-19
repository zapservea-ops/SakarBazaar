import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSebiRssCandidates } from './collector.ts';

test('parseSebiRssCandidates extracts DRHP/RHP entries and ignores non-IPO circulars', () => {
  const sampleXml = `
    <rss version="2.0">
      <channel>
        <item>
          <title><![CDATA[Acme Solar Holdings Limited - RHP]]></title>
          <link>https://www.sebi.gov.in/filings/public-issues/nov-2026/acme-solar-rhp.html</link>
          <pubDate>Tue, 18 Nov 2026 10:00:00 +0530</pubDate>
          <description>Red Herring Prospectus filed for Mainboard IPO.</description>
        </item>
        <item>
          <title>SEBI Board Meeting Minutes on Mutual Fund Categorisation</title>
          <link>https://www.sebi.gov.in/media/circular.html</link>
          <pubDate>Tue, 18 Nov 2026 09:00:00 +0530</pubDate>
        </item>
        <item>
          <title>Bharat Tech SME Limited - DRHP</title>
          <link>https://www.sebi.gov.in/filings/public-issues/nov-2026/bharat-tech-drhp.html</link>
          <pubDate>Mon, 17 Nov 2026 14:00:00 +0530</pubDate>
        </item>
      </channel>
    </rss>
  `;

  const parsed = parseSebiRssCandidates(sampleXml, 'https://www.sebi.gov.in/sebirss.xml');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].companyName, 'Acme Solar Holdings Limited');
  assert.equal(parsed[0].documentType, 'RHP');
  assert.equal(parsed[0].segment, 'Mainboard');
  assert.equal(parsed[1].companyName, 'Bharat Tech SME Limited');
  assert.equal(parsed[1].documentType, 'DRHP');
  assert.equal(parsed[1].segment, 'SME');
});
