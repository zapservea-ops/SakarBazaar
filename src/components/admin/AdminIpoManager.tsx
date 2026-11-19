import { useMemo, useRef, useState } from 'react';
import { IPO_ALL_RECORDS } from '../../data/sampleData';
import { SEBI_IPO_FILINGS } from '../../data/sebiIpoData';
import {
  deleteIpoRecordSafely,
  runOfficialSebiSourceCheckAndQueue,
  saveIpoSourceReview,
  saveManagedIpoRecord,
  updateIpoLifecycleStatus,
  type IpoLifecycleAction,
  type SebiCheckQueueResult,
} from '../../lib/firebase';
import type {
  IpoManagementCategory,
  IpoManagementSortField,
  IpoRowActionId,
  IpoSegment,
  IpoSourceDiffItem,
  ManagedIpoRecord,
  UnifiedManagedIpoItem,
} from '../../types/sakarbazaar';
import {
  buildHistoricalIpoConflictReport,
  buildIpoBackfillDryRunReport,
  buildProductionIpoSchemaInventory,
  buildStableIpoMigrationKey,
  buildUnifiedIpoManagementList,
  calculateIpoStatusFromDates,
  filterAndSortManagedIpos,
  formatOfficialIpoField,
  getAvailableIpoRowActions,
  inspectIpoLinkedReferences,
  IPO_MANAGEMENT_CATEGORIES,
  isOfficialSebiUrl,
  summarizeIpoManagementCategories,
} from '../../utils/ipoLifecycle';
import { extractReadableErrorMessage, extractTimestampMillis, sanitizeArticleSlug } from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

interface AdminIpoManagerProps extends AdminSectionBaseProps {
  onPublicContentChanged: () => Promise<void>;
}

const OFFICIAL_SEBI_URL =
  'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11';

const SOURCE_ORIGIN_LABELS: Record<UnifiedManagedIpoItem['sourceOrigin'], string> = {
  firestore: 'Firestore',
  static_catalog: 'Editorial Catalog',
  sebi_filings: 'SEBI Filings',
  deleted_history: 'Audit History',
};

function getStatusPillClass(category: IpoManagementCategory): string {
  switch (category) {
    case 'Open':
    case 'Upcoming':
    case 'Listed':
      return 'sb-pill-teal';
    case 'Closed':
    case 'Archived':
    case 'Draft':
      return 'sb-pill-muted';
    case 'Awaiting Verification':
    case 'Pending Deletion':
      return 'sb-pill-amber';
    case 'Rejected':
    case 'Deleted':
      return 'sb-pill-danger';
  }
}

export function AdminIpoManager({
  data,
  permissions,
  onRefresh,
  onNavigate,
  onPublicContentChanged,
  onNotify,
}: AdminIpoManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOrigin, setEditingOrigin] = useState<UnifiedManagedIpoItem['sourceOrigin'] | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editingMigrationKey, setEditingMigrationKey] = useState<string | undefined>(undefined);
  const [editingOriginalVerification, setEditingOriginalVerification] = useState<
    ManagedIpoRecord['verificationStatus'] | undefined
  >(undefined);
  const [editingPrevVerification, setEditingPrevVerification] = useState<
    ManagedIpoRecord['previousVerificationStatus'] | undefined
  >(undefined);
  const [editingLastVerifiedAt, setEditingLastVerifiedAt] = useState<string | undefined>(undefined);
  const [editingIsArchived, setEditingIsArchived] = useState<boolean>(false);
  const [editingDeletionStatus, setEditingDeletionStatus] = useState<ManagedIpoRecord['deletionStatus']>('none');
  const [existingDocs, setExistingDocs] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [segment, setSegment] = useState<IpoSegment>('Mainboard');
  const [verificationStatus, setVerificationStatus] = useState<'awaiting_verification' | 'verified'>('awaiting_verification');
  const [manualStage, setManualStage] = useState<'Draft' | 'Awaiting Verification'>('Draft');
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
  const [queuingReview, setQueuingReview] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Records Management UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'All' | IpoSegment>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Needs Review' | IpoManagementCategory>('All');
  const [verificationFilter, setVerificationFilter] = useState<'All' | ManagedIpoRecord['verificationStatus']>('All');
  const [yearFilter, setYearFilter] = useState<'All' | number>('All');
  const [sortField, setSortField] = useState<IpoManagementSortField>('updated_desc');

  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{
    item: UnifiedManagedIpoItem;
    mode: 'delete' | 'reject';
  } | null>(null);
  const [historyModalItem, setHistoryModalItem] = useState<UnifiedManagedIpoItem | null>(null);
  const [showStaticExclusions, setShowStaticExclusions] = useState(false);
  const [showUnifiedPreview, setShowUnifiedPreview] = useState(false);
  const [checkingSebi, setCheckingSebi] = useState(false);
  const [sebiReport, setSebiReport] = useState<SebiCheckQueueResult | null>(null);

  const busyRef = useRef(false);
  const checkingSebiRef = useRef(false);
  const pendingIpoIdRef = useRef<string | null>(null);
  const editingUpdatedAtMsRef = useRef<number | null>(null);
  const formSectionRef = useRef<HTMLElement | null>(null);
  const managementSectionRef = useRef<HTMLElement | null>(null);

  // Unified IPO catalog aggregating Firestore + built-in Editorial Catalog + built-in SEBI Filings + Retained Deleted History
  const unifiedRecords = useMemo(
    () =>
      buildUnifiedIpoManagementList({
        firestoreIpos: data.ipos,
        staticCatalogIpos: IPO_ALL_RECORDS,
        sebiFilings: SEBI_IPO_FILINGS,
        auditLogs: data.auditLogs,
        reviews: data.ipoReviews,
      }),
    [data.ipos, data.auditLogs, data.ipoReviews],
  );

  const categoryCounts = useMemo(
    () => summarizeIpoManagementCategories(unifiedRecords),
    [unifiedRecords],
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const item of unifiedRecords) {
      if (item.year) years.add(item.year);
    }
    return [...years].sort((a, b) => b - a);
  }, [unifiedRecords]);

  const filteredRecords = useMemo(
    () =>
      filterAndSortManagedIpos(unifiedRecords, {
        search: searchQuery,
        segment: segmentFilter,
        category: categoryFilter,
        verificationStatus: verificationFilter,
        year: yearFilter,
        sortField,
      }),
    [unifiedRecords, searchQuery, segmentFilter, categoryFilter, verificationFilter, yearFilter, sortField],
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    segmentFilter !== 'All' ||
    categoryFilter !== 'All' ||
    verificationFilter !== 'All' ||
    yearFilter !== 'All' ||
    sortField !== 'updated_desc';

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
  const schemaInventory = useMemo(
    () => buildProductionIpoSchemaInventory(data.ipos),
    [data.ipos],
  );
  const backfillDryRun = useMemo(
    () => buildIpoBackfillDryRunReport(data.ipos),
    [data.ipos],
  );

  const editingHasVerifiedProvenance = Boolean(
    editingId && editingOriginalVerification === 'verified',
  );

  const previewStatus = calculateIpoStatusFromDates({
    openingDate,
    closingDate,
    listingDate,
    verificationStatus,
    currentStatus: verificationStatus === 'verified' ? undefined : manualStage,
    isArchived: editingIsArchived,
    deletionStatus: editingDeletionStatus,
  });

  function resetForm() {
    pendingIpoIdRef.current = null;
    editingUpdatedAtMsRef.current = null;
    setEditingId(null);
    setEditingOrigin(null);
    setEditingSlug(null);
    setEditingMigrationKey(undefined);
    setEditingOriginalVerification(undefined);
    setEditingPrevVerification(undefined);
    setEditingLastVerifiedAt(undefined);
    setEditingIsArchived(false);
    setEditingDeletionStatus('none');
    setExistingDocs([]);
    setCompanyName('');
    setSegment('Mainboard');
    setVerificationStatus('awaiting_verification');
    setManualStage('Draft');
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
    setLocalError(null);
  }

  function loadIpo(item: ManagedIpoRecord, origin: UnifiedManagedIpoItem['sourceOrigin'] = 'firestore') {
    pendingIpoIdRef.current = item.id;
    editingUpdatedAtMsRef.current =
      origin === 'firestore' ? extractTimestampMillis(item.updatedAt) : null;
    setEditingId(item.id);
    setEditingOrigin(origin);
    setEditingSlug(item.slug);
    setEditingMigrationKey(item.migrationKey);
    setEditingOriginalVerification(item.verificationStatus);
    setEditingPrevVerification(item.previousVerificationStatus);
    setEditingLastVerifiedAt(item.lastVerifiedAt);
    setEditingIsArchived(Boolean(item.isArchived));
    setEditingDeletionStatus(item.deletionStatus ?? 'none');
    setExistingDocs(item.officialDocuments ?? []);
    setCompanyName(item.companyName);
    setSegment(item.segment);
    if (item.verificationStatus === 'verified') {
      setVerificationStatus('verified');
      setManualStage('Awaiting Verification');
    } else {
      setVerificationStatus('awaiting_verification');
      setManualStage(item.status === 'Draft' ? 'Draft' : 'Awaiting Verification');
    }
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
    setLocalError(null);
    if (typeof formSectionRef.current?.scrollIntoView === 'function') {
      formSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function persistFormDossier(override?: {
    verificationStatus: 'awaiting_verification' | 'verified';
    currentStatus: ManagedIpoRecord['status'] | undefined;
  }): Promise<{ id: string; slug: string; migrationKey: string; savedStatus: ManagedIpoRecord['status'] }> {
    const slug = editingSlug || sanitizeArticleSlug(companyName, 'ipo');
    if (!editingId && !pendingIpoIdRef.current) {
      pendingIpoIdRef.current = `ipo_${slug.slice(0, 80)}_${Date.now().toString(36)}`;
    }
    const id = editingId || pendingIpoIdRef.current!;
    const existsInFirestore = Boolean(editingId && data.ipos.some((rec) => rec.id === editingId));
    const mergedDocs = [
      ...new Set([
        ...existingDocs,
        ...(sourceUrl.trim() ? [sourceUrl.trim()] : []),
      ].filter(Boolean)),
    ].slice(0, 6);

    const effVerification = override ? override.verificationStatus : verificationStatus;
    const effCurrentStatus = override
      ? override.currentStatus
      : effVerification === 'verified'
        ? undefined
        : manualStage;
    const computedStatus = calculateIpoStatusFromDates({
      openingDate,
      closingDate,
      listingDate,
      verificationStatus: effVerification,
      currentStatus: effCurrentStatus,
      isArchived: editingIsArchived,
      deletionStatus: editingDeletionStatus,
    });
    const migrationKey =
      editingMigrationKey ||
      buildStableIpoMigrationKey({
        id,
        companyName: companyName.trim(),
        segment,
        filingDate,
        openingDate,
        listingDate,
        offerType,
        sourceUrl,
        officialDocuments: mergedDocs,
      });

    const isBuiltinVerifiedRecord = Boolean(
      !existsInFirestore &&
        editingId &&
        (editingOrigin === 'static_catalog' || editingOrigin === 'sebi_filings') &&
        editingOriginalVerification === 'verified' &&
        (isOfficialSebiUrl(sourceUrl) || mergedDocs.some((u) => isOfficialSebiUrl(u))),
    );

    await saveManagedIpoRecord(
      {
        id,
        migrationKey,
        companyName: companyName.trim(),
        slug,
        segment,
        status: computedStatus,
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
        verificationStatus: effVerification,
        previousVerificationStatus: editingPrevVerification,
        lastVerifiedAt: editingLastVerifiedAt,
        isArchived: editingIsArchived,
        deletionStatus: editingDeletionStatus,
      },
      !existsInFirestore,
      existsInFirestore ? editingUpdatedAtMsRef.current : null,
      {
        allowBuiltinVerifiedEdit: isBuiltinVerifiedRecord,
        onRecordCommitted: (safeId) => {
          setEditingId(safeId);
          setEditingOrigin('firestore');
          setEditingSlug(slug);
          setEditingMigrationKey(migrationKey);
          pendingIpoIdRef.current = safeId;
          editingUpdatedAtMsRef.current = Date.now() + 2_000;
        },
      },
    );

    return { id, slug, migrationKey, savedStatus: computedStatus };
  }

  async function handleSave() {
    if (busyRef.current) return;
    setLocalError(null);
    if (companyName.trim().length < 2) {
      const msg = 'Company name is required (minimum 2 characters). Entered fields are preserved.';
      setLocalError(msg);
      onNotify({ tone: 'err', text: msg });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const saved = await persistFormDossier();
      await onRefresh({ scope: 'none' });
      await onPublicContentChanged();
      const savedCompany = companyName.trim();
      resetForm();
      onNotify({
        tone: 'ok',
        text: `Saved IPO record "${savedCompany}" (${saved.savedStatus}).`,
      });
    } catch (err) {
      const msg = extractReadableErrorMessage(
        err,
        'Unable to save IPO record. Entered form fields have been preserved.',
      );
      setLocalError(msg);
      onNotify({ tone: 'err', text: msg });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleQueueManualSebiReview() {
    if (busyRef.current) return;
    setLocalError(null);
    if (companyName.trim().length < 2) {
      const msg = 'Enter the company name before queuing for SEBI verification.';
      setLocalError(msg);
      onNotify({ tone: 'err', text: msg });
      return;
    }
    if (!isOfficialSebiUrl(sourceUrl)) {
      const msg =
        'Provide an official https://www.sebi.gov.in/... filing URL in Official Filing URL before queuing to Section 10 (IPO Source Review).';
      setLocalError(msg);
      onNotify({ tone: 'err', text: msg });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setQueuingReview(true);
    try {
      const saved = await persistFormDossier({
        verificationStatus: 'awaiting_verification',
        currentStatus: 'Awaiting Verification',
      });
      const diffs: IpoSourceDiffItem[] = [
        {
          field: 'officialDocument',
          label: 'Official SEBI Filing URL',
          previousValue: existingDocs[0] || 'Not announced',
          detectedValue: sourceUrl.trim(),
        },
      ];
      if (filingDate.trim()) {
        diffs.push({
          field: 'filingDate',
          label: 'SEBI Filing Date',
          previousValue: 'Not announced',
          detectedValue: filingDate.trim(),
        });
      }
      if (openingDate.trim()) {
        diffs.push({
          field: 'openingDate',
          label: 'Opening Date',
          previousValue: 'Not announced',
          detectedValue: openingDate.trim(),
        });
      }
      if (closingDate.trim()) {
        diffs.push({
          field: 'closingDate',
          label: 'Closing Date',
          previousValue: 'Not announced',
          detectedValue: closingDate.trim(),
        });
      }
      if (listingDate.trim()) {
        diffs.push({
          field: 'listingDate',
          label: 'Listing Date',
          previousValue: 'Not announced',
          detectedValue: listingDate.trim(),
        });
      }
      if (issueSize.trim()) {
        diffs.push({
          field: 'issueSize',
          label: 'Issue Size',
          previousValue: 'Not announced',
          detectedValue: issueSize.trim(),
        });
      }
      if (priceBand.trim()) {
        diffs.push({
          field: 'priceBand',
          label: 'Price Band',
          previousValue: 'Not announced',
          detectedValue: priceBand.trim(),
        });
      }
      const reviewId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await saveIpoSourceReview(
        {
          id: reviewId,
          companyName: companyName.trim(),
          targetIpoId: saved.id,
          migrationKey: saved.migrationKey,
          matchType: 'exact_id',
          segment,
          reviewStatus: 'Needs Review',
          sourceName: sourceName.trim() || 'SEBI Official Public Issues',
          sourceUrl: sourceUrl.trim(),
          checkedAt: new Date().toISOString(),
          diffs,
          detectedSummary:
            summary.trim() ||
            'Manual draft submitted with official SEBI reference link for Section 10 approval.',
        },
        true,
      );
      await onRefresh({ scope: 'none' });
      const savedCompany = companyName.trim();
      resetForm();
      onNotify({
        tone: 'ok',
        text: `Saved private dossier for "${savedCompany}" and queued its official SEBI link in 10. IPO Source Review for public approval.`,
      });
    } catch (err) {
      const msg = extractReadableErrorMessage(
        err,
        'Unable to queue official SEBI review. Entered form fields have been preserved.',
      );
      setLocalError(msg);
      onNotify({ tone: 'err', text: msg });
    } finally {
      busyRef.current = false;
      setBusy(false);
      setQueuingReview(false);
    }
  }

  async function handleLifecycleAction(
    item: UnifiedManagedIpoItem,
    action: IpoLifecycleAction,
  ) {
    if (busyRowId) return;
    setBusyRowId(item.id);
    setPendingConfirmAction(null);
    setLocalError(null);
    try {
      await updateIpoLifecycleStatus(item.record, action, {
        allowInitializeFromBuiltin: !item.isPersistedInFirestore,
      });
      await onRefresh({ scope: 'none' });
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Updated IPO "${item.companyName}" (${action.replace(/_/g, ' ')}).`,
      });
    } catch (err) {
      const msg = extractReadableErrorMessage(
        err,
        `Unable to apply ${action.replace(/_/g, ' ')} to IPO dossier.`,
      );
      setLocalError(msg);
      onNotify({ tone: 'err', text: msg });
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleControlledDelete(item: UnifiedManagedIpoItem) {
    if (busyRowId) return;
    setBusyRowId(item.id);
    setPendingConfirmAction(null);
    setLocalError(null);
    try {
      await deleteIpoRecordSafely(item.record);
      if (editingId === item.id) resetForm();
      await onRefresh({ scope: 'none' });
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Permanent deletion complete for non-public IPO dossier "${item.companyName}". Retained audit history recorded.`,
      });
    } catch (err) {
      const msg = extractReadableErrorMessage(err, 'Unable to delete IPO dossier.');
      setLocalError(msg);
      onNotify({ tone: 'err', text: msg });
    } finally {
      setBusyRowId(null);
    }
  }

  function handleRowActionClick(item: UnifiedManagedIpoItem, actionId: IpoRowActionId) {
    switch (actionId) {
      case 'edit':
        loadIpo(item.record, item.sourceOrigin);
        return;
      case 'view_history':
        setHistoryModalItem(item);
        return;
      case 'reject':
        setPendingConfirmAction({ item, mode: 'reject' });
        return;
      case 'execute_delete':
        setPendingConfirmAction({ item, mode: 'delete' });
        return;
      case 'submit_review':
        void handleLifecycleAction(item, 'submit_review');
        return;
      case 'return_review':
        void handleLifecycleAction(item, 'return_review');
        return;
      case 'verify':
        void handleLifecycleAction(item, 'verify');
        return;
      case 'unpublish':
        void handleLifecycleAction(item, 'unpublish');
        return;
      case 'archive':
        void handleLifecycleAction(item, 'archive');
        return;
      case 'restore':
        void handleLifecycleAction(item, 'restore');
        return;
      case 'cancel_delete':
        void handleLifecycleAction(item, 'cancel_delete');
        return;
      case 'approve_delete':
        void handleLifecycleAction(item, 'approve_delete');
        return;
      case 'request_delete':
        void handleLifecycleAction(item, 'request_delete');
        return;
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
      await onRefresh({ scope: 'none' });
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
      {/* 1. Complete Unified IPO Records Management Section */}
      <section ref={managementSectionRef} className="card snap" aria-label="IPO Records Management">
        <div className="sec-h">
          <div>
            <h2>IPO Calendar Manager — All Records ({unifiedRecords.length})</h2>
            <p className="sb-sec-sub">
              Unified management across Firestore dossiers ({data.ipos.length}), Editorial IPO catalog, official SEBI filings, and retained deletion history.
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
            <button
              type="button"
              className="btn ghost sb-admin-touch-btn"
              onClick={() => {
                resetForm();
                formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              + Manual IPO Entry
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
          </div>
        </div>

        <div className="sb-note-box" style={{ marginBottom: '12px' }}>
          <strong>SEBI-Only Official Verification:</strong> Automated checks retrieve ONLY{' '}
          <a href={OFFICIAL_SEBI_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
            sebi.gov.in Public Issues ↗
          </a>
          . Active public IPOs cannot be permanently deleted until Unpublished, Archived, or moved to Pending Deletion.
        </div>

        {sebiReport && sebiReport.portals.length > 0 && (
          <div className="sb-admin-subpanel" style={{ marginBottom: '12px' }}>
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

        {localError && (
          <div className="sb-admin-alert err" role="alert" style={{ marginBottom: '12px' }}>
            {localError}
          </div>
        )}

        {/* 10-Category Quick Summary Filter Strip */}
        <div className="sb-ipo-status-strip" role="tablist" aria-label="IPO status categories">
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === 'All'}
            className={`sb-ipo-cat-btn ${categoryFilter === 'All' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('All')}
          >
            <span>All</span>
            <b>{categoryCounts.All}</b>
          </button>
          {IPO_MANAGEMENT_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={categoryFilter === cat}
              className={`sb-ipo-cat-btn ${categoryFilter === cat ? 'active' : ''}`}
              onClick={() => setCategoryFilter(cat)}
            >
              <span>{cat}</span>
              <b>{categoryCounts[cat]}</b>
            </button>
          ))}
          {categoryCounts['Needs Review'] > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={categoryFilter === 'Needs Review'}
              className={`sb-ipo-cat-btn warn ${categoryFilter === 'Needs Review' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('Needs Review')}
            >
              <span>Needs Review</span>
              <b>{categoryCounts['Needs Review']}</b>
            </button>
          )}
        </div>

        {/* Search, Filter & Date Sorting Toolbar */}
        <div className="sb-ipo-filter-grid" role="search" aria-label="Filter IPO records">
          <label className="sb-form-field" style={{ margin: 0 }}>
            <span>Company Search</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search company, ID, or source…"
            />
          </label>
          <label className="sb-form-field" style={{ margin: 0 }}>
            <span>Segment</span>
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value as 'All' | IpoSegment)}
            >
              <option value="All">All Segments</option>
              <option value="Mainboard">Mainboard</option>
              <option value="SME">SME</option>
            </select>
          </label>
          <label className="sb-form-field" style={{ margin: 0 }}>
            <span>Status</span>
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as 'All' | 'Needs Review' | IpoManagementCategory)
              }
            >
              <option value="All">All Statuses ({categoryCounts.All})</option>
              <option value="Needs Review">Needs Review ({categoryCounts['Needs Review']})</option>
              {IPO_MANAGEMENT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat} ({categoryCounts[cat]})
                </option>
              ))}
            </select>
          </label>
          <label className="sb-form-field" style={{ margin: 0 }}>
            <span>Verification</span>
            <select
              value={verificationFilter}
              onChange={(e) =>
                setVerificationFilter(e.target.value as 'All' | ManagedIpoRecord['verificationStatus'])
              }
            >
              <option value="All">All Verification States</option>
              <option value="verified">verified</option>
              <option value="awaiting_verification">awaiting_verification</option>
              <option value="rejected">rejected</option>
              <option value="archived">archived</option>
              <option value="unpublished">unpublished</option>
              <option value="proposed">proposed</option>
            </select>
          </label>
          <label className="sb-form-field" style={{ margin: 0 }}>
            <span>Year</span>
            <select
              value={yearFilter === 'All' ? 'All' : String(yearFilter)}
              onChange={(e) =>
                setYearFilter(e.target.value === 'All' ? 'All' : Number(e.target.value))
              }
            >
              <option value="All">All Years</option>
              {availableYears.map((yr) => (
                <option key={yr} value={String(yr)}>
                  {yr}
                </option>
              ))}
            </select>
          </label>
          <label className="sb-form-field" style={{ margin: 0 }}>
            <span>Sort By</span>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as IpoManagementSortField)}
            >
              <option value="updated_desc">Last Updated (Newest)</option>
              <option value="opening_desc">Opening Date (Newest)</option>
              <option value="opening_asc">Opening Date (Earliest)</option>
              <option value="closing_desc">Closing Date (Newest)</option>
              <option value="listing_desc">Listing Date (Newest)</option>
              <option value="company_asc">Company Name (A–Z)</option>
            </select>
          </label>
        </div>

        <div className="sb-admin-toolbar" style={{ marginBottom: '10px' }}>
          <span className="meta">
            Showing <strong>{filteredRecords.length}</strong> of <strong>{unifiedRecords.length}</strong> IPO record(s)
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setSearchQuery('');
                setSegmentFilter('All');
                setCategoryFilter('All');
                setVerificationFilter('All');
                setYearFilter('All');
                setSortField('updated_desc');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Desktop IPO Management Table */}
        <div className="tbl sb-desktop-table">
          <table className="sb-ipo-mgmt-table">
            <thead>
              <tr>
                <th>Company name</th>
                <th>Segment</th>
                <th>Current status</th>
                <th>Verification status</th>
                <th>Opening date</th>
                <th>Closing date</th>
                <th>Listing date</th>
                <th>Official source</th>
                <th>Last updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length > 0 ? (
                filteredRecords.map((item) => {
                  const rowActions = getAvailableIpoRowActions(item, permissions);
                  const isBusyRow = busyRowId === item.id;
                  return (
                    <tr key={`${item.sourceOrigin}-${item.id}`}>
                      <td>
                        <strong style={{ display: 'block' }}>{item.companyName}</strong>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                          <span className="pill sb-pill-muted">{SOURCE_ORIGIN_LABELS[item.sourceOrigin]}</span>
                          {item.needsReview && (
                            <span
                              className="pill sb-pill-amber"
                              title={item.conflictNotes.join(' ') || 'Requires manual review before merge/publish.'}
                            >
                              Needs Review
                            </span>
                          )}
                          {item.rawStatus === 'Unpublished' && (
                            <span className="pill sb-pill-muted">Unpublished</span>
                          )}
                          {item.category === 'Pending Deletion' && (
                            <span className="pill sb-pill-amber">
                              {item.deletionStatus === 'approved' ? 'Approved' : 'Pending Approval'}
                            </span>
                          )}
                        </div>
                        <small className="meta" style={{ fontSize: '11px' }}>
                          <code>{item.id}</code>
                        </small>
                      </td>
                      <td>
                        <span className="pill">{item.segment}</span>
                      </td>
                      <td>
                        <span className={`pill ${getStatusPillClass(item.category)}`}>{item.category}</span>
                      </td>
                      <td>
                        <span className={`pill ${item.verificationStatus === 'verified' ? 'sb-pill-teal' : 'sb-pill-amber'}`}>
                          {item.verificationStatus}
                        </span>
                      </td>
                      <td className="num">{formatOfficialIpoField(item.openingDate)}</td>
                      <td className="num">{formatOfficialIpoField(item.closingDate)}</td>
                      <td className="num">{formatOfficialIpoField(item.listingDate)}</td>
                      <td>
                        {item.officialSourceUrl ? (
                          <a
                            href={item.officialSourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--teal)', fontSize: '12.5px' }}
                          >
                            {item.officialSourceName} ↗
                          </a>
                        ) : (
                          <span className="meta" style={{ fontSize: '12.5px' }}>
                            {item.officialSourceName}
                          </span>
                        )}
                      </td>
                      <td className="num">{item.lastUpdatedIso || 'Not recorded'}</td>
                      <td>
                        <div className="sb-ipo-row-actions">
                          {rowActions.map((act) => (
                            <button
                              key={act.id}
                              type="button"
                              className={`btn ${act.tone === 'primary' ? '' : 'ghost'}`}
                              style={{
                                padding: '5px 10px',
                                fontSize: '12px',
                                ...(act.tone === 'danger' ? { color: 'var(--down)' } : {}),
                              }}
                              disabled={isBusyRow || act.disabled}
                              title={act.title}
                              aria-label={`${act.label} ${item.companyName}`}
                              onClick={() => handleRowActionClick(item, act.id)}
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
                    No IPO records match your current search or filter selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile / Narrow Viewport IPO Records Cards */}
        <div className="sb-ipo-mobile-cards" style={{ marginTop: '10px' }}>
          {filteredRecords.length > 0 ? (
            filteredRecords.map((item) => {
              const rowActions = getAvailableIpoRowActions(item, permissions);
              const isBusyRow = busyRowId === item.id;
              return (
                <article className="sb-admin-item-card" key={`m-${item.sourceOrigin}-${item.id}`}>
                  <div className="sb-admin-item-top">
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span className="pill">{item.segment}</span>
                      <span className={`pill ${getStatusPillClass(item.category)}`}>{item.category}</span>
                      <span className={`pill ${item.verificationStatus === 'verified' ? 'sb-pill-teal' : 'sb-pill-amber'}`}>
                        {item.verificationStatus}
                      </span>
                      <span className="pill sb-pill-muted">{SOURCE_ORIGIN_LABELS[item.sourceOrigin]}</span>
                      {item.needsReview && <span className="pill sb-pill-amber">Needs Review</span>}
                    </div>
                  </div>
                  <h3>{item.companyName}</h3>
                  <div className="meta" style={{ marginBottom: '6px' }}>
                    ID: <code>{item.id}</code>
                  </div>
                  <dl className="sb-ipo-dl">
                    <div>
                      <dt>Opening</dt>
                      <dd>{formatOfficialIpoField(item.openingDate)}</dd>
                    </div>
                    <div>
                      <dt>Closing</dt>
                      <dd>{formatOfficialIpoField(item.closingDate)}</dd>
                    </div>
                    <div>
                      <dt>Listing</dt>
                      <dd>{formatOfficialIpoField(item.listingDate)}</dd>
                    </div>
                    <div>
                      <dt>Last Updated</dt>
                      <dd>{item.lastUpdatedIso || 'Not recorded'}</dd>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <dt>Official Source</dt>
                      <dd>
                        {item.officialSourceUrl ? (
                          <a href={item.officialSourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                            {item.officialSourceName} ↗
                          </a>
                        ) : (
                          item.officialSourceName
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="sb-admin-item-actions" style={{ marginTop: '10px' }}>
                    {rowActions.map((act) => (
                      <button
                        key={act.id}
                        type="button"
                        className={`btn ${act.tone === 'primary' ? '' : 'ghost'} sb-admin-touch-btn`}
                        style={act.tone === 'danger' ? { color: 'var(--down)' } : undefined}
                        disabled={isBusyRow || act.disabled}
                        title={act.title}
                        onClick={() => handleRowActionClick(item, act.id)}
                      >
                        {act.label}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="meta" style={{ margin: 0 }}>
              No IPO records match your current search or filter selection.
            </p>
          )}
        </div>
      </section>

      {/* 2. Retained Manual IPO Dossier Entry & Edit Form */}
      <section ref={formSectionRef} id="ipo-dossier-form" className="card snap" aria-label="Create or Edit IPO Dossier">
        <div className="sec-h">
          <div>
            <h3>{editingId ? `Edit IPO Dossier: ${companyName || editingId}` : 'Create Manual IPO Dossier'}</h3>
            <p className="sb-sec-sub">
              {editingId && editingOrigin !== 'firestore'
                ? `Editing built-in ${SOURCE_ORIGIN_LABELS[editingOrigin || 'static_catalog']} record. Saving writes to Firestore preserving ID "${editingId}" and slug "${editingSlug || ''}".`
                : 'Status auto-calculates in IST strictly from verified opening/closing/listing dates (never from SEBI filing dates). Manual creations save privately as Draft or Awaiting Verification.'}
            </p>
          </div>
          {editingId && (
            <button type="button" className="btn ghost sb-admin-touch-btn" onClick={resetForm}>
              + Cancel Edit / New Entry
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
            <span>Workflow Stage &amp; Visibility</span>
            {editingHasVerifiedProvenance ? (
              <select
                value={verificationStatus === 'verified' ? 'verified' : manualStage}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'verified') {
                    setVerificationStatus('verified');
                  } else {
                    setVerificationStatus('awaiting_verification');
                    setManualStage(v === 'Draft' ? 'Draft' : 'Awaiting Verification');
                  }
                }}
              >
                <option value="verified">Verified Official SEBI Record (Visible on /ipo &amp; /calendar)</option>
                <option value="Awaiting Verification">Awaiting Verification (Remove from Public)</option>
                <option value="Draft">Draft (Private Working Entry)</option>
              </select>
            ) : (
              <select
                value={manualStage}
                onChange={(e) => {
                  const stage = e.target.value === 'Awaiting Verification' ? 'Awaiting Verification' : 'Draft';
                  setVerificationStatus('awaiting_verification');
                  setManualStage(stage);
                }}
              >
                <option value="Draft">Draft (Private Working Entry — Default)</option>
                <option value="Awaiting Verification">Awaiting Verification (Private Review Queue)</option>
              </select>
            )}
            <span className="meta" style={{ fontSize: '12px' }}>
              {editingHasVerifiedProvenance
                ? 'Verified SEBI provenance is preserved while editing factual fields.'
                : 'Manual entries always save privately. Public listing requires an official sebi.gov.in link approved via Section 10.'}
            </span>
          </label>
          <div className="sb-form-field">
            <span>Calculated Dossier Status</span>
            <div className="sb-note-box" style={{ margin: 0, padding: '8px 12px' }}>
              <strong>{previewStatus}</strong> ({verificationStatus === 'verified' ? 'Public Eligible' : 'Private'})
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

        <div className="sb-admin-action-bar">
          <button type="button" className="btn sb-admin-touch-btn" disabled={busy} onClick={() => void handleSave()}>
            {busy && !queuingReview
              ? 'Saving…'
              : editingId
                ? editingHasVerifiedProvenance && verificationStatus === 'verified'
                  ? 'Update Verified IPO Record'
                  : `Update Private ${manualStage}`
                : `Save ${manualStage} (Private)`}
          </button>
          {!editingHasVerifiedProvenance && (
            <button
              type="button"
              className="btn ghost sb-admin-touch-btn"
              disabled={busy}
              onClick={() => void handleQueueManualSebiReview()}
            >
              {queuingReview ? 'Queuing SEBI Review…' : 'Queue Official SEBI Link for Review (10)'}
            </button>
          )}
        </div>
      </section>

      {/* 3. Secondary Schema Inventory & Conflict Diagnostics */}
      <details className="card snap">
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '15px' }}>
          Schema Inventory, Conflict Audit &amp; Built-in Source Diagnostics ({nonSampleConflicts.length} conflict(s))
        </summary>
        <div style={{ marginTop: '14px' }}>
          <div className="sb-admin-kpi-grid" style={{ marginBottom: '12px' }}>
            <div className="sb-admin-kpi">
              <b>{conflictReport.totalFirestoreIpos}</b>
              <span>Firestore IPOs</span>
            </div>
            <div className="sb-admin-kpi">
              <b>{conflictReport.genuineCatalogCount ?? 0}</b>
              <span>Built-in Catalog IPOs</span>
            </div>
            <div className="sb-admin-kpi">
              <b>{SEBI_IPO_FILINGS.length}</b>
              <span>Built-in SEBI Filings</span>
            </div>
            <div className="sb-admin-kpi">
              <b>{nonSampleConflicts.filter((c) => c.severity === 'blocking').length}</b>
              <span>Blocking Conflicts</span>
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
                <b>{schemaInventory.verifiedPublic4FilterCount} / {schemaInventory.verifiedLegacy2FilterCount}</b>
                <span>4-Filter vs 2-Filter Live</span>
              </div>
            </div>
            <div className="meta" style={{ lineHeight: 1.55 }}>
              {backfillDryRun.recordsRequiringBackfill > 0
                ? `Dry-Run Backfill Preview: ${backfillDryRun.recordsRequiringBackfill} record(s) need defaults. `
                : 'All loaded Firestore /ipos records carry explicit isArchived & deletionStatus fields. '}
              {backfillDryRun.strategySummary}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <button type="button" className="btn ghost" onClick={() => setShowUnifiedPreview((v) => !v)}>
              {showUnifiedPreview ? `Hide Raw Catalog Preview (${unifiedPreview.length})` : `Show Raw Catalog Preview (${unifiedPreview.length})`}
            </button>
            <button type="button" className="btn ghost" onClick={() => setShowStaticExclusions((v) => !v)}>
              {showStaticExclusions ? `Hide Sample Exclusions (${sampleExclusions.length})` : `Inspect Sample Exclusions (${sampleExclusions.length})`}
            </button>
          </div>

          {recordClassifications.length > 0 && (
            <div className="sb-admin-subpanel" style={{ marginBottom: '12px' }}>
              <strong>Built-in IPO_ALL_RECORDS Classification Report ({recordClassifications.length}):</strong>
              <div className="sb-admin-list" style={{ marginTop: '8px' }}>
                {recordClassifications.map((rec) => (
                  <div className="sb-admin-list-row" key={rec.recordId}>
                    <div>
                      <strong>{rec.companyName} (<code>{rec.recordId}</code>)</strong>
                      <div className="meta">{rec.evidence}</div>
                    </div>
                    <span className="pill sb-pill-teal">{rec.classification}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showUnifiedPreview && (
            <div className="sb-admin-subpanel" style={{ marginBottom: '12px' }}>
              <strong>Unified Catalog Preview ({unifiedPreview.length}):</strong>
              <div className="sb-admin-list" style={{ marginTop: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                {unifiedPreview.map((entry) => (
                  <div className="sb-admin-list-row" key={`${entry.origin}-${entry.id}`}>
                    <div>
                      <strong>{entry.companyName} (<code>{entry.id}</code>)</strong>
                      <div className="meta">{entry.notes}</div>
                    </div>
                    <span className="pill">{entry.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showStaticExclusions && sampleExclusions.length > 0 && (
            <div className="sb-admin-subpanel">
              <strong>Sample Records Excluded ({sampleExclusions.length}):</strong>
              <div className="sb-admin-list" style={{ marginTop: '8px' }}>
                {sampleExclusions.map((s) => (
                  <div className="sb-admin-list-row" key={s.recordId}>
                    <div>
                      <strong>{s.companyName}</strong> · <code>{s.recordId}</code>
                      <div className="meta">{s.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>

      {/* Confirmation Modal for Irreversible Actions (Permanent Delete / Reject) */}
      {pendingConfirmAction && (
        <div
          className="sb-admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ipo-confirm-modal-title"
        >
          <div className="card sb-admin-modal">
            <h3 id="ipo-confirm-modal-title" style={{ marginTop: 0 }}>
              {pendingConfirmAction.mode === 'reject'
                ? `Reject IPO "${pendingConfirmAction.item.companyName}"?`
                : `Confirm Deletion of "${pendingConfirmAction.item.companyName}"`}
            </h3>
            {pendingConfirmAction.mode === 'reject' ? (
              <div>
                <p className="meta" style={{ lineHeight: 1.55 }}>
                  This moves <strong>{pendingConfirmAction.item.companyName}</strong> (<code>{pendingConfirmAction.item.id}</code>) to{' '}
                  <strong>Rejected</strong> status and keeps it hidden from public pages. You can return it to review or edit it later.
                </p>
                <div className="sb-admin-action-bar">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setPendingConfirmAction(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ background: 'var(--down)', borderColor: 'var(--down)' }}
                    disabled={busyRowId === pendingConfirmAction.item.id}
                    onClick={() => void handleLifecycleAction(pendingConfirmAction.item, 'reject')}
                  >
                    Confirm Reject IPO
                  </button>
                </div>
              </div>
            ) : (
              (() => {
                const { item } = pendingConfirmAction;
                const linkedRefs = inspectIpoLinkedReferences({
                  ipo: item.record,
                  articles: data.articles,
                  reviews: data.ipoReviews,
                });
                const isAlreadyApprovedPending =
                  item.category === 'Pending Deletion' && item.deletionStatus === 'approved';
                return (
                  <div>
                    <p className="meta" style={{ lineHeight: 1.55, marginBottom: '8px' }}>
                      Permanent deletion removes the non-public Firestore document <code>ipos/{item.id}</code> while retaining an immutable audit history entry. Shared articles and media assets are never deleted.
                    </p>
                    <div className="sb-note-box" style={{ marginBottom: '10px' }}>
                      <strong>Linked Reference Check:</strong> {linkedRefs.summary}
                    </div>
                    {linkedRefs.hasBlockingPendingReviews && (
                      <div className="sb-admin-alert err" role="alert" style={{ marginBottom: '10px' }}>
                        Resolve or reject {linkedRefs.pendingReviewIds.length} active Needs Review item(s) in Section 10 before permanently deleting this IPO.
                      </div>
                    )}
                    <div className="sb-admin-action-bar">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setPendingConfirmAction(null)}
                      >
                        Cancel
                      </button>
                      {!isAlreadyApprovedPending && (
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={busyRowId === item.id}
                          onClick={() => void handleLifecycleAction(item, 'request_delete')}
                        >
                          Move to Pending Deletion Queue
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn"
                        style={{ background: 'var(--down)', borderColor: 'var(--down)' }}
                        disabled={busyRowId === item.id || linkedRefs.hasBlockingPendingReviews}
                        onClick={() => void handleControlledDelete(item)}
                      >
                        Yes, Permanently Delete IPO
                      </button>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Retained Deleted IPO History Modal */}
      {historyModalItem && (
        <div
          className="sb-admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ipo-history-modal-title"
        >
          <div className="card sb-admin-modal">
            <div className="sec-h">
              <h3 id="ipo-history-modal-title" style={{ margin: 0 }}>
                Retained IPO Deletion History
              </h3>
              <button type="button" className="btn ghost" onClick={() => setHistoryModalItem(null)}>
                Close
              </button>
            </div>
            <div className="sb-admin-subpanel">
              <p style={{ margin: '0 0 6px' }}>
                <strong>Company:</strong> {historyModalItem.companyName}
              </p>
              <p className="meta" style={{ margin: '0 0 4px' }}>
                <strong>Original ID:</strong> <code>{historyModalItem.id}</code> · <strong>Slug:</strong> <code>{historyModalItem.slug}</code>
              </p>
              <p className="meta" style={{ margin: '0 0 4px' }}>
                <strong>Deleted Date:</strong> {historyModalItem.deletedHistory?.deletedAtIso || historyModalItem.lastUpdatedIso || 'Recorded in audit logs'}
              </p>
              {historyModalItem.deletedHistory?.previousStatus && (
                <p className="meta" style={{ margin: '0 0 4px' }}>
                  <strong>Previous Status:</strong> {historyModalItem.deletedHistory.previousStatus}
                </p>
              )}
              {historyModalItem.deletedHistory?.actorEmail && (
                <p className="meta" style={{ margin: '0 0 4px' }}>
                  <strong>Executed By:</strong> {historyModalItem.deletedHistory.actorEmail}
                </p>
              )}
              <p className="meta" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
                <strong>Audit Summary:</strong> {historyModalItem.deletedHistory?.summary || historyModalItem.record.summary || 'Retained deletion history.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
