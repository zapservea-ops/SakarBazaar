import { useState } from 'react';
import { saveManagedIpoRecord } from '../../lib/firebase';
import type { IpoSegment, ManagedIpoRecord } from '../../types/sakarbazaar';
import { calculateIpoStatusFromDates, formatOfficialIpoField } from '../../utils/ipoLifecycle';
import { slugifyTitle } from '../../utils/marketFormat';
import type { AdminSectionBaseProps } from './adminTypes';

interface AdminIpoManagerProps extends AdminSectionBaseProps {
  onPublicContentChanged: () => Promise<void>;
}

export function AdminIpoManager({
  data,
  onRefresh,
  onPublicContentChanged,
  onNotify,
}: AdminIpoManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [segment, setSegment] = useState<IpoSegment>('Mainboard');
  const [verificationStatus, setVerificationStatus] = useState<'awaiting_verification' | 'verified'>('verified');
  const [issueSize, setIssueSize] = useState('');
  const [priceBand, setPriceBand] = useState('');
  const [lotSize, setLotSize] = useState('');
  const [filingDate, setFilingDate] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [allotmentDate, setAllotmentDate] = useState('');
  const [listingDate, setListingDate] = useState('');
  const [offerType, setOfferType] = useState('');
  const [sellingShareholder, setSellingShareholder] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);

  const previewStatus = calculateIpoStatusFromDates({
    openingDate,
    closingDate,
    listingDate,
    verificationStatus,
  });

  function resetForm() {
    setEditingId(null);
    setCompanyName('');
    setSegment('Mainboard');
    setVerificationStatus('verified');
    setIssueSize('');
    setPriceBand('');
    setLotSize('');
    setFilingDate('');
    setOpeningDate('');
    setClosingDate('');
    setAllotmentDate('');
    setListingDate('');
    setOfferType('');
    setSellingShareholder('');
    setSourceName('');
    setSourceUrl('');
    setSummary('');
  }

  function loadIpo(item: ManagedIpoRecord) {
    setEditingId(item.id);
    setCompanyName(item.companyName);
    setSegment(item.segment);
    setVerificationStatus(item.verificationStatus);
    setIssueSize(item.issueSize || '');
    setPriceBand(item.priceBand || '');
    setLotSize(item.lotSize || '');
    setFilingDate(item.filingDate || '');
    setOpeningDate(item.openingDate || '');
    setClosingDate(item.closingDate || '');
    setAllotmentDate(item.allotmentDate || '');
    setListingDate(item.listingDate || '');
    setOfferType(item.offerType || '');
    setSellingShareholder(item.sellingShareholder || '');
    setSourceName(item.sourceName || '');
    setSourceUrl(item.sourceUrl || '');
    setSummary(item.summary || '');
  }

  async function handleSave() {
    if (companyName.trim().length < 2) {
      onNotify({ tone: 'err', text: 'Company name is required.' });
      return;
    }
    setBusy(true);
    try {
      const slug = slugifyTitle(companyName) || `ipo-${Date.now().toString(36)}`;
      const id = editingId || `ipo_${slug.slice(0, 80)}_${Date.now().toString(36)}`;
      await saveManagedIpoRecord(
        {
          id,
          companyName: companyName.trim(),
          slug,
          segment,
          status: previewStatus,
          issueSize,
          priceBand,
          lotSize,
          filingDate,
          openingDate,
          closingDate,
          allotmentDate,
          listingDate,
          offerType,
          sellingShareholder,
          sourceName,
          sourceUrl,
          summary,
          officialDocuments: sourceUrl.trim() ? [sourceUrl.trim()] : [],
          verificationStatus,
        },
        !editingId,
      );
      await onRefresh();
      await onPublicContentChanged();
      resetForm();
      onNotify({
        tone: 'ok',
        text: `Saved IPO record "${companyName.trim()}" (${previewStatus}).`,
      });
    } catch (err) {
      onNotify({ tone: 'err', text: err instanceof Error ? err.message : 'Unable to save IPO record.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sb-admin-stack">
      <section className="card snap">
        <div className="sec-h">
          <div>
            <h2>IPO Calendar Manager (Mainboard &amp; SME)</h2>
            <p className="sb-sec-sub">
              Status auto-calculates in IST strictly from verified opening/closing/listing dates (never from SEBI filing dates).
              Missing fields display cleanly as <strong>Not announced</strong>.
            </p>
          </div>
          {editingId && (
            <button type="button" className="btn ghost sb-admin-touch-btn" onClick={resetForm}>
              + New IPO Entry
            </button>
          )}
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Company Name</span>
            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </label>
          <label className="sb-form-field">
            <span>Segment</span>
            <select value={segment} onChange={(e) => setSegment(e.target.value as IpoSegment)}>
              <option value="Mainboard">Mainboard</option>
              <option value="SME">SME</option>
            </select>
          </label>
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Verification Status</span>
            <select
              value={verificationStatus}
              onChange={(e) => setVerificationStatus(e.target.value as 'awaiting_verification' | 'verified')}
            >
              <option value="verified">Verified (Visible on Public /ipo &amp; /calendar)</option>
              <option value="awaiting_verification">Awaiting Verification (Private Draft)</option>
            </select>
          </label>
          <div className="sb-form-field">
            <span>Auto-Calculated IST Status</span>
            <div className="sb-note-box" style={{ margin: 0, padding: '8px 12px' }}>
              <strong>{previewStatus}</strong>
            </div>
          </div>
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Issue Size (leave blank if not announced)</span>
            <input type="text" value={issueSize} onChange={(e) => setIssueSize(e.target.value)} placeholder="e.g. ₹1,250 Cr" />
          </label>
          <label className="sb-form-field">
            <span>Price Band</span>
            <input type="text" value={priceBand} onChange={(e) => setPriceBand(e.target.value)} placeholder="e.g. ₹210–₹222" />
          </label>
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Lot Size</span>
            <input type="text" value={lotSize} onChange={(e) => setLotSize(e.target.value)} placeholder="e.g. 65 shares" />
          </label>
          <label className="sb-form-field">
            <span>SEBI DRHP / RHP Filing Date (Separate from Open Date)</span>
            <input type="date" value={filingDate} onChange={(e) => setFilingDate(e.target.value)} />
          </label>
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Opening Date (YYYY-MM-DD)</span>
            <input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
          </label>
          <label className="sb-form-field">
            <span>Closing Date (YYYY-MM-DD)</span>
            <input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
          </label>
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Allotment Date (YYYY-MM-DD)</span>
            <input type="date" value={allotmentDate} onChange={(e) => setAllotmentDate(e.target.value)} />
          </label>
          <label className="sb-form-field">
            <span>Listing Date (YYYY-MM-DD)</span>
            <input type="date" value={listingDate} onChange={(e) => setListingDate(e.target.value)} />
          </label>
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Offer Type</span>
            <input type="text" value={offerType} onChange={(e) => setOfferType(e.target.value)} placeholder="Fresh Issue / OFS" />
          </label>
          <label className="sb-form-field">
            <span>Selling Shareholder (if OFS)</span>
            <input type="text" value={sellingShareholder} onChange={(e) => setSellingShareholder(e.target.value)} />
          </label>
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Official Source Name (Optional)</span>
            <input type="text" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="SEBI / NSE / BSE" />
          </label>
          <label className="sb-form-field">
            <span>Official Filing URL (Optional)</span>
            <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://www.sebi.gov.in/..." />
          </label>
        </div>

        <label className="sb-form-field">
          <span>Summary / Dossier Notes</span>
          <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>

        <button type="button" className="btn sb-admin-touch-btn" disabled={busy} onClick={() => void handleSave()}>
          {editingId ? 'Update IPO Record' : 'Save IPO Record'}
        </button>
      </section>

      <section className="card snap">
        <h3>Managed IPO Dossiers ({data.ipos.length})</h3>
        {data.ipos.length > 0 ? (
          <div className="sb-admin-card-list">
            {data.ipos.map((ipo) => (
              <div className="sb-admin-item-card" key={ipo.id}>
                <div className="sb-admin-item-top">
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="pill">{ipo.segment}</span>
                    <span className="pill sb-pill-teal">{ipo.status}</span>
                    <span className={`pill ${ipo.verificationStatus === 'verified' ? 'sb-pill-teal' : 'sb-pill-amber'}`}>
                      {ipo.verificationStatus}
                    </span>
                  </div>
                  <span className="meta">
                    Open: {formatOfficialIpoField(ipo.openingDate)} · Close: {formatOfficialIpoField(ipo.closingDate)}
                  </span>
                </div>
                <h3>{ipo.companyName}</h3>
                <div className="meta">
                  Size: {formatOfficialIpoField(ipo.issueSize)} · Price Band: {formatOfficialIpoField(ipo.priceBand)} · SEBI Filing: {formatOfficialIpoField(ipo.filingDate)}
                </div>
                <div className="sb-admin-item-actions" style={{ marginTop: '10px' }}>
                  <button type="button" className="btn ghost" onClick={() => loadIpo(ipo)}>
                    Edit IPO
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="meta" style={{ margin: 0 }}>
            No custom Firestore IPO records yet. Add one above or run IPO Source Review to import official candidates.
          </p>
        )}
      </section>
    </div>
  );
}
