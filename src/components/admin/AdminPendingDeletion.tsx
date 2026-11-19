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
  const busyIdsRef = useRef<Set<string>>(new Set());

  const queue = data.articles.filter(isArticleInDeletionQueue);

  async function handleApprove(art: StoredArticleDoc) {
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    setBusyId(art.id);
    try {
      await approveArticleForPermanentDeletion(art);
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Approved permanent deletion for "${art.enHeadline || art.title}". You may now execute final removal.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to approve permanent deletion.'),
      });
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
    try {
      const res = await executePermanentArticleDeletion(art, data.articles);
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: res.status === 'deleted' ? 'ok' : 'err',
        text: res.message,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Deletion failed.'),
      });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  async function handleCancel(art: StoredArticleDoc) {
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    setBusyId(art.id);
    try {
      await cancelArticleDeletionApproval(art);
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Cancelled deletion and kept "${art.enHeadline || art.title}" in private archive.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to cancel deletion.'),
      });
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
            Articles awaiting deletion approval (<code>pending_approval</code>) and approved deletions appear here
            immediately. Execution verifies authoritative Firestore media references right before removing unshared
            photos/payloads and records an idempotent audit entry.
          </p>
        </div>
      </div>

      {queue.length > 0 ? (
        <div className="sb-admin-card-list">
          {queue.map((art) => {
            const cls = classifyArticleLifecycle(art);
            const mediaGuard = art.mediaId
              ? canSafelyDeleteMediaAsset(art.mediaId, data.articles, art.id)
              : null;
            const isPendingApproval = cls.stage === 'deletion_pending_approval';
            const isPartialFailure = cls.stage === 'deletion_partial_failure';
            const isInProgress = cls.stage === 'deletion_in_progress';
            const canExecute = canRetryPermanentDeletion(art, adminRole);

            return (
              <article className="sb-admin-item-card" key={art.id}>
                <div className="sb-admin-item-top">
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span
                      className={`pill ${
                        isPartialFailure || isPendingApproval ? 'sb-pill-amber' : 'sb-pill-muted'
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
                      ? `Requested by: ${art.deletionApprovedByEmail || 'Operator'}`
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
                    <strong>Awaiting Explicit Approval:</strong> Approve this request first before permanent deletion can run.
                  </div>
                )}

                {isInProgress && (
                  <div className="sb-note-box" style={{ marginBottom: '10px', fontSize: '13px' }}>
                    <strong>Deletion In Progress:</strong> If a previous browser tab crashed mid-deletion, click Retry below to complete recovery idempotently.
                  </div>
                )}

                {isPartialFailure && art.deletionError && (
                  <div className="sb-admin-alert err" style={{ marginBottom: '10px' }}>
                    Previous attempt failed cleanly ({art.deletionAttempts || 1} attempt(s)): {art.deletionError}
                  </div>
                )}

                {confirmExecuteId === art.id ? (
                  <div className="sb-admin-subpanel">
                    <p style={{ margin: '0 0 10px', fontWeight: 600 }}>
                      Permanently delete "{art.enHeadline || art.title}"? This action cannot be undone.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn sb-admin-touch-btn"
                        style={{ background: 'var(--down)', borderColor: 'var(--down)' }}
                        disabled={busyId === art.id}
                        onClick={() => void handleExecute(art)}
                      >
                        Yes, Permanently Delete
                      </button>
                      <button
                        type="button"
                        className="btn ghost sb-admin-touch-btn"
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
                        Approve Permanent Deletion
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
