import { useState } from 'react';
import {
  auth,
  resolveIpoSourceReview,
  saveIpoSourceReview,
  writeAuditLog,
} from '../../lib/firebase';
import type { IpoSourceReviewRecord } from '../../types/sakarbazaar';
import { detectIpoFieldDiffs } from '../../utils/ipoLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

interface PortalStatus {
  portalId: string;
  portalName: string;
  url: string;
  status: 'reachable' | 'blocked' | 'unavailable';
  httpStatus?: number;
  message: string;
}

interface CandidateItem {
  companyName: string;
  segment: 'Mainboard' | 'SME';
  filingDate?: string;
  openingDate?: string;
  closingDate?: string;
  priceBand?: string;
  issueSize?: string;
  sourceName: string;
  sourceUrl: string;
  summary: string;
}

interface AdminIpoReviewsProps extends AdminSectionBaseProps {
  onPublicContentChanged: () => Promise<void>;
}

export function AdminIpoReviews({
  data,
  onRefresh,
  onPublicContentChanged,
  onNotify,
}: AdminIpoReviewsProps) {
  const [checking, setChecking] = useState(false);
  const [portals, setPortals] = useState<PortalStatus[]>([]);
  const [policyNote, setPolicyNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCheckOfficialSources(forceRefresh: boolean = false) {
    setChecking(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication token unavailable.');

      const res = await fetch('/api/ipo-sources/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ forceRefresh }),
      });

      const body = (await res.json()) as {
        checkedAt?: string;
        portals?: PortalStatus[];
        candidates?: CandidateItem[];
        policyNote?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `Official check returned HTTP ${res.status}`);
      }

      setPortals(body.portals ?? []);
      setPolicyNote(body.policyNote ?? null);

      const candidates = body.candidates ?? [];
      let createdCount = 0;

      for (const cand of candidates) {
        const existingIpo = data.ipos.find(
          (i) => i.companyName.toLowerCase() === cand.companyName.toLowerCase(),
        );
        const diffs = detectIpoFieldDiffs(existingIpo, cand);
        const alreadyPending = data.ipoReviews.some(
          (r) =>
            r.reviewStatus === 'Needs Review' &&
            r.companyName.toLowerCase() === cand.companyName.toLowerCase(),
        );
        if (diffs.length > 0 && !alreadyPending) {
          const revId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          await saveIpoSourceReview(
            {
              id: revId,
              companyName: cand.companyName,
              targetIpoId: existingIpo?.id,
              segment: cand.segment,
              reviewStatus: 'Needs Review',
              sourceName: cand.sourceName,
              sourceUrl: cand.sourceUrl,
              checkedAt: body.checkedAt || new Date().toISOString(),
              diffs,
              detectedSummary: cand.summary,
            },
            true,
          );
          createdCount++;
        }
      }

      await writeAuditLog({
        action: 'ipo_source_check',
        entityType: 'ipoReview',
        entityId: `chk_${Date.now()}`,
        nextStatus: 'Checked',
        summary: `Checked official IPO portals (${candidates.length} candidate(s), ${createdCount} queued for review).`,
      });

      await onRefresh();
      onNotify({
        tone: 'ok',
        text: `Official portal check complete: ${candidates.length} candidate(s) inspected, ${createdCount} new item(s) marked Needs Review.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Official source check failed.',
      });
    } finally {
      setChecking(false);
    }
  }

  async function handleReviewDecision(
    review: IpoSourceReviewRecord,
    decision: 'Approved' | 'Rejected',
  ) {
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
            ? `Approved and applied verified official updates for ${review.companyName}.`
            : `Rejected update for ${review.companyName}; existing verified IPO data preserved.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Unable to resolve review.',
      });
    } finally {
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
            <h2>IPO Source Review (Official SEBI / NSE / BSE Check)</h2>
            <p className="sb-sec-sub">
              Respectful, zero-billing on-demand check (10-minute server cache; never bypasses anti-bot/CAPTCHA).
              Official portal candidates are staged here as <strong>Needs Review</strong> until approved by Owner or Publisher.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn sb-admin-touch-btn"
              disabled={checking}
              onClick={() => void handleCheckOfficialSources(false)}
            >
              {checking ? 'Checking Official Portals…' : 'Check Official Sources'}
            </button>
            <button
              type="button"
              className="btn ghost sb-admin-touch-btn"
              disabled={checking}
              onClick={() => void handleCheckOfficialSources(true)}
            >
              Force Fresh Check
            </button>
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
                <p className="meta" style={{ margin: '0 0 6px', lineHeight: 1.45 }}>{p.message}</p>
                <a href={p.url} target="_blank" rel="noreferrer" className="meta" style={{ color: 'var(--teal)' }}>
                  Open official portal manually ↗
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
                  </div>
                  <span className="meta">Source: {rev.sourceName}</span>
                </div>
                <h3>{rev.companyName}</h3>
                {rev.detectedSummary && (
                  <p className="meta" style={{ margin: '0 0 10px' }}>{rev.detectedSummary}</p>
                )}

                <div className="sb-admin-diff-table">
                  {rev.diffs.map((d, idx) => (
                    <div className="sb-admin-diff-row" key={idx}>
                      <strong>{d.label}</strong>
                      <span className="meta">Previous: {d.previousValue}</span>
                      <span style={{ color: 'var(--teal)', fontWeight: 600 }}>Detected: {d.detectedValue}</span>
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
                      Verify Link ↗
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="meta">No pending official source diffs awaiting review.</p>
        )}

        {resolvedReviews.length > 0 && (
          <>
            <h3 style={{ marginTop: '20px' }}>Past Review Decisions ({resolvedReviews.length})</h3>
            <div className="sb-admin-list">
              {resolvedReviews.slice(0, 10).map((r) => (
                <div className="sb-admin-list-row" key={r.id}>
                  <div>
                    <strong>{r.companyName}</strong>
                    <div className="meta">{r.sourceName} · Reviewed by {r.reviewedByEmail || 'Operator'}</div>
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
