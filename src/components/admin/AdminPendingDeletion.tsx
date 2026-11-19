import { useRef, useState } from 'react';
import {
  approveArticleForPermanentDeletion,
  cancelArticleDeletionApproval,
  executePermanentArticleDeletion,
} from '../../lib/firebase';
import type { StoredArticleDoc } from '../../types/sakarbazaar';
import { canSafelyDeleteMediaAsset } from '../../utils/mediaLibrary';
import {
  canRetryPermanentDeletion,
  classifyArticleLifecycle,
  extractReadableErrorMessage,
  isArticleInDeletionQueue,
} from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

interface AdminPendingDeletionProps extends AdminSectionBaseProps {
  onPublicContentChanged: () => Promise<void>;
}

export function AdminPendingDeletion({
  data,
  adminRole,
  onRefresh,
  onPublicContentChanged,
  onNotify,
}: AdminPendingDeletionProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmExecuteId, setConfirmExecuteId] = useState<string | null>(null);
  const [localFeedback, setLocalFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const busyIdsRef = useRef<Set<string>>(new Set());

  const queue = data.articles.filter(isArticleInDeletionQueue);

  async function handleApprove(art: StoredArticleDoc) {
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    setBusyId(art.id);
    setLocalFeedback(null);
    try {
      await approveArticleForPermanentDeletion(art, data.articles);
      await onRefresh({ scope: 'none' });
      await onPublicContentChanged();
      const msg = `Approved permanent deletion for "${art.enHeadline || art.title}" (Step 1 of 2 complete). Click "Execute Permanent Deletion" below to finish removal.`;
      setLocalFeedback({ tone: 'ok', text: msg });
      onNotify({ tone: 'ok', text: msg });
    } catch (err) {
      const errMsg = extractReadableErrorMessage(err, 'Unable to approve permanent deletion.');
      setLocalFeedback({ tone: 'err', text: errMsg });
      onNotify({ tone: 'err', text: errMsg });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  async function handleExecute(art: StoredArticleDoc) {
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    setBusyId(art.id);
    setConfirmExecuteId(null);
    setLocalFeedback(null);
    try {
      const res = await executePermanentArticleDeletion(art, data.articles);
      await onRefresh({ scope: art.mediaId && res.status === 'deleted' ? 'media' : 'none' });
      await onPublicContentChanged();
      const tone = res.status === 'deleted' ? 'ok' : 'err';
      setLocalFeedback({ tone, text: res.message });
      onNotify({ tone, text: res.message });
    } catch (err) {
      const errMsg = extractReadableErrorMessage(err, 'Deletion failed.');
      setLocalFeedback({ tone: 'err', text: errMsg });
      onNotify({ tone: 'err', text: errMsg });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  async function handleCancel(art: StoredArticleDoc) {
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    setBusyId(art.id);
    setConfirmExecuteId(null);
    setLocalFeedback(null);
    try {
      await cancelArticleDeletionApproval(art, data.articles);
      await onRefresh({ scope: 'none' });
      await onPublicContentChanged();
      const msg = `Cancelled deletion and kept "${art.enHeadline || art.title}" in private archive.`;
      setLocalFeedback({ tone: 'ok', text: msg });
      onNotify({ tone: 'ok', text: msg });
    } catch (err) {
      const errMsg = extractReadableErrorMessage(err, 'Unable to cancel deletion.');
      setLocalFeedback({ tone: 'err', text: errMsg });
      onNotify({ tone: 'err', text: errMsg });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  return (
    <section className="card snap">
      <div className="sec-h">
        <div>
          <h2>Pending Deletion ({queue.length})</h2>
          <p className="sb-sec-sub">
            Deletion requires two explicit steps: Step 1 approves the request (<code>pending_approval → approved</code>),
            and Step 2 executes final permanent removal (<code>approved → in_progress → deleted</code>) after
            verifying Firestore media references and recording an idempotent audit entry.
          </p>
        </div>
      </div>

      {localFeedback && (
        <div
          className={`sb-admin-alert ${localFeedback.tone}`}
          role={localFeedback.tone === 'err' ? 'alert' : 'status'}
          style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}
        >
          <span>{localFeedback.text}</span>
          <button type="button" className="btn ghost" onClick={() => setLocalFeedback(null)}>
            Dismiss
          </button>
        </div>
      )}

      {queue.length > 0 ? (
        <div className="sb-admin-card-list">
          {queue.map((art) => {
            const cls = classifyArticleLifecycle(art);
            const mediaGuard = art.mediaId
              ? canSafelyDeleteMediaAsset(art.mediaId, data.articles, art.id)
              : null;
            const isPendingApproval = cls.stage === 'deletion_pending_approval';
            const isApproved = cls.stage === 'deletion_approved';
            const isPartialFailure = cls.stage === 'deletion_partial_failure';
            const isInProgress = cls.stage === 'deletion_in_progress';
            const canExecute = canRetryPermanentDeletion(art, adminRole);

            return (
              <article className="sb-admin-item-card" key={art.id}>
                <div className="sb-admin-item-top">
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span
                      className={`pill ${
                        isPartialFailure || isPendingApproval ? 'sb-pill-amber' : isApproved ? 'sb-pill-teal' : 'sb-pill-muted'
                      }`}
                    >
                      {cls.statusLabel}
                    </span>
                    {art.deletionStatus && (
                      <span className="pill">
                        <code>{art.deletionStatus}</code>
                      </span>
                    )}
                  </div>
                  <span className="meta">
                    {isPendingApproval
                      ? 'Step 1 of 2: Awaiting explicit approval'
                      : `Approved by: ${art.deletionApprovedByEmail || 'Operator'}`}
                  </span>
                </div>

                <h3>{art.enHeadline || art.title}</h3>
                {art.mediaId && (
                  <div className="meta" style={{ marginBottom: '6px' }}>
                    Attached media ({art.mediaId}):{' '}
                    {mediaGuard?.canDelete
                      ? 'Currently unshared — fresh Firestore check will confirm before removing media.'
                      : `Shared with ${mediaGuard?.remainingArticleIds.length} other article(s) — media will be preserved.`}
                  </div>
                )}

                {isPendingApproval && (
                  <div className="sb-note-box" style={{ marginBottom: '10px', fontSize: '13px' }}>
                    <strong>Step 1 — Awaiting Explicit Approval:</strong> Click <strong>Approve Permanent Deletion</strong> first before final deletion can run.
                  </div>
                )}

                {isApproved && (
                  <div className="sb-note-box" style={{ marginBottom: '10px', fontSize: '13px' }}>
                    <strong>Step 2 — Approval Recorded:</strong> Click <strong>Execute Permanent Deletion</strong> below and confirm to permanently remove this article{art.mediaId ? ' and update/clean up its media' : ''}.
                  </div>
                )}

                {isInProgress && (
                  <div className="sb-note-box" style={{ marginBottom: '10px', fontSize: '13px' }}>
                    <strong>Deletion In Progress:</strong> If a previous browser tab crashed mid-deletion, click Retry below to complete recovery idempotently.
                  </div>
                )}

                {isPartialFailure && (
                  <div className="sb-admin-alert err" role="alert" style={{ marginBottom: '10px' }}>
                    Previous execution attempt failed cleanly ({art.deletionAttempts || 1} attempt(s)):{' '}
                    {art.deletionError || 'Click Retry Permanent Deletion to resume safely.'}
                  </div>
                )}

                {confirmExecuteId === art.id ? (
                  <div className="sb-admin-subpanel">
                    <p style={{ margin: '0 0 10px', fontWeight: 600 }}>
                      Permanently delete &quot;{art.enHeadline || art.title}&quot;? This action cannot be undone.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn sb-admin-touch-btn"
                        style={{ background: 'var(--down)', borderColor: 'var(--down)' }}
                        disabled={busyId === art.id}
                        onClick={() => void handleExecute(art)}
                      >
                        {busyId === art.id ? 'Deleting…' : 'Yes, Permanently Delete'}
                      </button>
                      <button
                        type="button"
                        className="btn ghost sb-admin-touch-btn"
                        disabled={busyId === art.id}
                        onClick={() => setConfirmExecuteId(null)}
                      >
                        Keep for Now
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="sb-admin-item-actions">
                    {cls.canCancelDeletion && (
                      <button
                        type="button"
                        className="btn ghost sb-admin-touch-btn"
                        disabled={busyId === art.id}
                        onClick={() => void handleCancel(art)}
                      >
                        Cancel &amp; Retain Privately
                      </button>
                    )}
                    {isPendingApproval && (
                      <button
                        type="button"
                        className="btn sb-admin-touch-btn"
                        disabled={busyId === art.id}
                        onClick={() => void handleApprove(art)}
                      >
                        {busyId === art.id ? 'Approving…' : 'Approve Permanent Deletion'}
                      </button>
                    )}
                    {canExecute && (
                      <button
                        type="button"
                        className="btn sb-admin-touch-btn"
                        style={{ background: 'var(--down)', borderColor: 'var(--down)' }}
                        disabled={busyId === art.id}
                        onClick={() => setConfirmExecuteId(art.id)}
                      >
                        {isPartialFailure || isInProgress
                          ? 'Retry Permanent Deletion'
                          : 'Execute Permanent Deletion'}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="meta" style={{ margin: 0 }}>
          No articles are queued for permanent deletion.
        </p>
      )}
    </section>
  );
}
