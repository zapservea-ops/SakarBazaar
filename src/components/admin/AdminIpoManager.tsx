import { useMemo, useRef, useState } from 'react';
import { IPO_ALL_RECORDS } from '../../data/sampleData';
import {
  deleteIpoRecordSafely,
  runOfficialSebiSourceCheckAndQueue,
  saveManagedIpoRecord,
  updateIpoLifecycleStatus,
  type SebiCheckQueueResult,
} from '../../lib/firebase';
import type { IpoSegment, ManagedIpoRecord } from '../../types/sakarbazaar';
import {
  buildHistoricalIpoConflictReport,
  buildIpoBackfillDryRunReport,
  buildProductionIpoSchemaInventory,
  buildStableIpoMigrationKey,
  calculateIpoStatusFromDates,
  classifyIpoDeletionEligibility,
  formatOfficialIpoField,
  inspectIpoLinkedReferences,
} from '../../utils/ipoLifecycle';
import { extractReadableErrorMessage, extractTimestampMillis, sanitizeArticleSlug } from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

interface AdminIpoManagerProps extends AdminSectionBaseProps {
  onPublicContentChanged: () => Promise<void>;
}

const OFFICIAL_SEBI_URL =
  'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11';

export function AdminIpoManager({
  data,
  permissions,
  onRefresh,
  onNavigate,
  onPublicContentChanged,
  onNotify,
}: AdminIpoManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editingMigrationKey, setEditingMigrationKey] = useState<string | undefined>(undefined);
  const [editingPrevVerification, setEditingPrevVerification] = useState<'awaiting_verification' | 'verified' | undefined>(undefined);
  const [editingIsArchived, setEditingIsArchived] = useState<boolean>(false);
  const [editingDeletionStatus, setEditingDeletionStatus] = useState<ManagedIpoRecord['deletionStatus']>('none');
  const [existingDocs, setExistingDocs] = useState<string[]>([]);
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
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showStaticExclusions, setShowStaticExclusions] = useState(false);

  const [checkingSebi, setCheckingSebi] = useState(false);
  const [sebiReport, setSebiReport] = useState<SebiCheckQueueResult | null>(null);
  const busyRef = useRef(false);
  const checkingSebiRef = useRef(false);
  const pendingIpoIdRef = useRef<string | null>(null);
  const editingUpdatedAtMsRef = useRef<number | null>(null);

  const conflictReport = useMemo(
    () =>
      buildHistoricalIpoConflictReport({
        firestoreIpos: data.ipos,
        staticIpos: IPO_ALL_RECORDS,
      }),
    [data.ipos],
  );

  const nonSampleConflicts = useMemo(
    () => conflictReport.items.filter((i) => i.conflictType !== 'sample_or_fixture_excluded'),
    [conflictReport.items],
  );
  const sampleExclusions = useMemo(
    () => conflictReport.items.filter((i) => i.conflictType === 'sample_or_fixture_excluded'),
    [conflictReport.items],
  );
  const recordClassifications = conflictReport.recordClassifications ?? [];
  const unifiedPreview = conflictReport.unifiedPreview ?? [];
  const [showUnifiedPreview, setShowUnifiedPreview] = useState(true);
  const schemaInventory = useMemo(
    () => buildProductionIpoSchemaInventory(data.ipos),
    [data.ipos],
  );
  const backfillDryRun = useMemo(
    () => buildIpoBackfillDryRunReport(data.ipos),
    [data.ipos],
  );

  const previewStatus = calculateIpoStatusFromDates({
    openingDate,
    closingDate,
    listingDate,
    verificationStatus,
    isArchived: editingIsArchived,
    deletionStatus: editingDeletionStatus,
  });

  function resetForm() {
    pendingIpoIdRef.current = null;
    editingUpdatedAtMsRef.current = null;
    setEditingId(null);
    setEditingSlug(null);
    setEditingMigrationKey(undefined);
    setEditingPrevVerification(undefined);
    setEditingIsArchived(false);
    setEditingDeletionStatus('none');
    setExistingDocs([]);
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
    pendingIpoIdRef.current = item.id;
    editingUpdatedAtMsRef.current = extractTimestampMillis(item.updatedAt);
    setEditingId(item.id);
    setEditingSlug(item.slug);
    setEditingMigrationKey(item.migrationKey);
    setEditingPrevVerification(item.previousVerificationStatus);
    setEditingIsArchived(Boolean(item.isArchived));
    setEditingDeletionStatus(item.deletionStatus ?? 'none');
    setExistingDocs(item.officialDocuments ?? []);
    setCompanyName(item.companyName);
    setSegment(item.segment);
    setVerificationStatus(item.verificationStatus === 'verified' ? 'verified' : 'awaiting_verification');
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
    if (busyRef.current) return;
    if (companyName.trim().length < 2) {
      onNotify({ tone: 'err', text: 'Company name is required.' });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const slug = editingSlug || sanitizeArticleSlug(companyName, 'ipo');
      if (!editingId && !pendingIpoIdRef.current) {
        pendingIpoIdRef.current = `ipo_${slug.slice(0, 80)}_${Date.now().toString(36)}`;
      }
      const id = editingId || pendingIpoIdRef.current!;
      const mergedDocs = [
        ...new Set([
          ...existingDocs,
          ...(sourceUrl.trim() ? [sourceUrl.trim()] : []),
        ].filter(Boolean)),
      ].slice(0, 6);

      await saveManagedIpoRecord(
        {
          id,
          migrationKey: editingMigrationKey,
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
          officialDocuments: mergedDocs,
          verificationStatus,
          previousVerificationStatus: editingPrevVerification,
          isArchived: editingIsArchived,
          deletionStatus: editingDeletionStatus,
        },
        !editingId,
        editingId ? editingUpdatedAtMsRef.current : null,
      );
      await onRefresh();
      await onPublicContentChanged();
      resetForm();
      onNotify({
        tone: 'ok',
        text: `Saved IPO record "${companyName.trim()}" (${previewStatus}).`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to save IPO record.'),
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleLifecycleAction(
    ipo: ManagedIpoRecord,
    action: 'archive' | 'unpublish' | 'restore' | 'request_delete' | 'approve_delete',
  ) {
    if (busyRowId) return;
    setBusyRowId(ipo.id);
    try {
      await updateIpoLifecycleStatus(ipo, action);
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Updated IPO "${ipo.companyName}" lifecycle (${action}). Public views refreshed.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, `Unable to apply ${action} to IPO dossier.`),
      });
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleControlledDelete(ipo: ManagedIpoRecord) {
    if (busyRowId) return;
    setBusyRowId(ipo.id);
    setConfirmDeleteId(null);
    try {
      await deleteIpoRecordSafely(ipo);
      if (editingId === ipo.id) resetForm();
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Controlled deletion complete for non-public IPO dossier "${ipo.companyName}".`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to delete IPO dossier.'),
      });
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleCheckOfficialSebiSource() {
    if (checkingSebiRef.current || checkingSebi) return;
    checkingSebiRef.current = true;
    setCheckingSebi(true);
    try {
      const report = await runOfficialSebiSourceCheckAndQueue({
        forceRefresh: false,
        existingIpos: data.ipos,
        existingReviews: data.ipoReviews,
      });
      setSebiReport(report);
      await onRefresh();
      const sebiPortal = report.portals[0];
      if (sebiPortal && sebiPortal.status !== 'reachable') {
        onNotify({
          tone: 'err',
          text: `${sebiPortal.portalName} (${sebiPortal.status}): ${sebiPortal.message}`,
        });
      } else {
        onNotify({
          tone: 'ok',
          text: `Official SEBI check complete: ${report.candidatesCount} filing(s) found, ${report.queuedCount} new/updated item(s) placed in Needs Review.`,
        });
      }
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Official SEBI source check failed.'),
      });
    } finally {
      checkingSebiRef.current = false;
      setCheckingSebi(false);
    }
  }

  const pendingReviewsCount = data.ipoReviews.filter((r) => r.reviewStatus === 'Needs Review').length;

  return (
    <div className="sb-admin-stack">
      <section className="card snap">
        <div className="sec-h">
          <div>
            <h2>IPO Calendar Manager (Mainboard &amp; SME)</h2>
            <p className="sb-sec-sub">
              Status auto-calculates in IST strictly from verified opening/closing/listing dates (never from SEBI filing dates).
              Identity preserves existing document IDs plus stable <code>migrationKey</code> tracking; repeat offerings and name changes never auto-merge on name alone.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn sb-admin-touch-btn"
              disabled={checkingSebi}
              onClick={() => void handleCheckOfficialSebiSource()}
            >
              {checkingSebi ? 'Checking SEBI Source…' : 'Check Official SEBI Source'}
            </button>
            {pendingReviewsCount > 0 && (
              <button
                type="button"
                className="btn ghost sb-admin-touch-btn"
                onClick={() => onNavigate('ipo-review')}
              >
                Review Queue ({pendingReviewsCount}) →
              </button>
            )}
            {editingId && (
              <button type="button" className="btn ghost sb-admin-touch-btn" onClick={resetForm}>
                + New IPO Entry
              </button>
            )}
          </div>
        </div>

        <div className="sb-note-box" style={{ marginBottom: '14px' }}>
          <strong>SEBI-Only Official Verification:</strong> Automated checks retrieve ONLY{' '}
          <a href={OFFICIAL_SEBI_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
            sebi.gov.in Public Issues ↗
          </a>{' '}
          and linked SEBI documents. New or changed items always go to{' '}
          <strong>10. IPO Source Review</strong> for Owner/Publisher approval before public display.
        </div>

        {sebiReport && sebiReport.portals.length > 0 && (
          <div className="sb-admin-subpanel" style={{ marginBottom: '14px' }}>
            {sebiReport.portals.map((p) => (
              <div key={p.portalId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '6px' }}>
                  <strong>{p.portalName}</strong>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className={`pill ${p.status === 'reachable' ? 'sb-pill-teal' : 'sb-pill-amber'}`}>
                      {p.status}
                    </span>
                    {sebiReport.cached && <span className="pill sb-pill-muted">Cached</span>}
                    {typeof p.pagesChecked === 'number' && (
                      <span className="meta">Pages checked: {p.pagesChecked}</span>
                    )}
                  </div>
                </div>
                <p className="meta" style={{ margin: '0 0 8px', lineHeight: 1.5 }}>{p.message}</p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="meta">
                    Candidates: <strong>{sebiReport.candidatesCount}</strong> · Queued for review:{' '}
                    <strong>{sebiReport.queuedCount}</strong> · Duplicates skipped:{' '}
                    <strong>{sebiReport.skippedDuplicateCount}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => onNavigate('ipo-review')}
                  >
                    Open IPO Source Review →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

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
            <input type="text" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="SEBI Official Public Issues" />
          </label>
          <label className="sb-form-field">
            <span>Official Filing URL (Optional)</span>
            <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://www.sebi.gov.in/..." />
          </label>
        </div>

        {existingDocs.length > 0 && (
          <div className="sb-note-box" style={{ marginBottom: '12px' }}>
            <strong>Preserved Official SEBI Documents ({existingDocs.length}):</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
              {existingDocs.map((docUrl, i) => (
                <li key={i}>
                  <a href={docUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                    {docUrl} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="sb-form-field">
          <span>Summary / Dossier Notes</span>
          <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>

        <button type="button" className="btn sb-admin-touch-btn" disabled={busy} onClick={() => void handleSave()}>
          {editingId ? 'Update IPO Record' : 'Save IPO Record'}
        </button>
      </section>

      {/* Historical & Built-in IPO Classification, Conflict Audit & Unified Read-Only Preview */}
      <section className="card snap">
        <div className="sec-h">
          <div>
            <h3>IPO Classification, Conflict Audit &amp; Unified Read-Only Preview</h3>
            <p className="sb-sec-sub">
              Read-only verification classifying each built-in <code>IPO_ALL_RECORDS</code> entry by actual evidence
              (historical vs. current vs. sample), flagging potential duplicates without auto-merging, and previewing all genuine IPOs across Firestore and built-in sources.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setShowUnifiedPreview((v) => !v)}
            >
              {showUnifiedPreview
                ? `Hide Unified Preview (${unifiedPreview.length})`
                : `Show Unified Preview (${unifiedPreview.length})`}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setShowStaticExclusions((v) => !v)}
            >
              {showStaticExclusions
                ? `Hide Sample Exclusions (${sampleExclusions.length})`
                : `Inspect Sample Exclusions (${sampleExclusions.length})`}
            </button>
          </div>
        </div>

        <div className="sb-admin-kpi-grid" style={{ marginBottom: '12px' }}>
          <div className="sb-admin-kpi">
            <b>{conflictReport.totalFirestoreIpos}</b>
            <span>Firestore IPOs</span>
          </div>
          <div className="sb-admin-kpi">
            <b>{conflictReport.genuineCatalogCount ?? 0}</b>
            <span>Built-in Genuine IPOs</span>
          </div>
          <div className="sb-admin-kpi">
            <b>{nonSampleConflicts.filter((c) => c.severity === 'blocking').length}</b>
            <span>Blocking Conflicts</span>
          </div>
          <div className="sb-admin-kpi">
            <b>{nonSampleConflicts.filter((c) => c.severity === 'warning').length}</b>
            <span>Warnings / Review</span>
          </div>
          <div className="sb-admin-kpi">
            <b>{conflictReport.sampleExcludedCount}</b>
            <span>Samples Excluded</span>
          </div>
        </div>

        <div className="sb-admin-subpanel" style={{ marginBottom: '12px' }}>
          <strong>Production /ipos Schema &amp; 4-Filter Query Readiness (Read-Only Inventory):</strong>
          <div className="sb-admin-kpi-grid" style={{ marginTop: '8px', marginBottom: '8px' }}>
            <div className="sb-admin-kpi">
              <b>{schemaInventory.totalRecords}</b>
              <span>Total /ipos Docs</span>
            </div>
            <div className="sb-admin-kpi">
              <b>{schemaInventory.withIsArchivedCount}</b>
              <span>With isArchived</span>
            </div>
            <div className="sb-admin-kpi">
              <b>{schemaInventory.withDeletionStatusCount}</b>
              <span>With deletionStatus</span>
            </div>
            <div className="sb-admin-kpi">
              <b>{schemaInventory.missingEitherFieldCount}</b>
              <span>Missing Either Field</span>
            </div>
            <div className="sb-admin-kpi">
              <b>{schemaInventory.verifiedPublic4FilterCount} / {schemaInventory.verifiedLegacy2FilterCount}</b>
              <span>4-Filter vs 2-Filter Live</span>
            </div>
            <div className="sb-admin-kpi">
              <b>{schemaInventory.droppedUnderNewQueryIds.length}</b>
              <span>Dropped by 4-Filter Query</span>
            </div>
            <div className="sb-admin-kpi">
              <b>
                {schemaInventory.archivedCount} / {schemaInventory.unpublishedCount} / {schemaInventory.pendingDeletionCount}
              </b>
              <span>Arch / Unpub / Pending Del</span>
            </div>
            <div className="sb-admin-kpi">
              <b>{schemaInventory.invalidOrUnknownStatuses.length}</b>
              <span>Schema / Status Anomalies</span>
            </div>
          </div>
          <div className="meta" style={{ lineHeight: 1.55 }}>
            {backfillDryRun.recordsRequiringBackfill > 0
              ? `Dry-Run Backfill Preview: ${backfillDryRun.recordsRequiringBackfill} record(s) need defaults (${backfillDryRun.droppedVerifiedRecordsRescuedCount} verified public record(s) would restore visibility). `
              : 'All loaded Firestore /ipos records carry explicit isArchived & deletionStatus fields. '}
            {backfillDryRun.strategySummary}
          </div>
        </div>

        {recordClassifications.length > 0 && (
          <div className="sb-admin-subpanel" style={{ marginBottom: '12px' }}>
            <strong>Built-in IPO_ALL_RECORDS Classification Report ({recordClassifications.length}):</strong>
            <div className="sb-admin-list" style={{ marginTop: '8px' }}>
              {recordClassifications.map((rec) => (
                <div className="sb-admin-list-row" key={rec.recordId}>
                  <div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span
                        className={`pill ${
                          rec.classification === 'demonstration_sample'
                            ? 'sb-pill-amber'
                            : rec.classification === 'unknown_review'
                              ? 'sb-pill-muted'
                              : 'sb-pill-teal'
                        }`}
                      >
                        {rec.classification}
                      </span>
                      <span className="pill">{rec.segment}</span>
                      <span className="pill sb-pill-muted">{rec.status}</span>
                      {rec.conflictStatus !== 'none' && (
                        <span className="pill sb-pill-amber">{rec.conflictStatus}</span>
                      )}
                    </div>
                    <strong>
                      {rec.companyName} (<code>{rec.recordId}</code>)
                    </strong>
                    <div className="meta">{rec.evidence}</div>
                    <div className="meta">Public routes: {rec.publicRoutes.join(', ')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showUnifiedPreview && (
          <div className="sb-admin-subpanel" style={{ marginBottom: '12px' }}>
            <strong>Unified Read-Only IPO Preview (Firestore + Built-in Genuine &amp; Unknown Catalog, No Auto-Merge):</strong>
            {unifiedPreview.length > 0 ? (
              <div className="sb-admin-list" style={{ marginTop: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {unifiedPreview.map((entry) => (
                  <div className="sb-admin-list-row" key={`${entry.origin}-${entry.id}`}>
                    <div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span className="pill">{entry.origin}</span>
                        <span className={`pill ${entry.classification === 'unknown_review' ? 'sb-pill-amber' : 'sb-pill-teal'}`}>
                          {entry.classification}
                        </span>
                        <span className="pill">{entry.segment}</span>
                        <span className={`pill ${entry.isPubliclyVisible ? 'sb-pill-teal' : 'sb-pill-muted'}`}>
                          {entry.isPubliclyVisible ? 'Public Visible' : 'Hidden / Shadowed'}
                        </span>
                        {entry.potentialDuplicateIds.length > 0 && (
                          <span className="pill sb-pill-amber">
                            Potential Duplicate: {entry.potentialDuplicateIds.join(', ')}
                          </span>
                        )}
                      </div>
                      <strong>
                        {entry.companyName} (<code>{entry.id}</code>)
                      </strong>
                      <div className="meta">
                        Status: {entry.status} · Open: {entry.openDate ?? 'TBA'} · Close: {entry.closeDate ?? 'TBA'} · List: {entry.listingDate ?? 'TBA'}
                      </div>
                      <div className="meta">{entry.notes}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="meta" style={{ margin: '6px 0 0' }}>No genuine IPO entries to preview.</p>
            )}
          </div>
        )}

        {nonSampleConflicts.length > 0 ? (
          <div className="sb-admin-list" style={{ marginBottom: '12px' }}>
            {nonSampleConflicts.map((c, idx) => (
              <div className="sb-admin-list-row" key={`${c.recordId}-${c.conflictType}-${idx}`}>
                <div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span className={`pill ${c.severity === 'blocking' ? 'sb-pill-amber' : 'sb-pill-muted'}`}>
                      {c.conflictType}
                    </span>
                    <span className="pill">{c.segment}</span>
                    <span className="pill sb-pill-muted">{c.sourceOrigin}</span>
                  </div>
                  <strong>
                    {c.companyName} (<code>{c.recordId}</code>)
                    {c.relatedRecordId ? ` ↔ ${c.relatedCompanyName} (${c.relatedRecordId})` : ''}
                  </strong>
                  <div className="meta">{c.reason}</div>
                  <div className="meta">Action: {c.recommendedAction}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="meta" style={{ margin: '0 0 8px' }}>
            Zero name-change, segment-mismatch, repeat-offering, or missing-key conflicts detected among current IPO records.
          </p>
        )}

        {showStaticExclusions && sampleExclusions.length > 0 && (
          <div className="sb-admin-subpanel">
            <strong>Demonstration / Sample IPO Records Excluded from Migration ({sampleExclusions.length}):</strong>
            <div className="sb-admin-list" style={{ marginTop: '8px', maxHeight: '220px', overflowY: 'auto' }}>
              {sampleExclusions.map((s) => (
                <div className="sb-admin-list-row" key={s.recordId}>
                  <div>
                    <strong>{s.companyName}</strong> ({s.segment}) · ID: <code>{s.recordId}</code>
                    <div className="meta">{s.reason}</div>
                  </div>
                  <span className="pill sb-pill-muted">Sample Excluded</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card snap">
        <h3>Managed IPO Dossiers ({data.ipos.length})</h3>
        {data.ipos.length > 0 ? (
          <div className="sb-admin-card-list">
            {data.ipos.map((ipo) => {
              const deletionEligibility = classifyIpoDeletionEligibility(ipo);
              const isPublic = deletionEligibility.isPublic;
              const displayMigrationKey = ipo.migrationKey || buildStableIpoMigrationKey(ipo);
              const isBusyRow = busyRowId === ipo.id;
              const canRestore =
                ipo.isArchived ||
                ipo.verificationStatus === 'archived' ||
                ipo.verificationStatus === 'unpublished' ||
                ipo.verificationStatus === 'awaiting_verification' ||
                String(ipo.verificationStatus) === 'rejected' ||
                String(ipo.status) === 'Rejected' ||
                String(ipo.status) === 'Draft' ||
                (ipo.deletionStatus && ipo.deletionStatus !== 'none');

              return (
                <div className="sb-admin-item-card" key={ipo.id}>
                  <div className="sb-admin-item-top">
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span className="pill">{ipo.segment}</span>
                      <span className={`pill ${isPublic ? 'sb-pill-teal' : 'sb-pill-muted'}`}>
                        {isPublic ? 'Public' : 'Private'}
                      </span>
                      <span className="pill sb-pill-teal">{ipo.status}</span>
                      <span className={`pill ${ipo.verificationStatus === 'verified' ? 'sb-pill-teal' : 'sb-pill-amber'}`}>
                        {ipo.verificationStatus}
                      </span>
                      {deletionEligibility.requiresApprovalFirst && (
                        <span className="pill sb-pill-amber">Pending Approval</span>
                      )}
                      {ipo.deletionStatus === 'approved' && (
                        <span className="pill sb-pill-amber">Approved for Deletion</span>
                      )}
                    </div>
                    <span className="meta">
                      Open: {formatOfficialIpoField(ipo.openingDate)} · Close: {formatOfficialIpoField(ipo.closingDate)}
                    </span>
                  </div>
                  <h3>{ipo.companyName}</h3>
                  <div className="meta">
                    ID: <code>{ipo.id}</code> · Migration Key: <code>{displayMigrationKey}</code>
                  </div>
                  <div className="meta">
                    Size: {formatOfficialIpoField(ipo.issueSize)} · Price Band: {formatOfficialIpoField(ipo.priceBand)} · SEBI Filing: {formatOfficialIpoField(ipo.filingDate)}
                  </div>
                  {ipo.sourceUrl && (
                    <div className="meta" style={{ marginTop: '4px' }}>
                      Source:{' '}
                      <a href={ipo.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                        {ipo.sourceName || 'Official SEBI Link'} ↗
                      </a>
                    </div>
                  )}

                  {confirmDeleteId === ipo.id ? (
                    (() => {
                      const linkedRefs = inspectIpoLinkedReferences({
                        ipo,
                        articles: data.articles,
                        reviews: data.ipoReviews,
                      });
                      return (
                        <div className="sb-admin-subpanel" style={{ marginTop: '10px' }}>
                          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
                            Permanently delete non-public IPO &ldquo;{ipo.companyName}&rdquo; (<code>{ipo.id}</code>)?
                          </p>
                          <p className="meta" style={{ margin: '0 0 8px' }}>
                            {linkedRefs.summary}
                          </p>
                          {linkedRefs.hasBlockingPendingReviews && (
                            <p className="meta" style={{ margin: '0 0 8px', color: 'var(--down)' }}>
                              Resolve or reject {linkedRefs.pendingReviewIds.length} active Needs Review item(s) in Section 10 before deleting.
                            </p>
                          )}
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn sb-admin-touch-btn"
                              style={{ background: 'var(--down)', borderColor: 'var(--down)' }}
                              disabled={isBusyRow || linkedRefs.hasBlockingPendingReviews}
                              onClick={() => void handleControlledDelete(ipo)}
                            >
                              Yes, Delete IPO
                            </button>
                            <button
                              type="button"
                              className="btn ghost sb-admin-touch-btn"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="sb-admin-item-actions" style={{ marginTop: '10px' }}>
                      <button type="button" className="btn ghost" onClick={() => loadIpo(ipo)}>
                        Edit IPO
                      </button>
                      {!ipo.isArchived && ipo.verificationStatus !== 'archived' && (
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={isBusyRow}
                          onClick={() => void handleLifecycleAction(ipo, 'archive')}
                        >
                          Archive
                        </button>
                      )}
                      {ipo.verificationStatus !== 'unpublished' && (
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={isBusyRow}
                          onClick={() => void handleLifecycleAction(ipo, 'unpublish')}
                        >
                          Unpublish
                        </button>
                      )}
                      {canRestore && (
                        <button
                          type="button"
                          className="btn"
                          disabled={isBusyRow}
                          onClick={() => void handleLifecycleAction(ipo, 'restore')}
                        >
                          Restore
                        </button>
                      )}
                      {deletionEligibility.canRequestDeletion && (
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ color: 'var(--down)' }}
                          disabled={isBusyRow}
                          onClick={() => void handleLifecycleAction(ipo, 'request_delete')}
                        >
                          Mark Pending Deletion
                        </button>
                      )}
                      {deletionEligibility.canApproveDeletion && permissions.canApprovePermanentDeletion && (
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ color: 'var(--down)' }}
                          disabled={isBusyRow}
                          onClick={() => void handleLifecycleAction(ipo, 'approve_delete')}
                        >
                          Approve Deletion
                        </button>
                      )}
                      {permissions.canExecutePermanentDeletion && (
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ color: 'var(--down)' }}
                          disabled={isBusyRow || !deletionEligibility.canDeletePermanently}
                          title={deletionEligibility.reason}
                          onClick={() => setConfirmDeleteId(ipo.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="meta" style={{ margin: 0 }}>
            No custom Firestore IPO records yet. Click <strong>Check Official SEBI Source</strong> above or add one manually.
          </p>
        )}
      </section>
    </div>
  );
}

