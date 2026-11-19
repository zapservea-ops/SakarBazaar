import { useRef, useState } from 'react';
import {
  resolveIpoSourceReview,
  runOfficialSebiSourceCheckAndQueue,
  type SebiPortalStatusReport,
} from '../../lib/firebase';
import type { IpoSourceReviewRecord } from '../../types/sakarbazaar';
import { formatOfficialIpoField } from '../../utils/ipoLifecycle';
import { extractReadableErrorMessage } from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

interface AdminIpoReviewsProps extends AdminSectionBaseProps {
  onPublicContentChanged: () => Promise<void>;
}

const OFFICIAL_SEBI_URL =
  'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11';

export function AdminIpoReviews({
  data,
  onRefresh,
  onPublicContentChanged,
  onNotify,
}: AdminIpoReviewsProps) {
  const [checking, setChecking] = useState(false);
  const [portals, setPortals] = useState<SebiPortalStatusReport[]>([]);
  const [policyNote, setPolicyNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const checkingRef = useRef(false);
  const resolvingIdsRef = useRef<Set<string>>(new Set());

  async function handleCheckOfficialSebiSource(forceRefresh: boolean = false) {
    if (checkingRef.current || checking) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const report = await runOfficialSebiSourceCheckAndQueue({
        forceRefresh,
        existingIpos: data.ipos,
        existingReviews: data.ipoReviews,
      });

      setPortals(report.portals);
      setPolicyNote(report.policyNote || null);

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
          text: `Official SEBI source check complete: ${report.candidatesCount} filing(s) inspected, ${report.queuedCount} new item(s) marked Needs Review (${report.skippedDuplicateCount} duplicate(s) skipped).`,
        });
      }
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Official SEBI source check failed.'),
      });
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }

  async function handleReviewDecision(
    review: IpoSourceReviewRecord,
    decision: 'Approved' | 'Rejected',
  ) {
    if (resolvingIdsRef.current.has(review.id)) return;
    resolvingIdsRef.current.add(review.id);
    setBusyId(review.id);
    try {
      await resolveIpoSourceReview({
        review,
        decision,
        existingIpos: data.ipos,
      });
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text:
          decision === 'Approved'
            ? `Approved and applied verified official SEBI updates for ${review.companyName}.`
            : `Rejected update for ${review.companyName}; existing verified IPO data preserved.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to resolve review.'),
      });
    } finally {
      resolvingIdsRef.current.delete(review.id);
      setBusyId(null);
    }
  }

  const pendingReviews = data.ipoReviews.filter((r) => r.reviewStatus === 'Needs Review');
  const resolvedReviews = data.ipoReviews.filter((r) => r.reviewStatus !== 'Needs Review');

  return (
    <div className="sb-admin-stack">
      <section className="card snap">
        <div className="sec-h">
          <div>
            <h2>IPO Source Review (Official SEBI Public Issues Check)</h2>
            <p className="sb-sec-sub">
              Uses ONLY the official SEBI Public Issues portal and linked SEBI filing documents (never NSE/BSE/third-party sites).
              New or changed filings stay in <strong>Needs Review</strong> until explicitly approved by Owner or Publisher.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn sb-admin-touch-btn"
              disabled={checking}
              onClick={() => void handleCheckOfficialSebiSource(false)}
            >
              {checking ? 'Checking SEBI Source…' : 'Check Official SEBI Source'}
            </button>
            <button
              type="button"
              className="btn ghost sb-admin-touch-btn"
              disabled={checking}
              onClick={() => void handleCheckOfficialSebiSource(true)}
            >
              Force Fresh Check
            </button>
          </div>
        </div>

        <div className="sb-note-box" style={{ marginBottom: '16px' }}>
          <strong>Authorized Source URL:</strong>{' '}
          <a href={OFFICIAL_SEBI_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
            {OFFICIAL_SEBI_URL} ↗
          </a>
          <div className="meta" style={{ marginTop: '4px' }}>
            SEBI filing dates (DRHP/RHP) are tracked separately from IPO opening and closing dates. Missing offer fields always show as{' '}
            <strong>Not announced</strong>.
          </div>
        </div>

        {portals.length > 0 && (
          <div className="sb-admin-portal-grid" style={{ marginBottom: '16px' }}>
            {portals.map((p) => (
              <div className="sb-admin-subpanel" key={p.portalId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <strong>{p.portalName}</strong>
                  <span
                    className={`pill ${
                      p.status === 'reachable' ? 'sb-pill-teal' : 'sb-pill-amber'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="meta" style={{ margin: '0 0 6px', lineHeight: 1.45 }}>
                  {p.message}
                  {typeof p.pagesChecked === 'number' ? ` (${p.pagesChecked} page(s) checked)` : ''}
                </p>
                <a href={p.url} target="_blank" rel="noreferrer" className="meta" style={{ color: 'var(--teal)' }}>
                  Open official SEBI portal manually ↗
                </a>
              </div>
            ))}
          </div>
        )}

        {policyNote && (
          <div className="sb-note-box" style={{ marginBottom: '16px' }}>
            {policyNote}
          </div>
        )}

        <h3>Needs Review ({pendingReviews.length})</h3>
        {pendingReviews.length > 0 ? (
          <div className="sb-admin-card-list">
            {pendingReviews.map((rev) => (
              <article className="sb-admin-item-card" key={rev.id}>
                <div className="sb-admin-item-top">
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="pill sb-pill-amber">Needs Review</span>
                    <span className="pill">{rev.segment}</span>
                    {rev.matchType && (
                      <span className="pill sb-pill-muted">{rev.matchType}</span>
                    )}
                  </div>
                  <span className="meta">Source: {rev.sourceName}</span>
                </div>
                <h3>{rev.companyName}</h3>
                {rev.migrationKey && (
                  <div className="meta" style={{ marginBottom: '6px' }}>
                    Migration Key: <code>{rev.migrationKey}</code>
                  </div>
                )}
                {rev.conflictWarning && (
                  <div className="sb-admin-alert err" style={{ marginBottom: '10px' }}>
                    <strong>Identity Conflict Guard:</strong> {rev.conflictWarning}
                  </div>
                )}
                {rev.detectedSummary && (
                  <p className="meta" style={{ margin: '0 0 10px' }}>{rev.detectedSummary}</p>
                )}

                <div className="sb-admin-diff-table">
                  {rev.diffs.map((d, idx) => (
                    <div className="sb-admin-diff-row" key={idx}>
                      <strong>{d.label}</strong>
                      <span className="meta">Previous: {formatOfficialIpoField(d.previousValue)}</span>
                      <span style={{ color: 'var(--teal)', fontWeight: 600 }}>
                        Detected:{' '}
                        {/^https?:\/\//i.test(d.detectedValue) ? (
                          <a href={d.detectedValue} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                            {d.detectedValue} ↗
                          </a>
                        ) : (
                          formatOfficialIpoField(d.detectedValue)
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="sb-admin-item-actions" style={{ marginTop: '12px' }}>
                  <button
                    type="button"
                    className="btn sb-admin-touch-btn"
                    disabled={busyId === rev.id}
                    onClick={() => void handleReviewDecision(rev, 'Approved')}
                  >
                    Approve &amp; Publish to IPO Calendar
                  </button>
                  <button
                    type="button"
                    className="btn ghost sb-admin-touch-btn"
                    disabled={busyId === rev.id}
                    onClick={() => void handleReviewDecision(rev, 'Rejected')}
                  >
                    Reject Update
                  </button>
                  {rev.sourceUrl && (
                    <a href={rev.sourceUrl} target="_blank" rel="noreferrer" className="btn ghost sb-admin-touch-btn">
                      Verify Official SEBI Link ↗
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="meta">No pending official SEBI source diffs awaiting review.</p>
        )}

        {resolvedReviews.length > 0 && (
          <>
            <h3 style={{ marginTop: '20px' }}>Past Review Decisions ({resolvedReviews.length})</h3>
            <div className="sb-admin-list">
              {resolvedReviews.slice(0, 12).map((r) => (
                <div className="sb-admin-list-row" key={r.id}>
                  <div>
                    <strong>{r.companyName}</strong>
                    <div className="meta">
                      {r.sourceName} · Reviewed by {r.reviewedByEmail || 'Operator'}
                      {r.reviewedAt ? ` · ${r.reviewedAt.slice(0, 16).replace('T', ' ')}` : ''}
                    </div>
                  </div>
                  <span className={`pill ${r.reviewStatus === 'Approved' ? 'sb-pill-teal' : 'sb-pill-muted'}`}>
                    {r.reviewStatus}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
