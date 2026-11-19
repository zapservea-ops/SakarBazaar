import { useRef, useState } from 'react';
import {
  cancelArticleDeletionApproval,
  executePermanentArticleDeletion,
} from '../../lib/firebase';
import type { StoredArticleDoc } from '../../types/sakarbazaar';
import { canSafelyDeleteMediaAsset } from '../../utils/mediaLibrary';
import { canRetryPermanentDeletion, extractReadableErrorMessage } from '../../utils/newsLifecycle';
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

  const queue = data.articles.filter(
    (art) =>
      art.status === 'Pending Deletion' ||
      art.status === 'Deletion In Progress' ||
      art.deletionStatus === 'approved' ||
      art.deletionStatus === 'in_progress' ||
      art.deletionStatus === 'partial_failure',
  );

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
            Both Owner and Publisher may approve and execute permanent deletion. Shared media used by other articles is
            automatically preserved; unshared photos and payloads are permanently removed with an immutable audit entry.
          </p>
        </div>
      </div>

      {queue.length > 0 ? (
        <div className="sb-admin-card-list">
          {queue.map((art) => {
            const mediaGuard = art.mediaId
              ? canSafelyDeleteMediaAsset(art.mediaId, data.articles, art.id)
              : null;
            const isPartialFailure = art.deletionStatus === 'partial_failure';
            const canExecute = canRetryPermanentDeletion(art, adminRole);

            return (
              <article className="sb-admin-item-card" key={art.id}>
                <div className="sb-admin-item-top">
                  <span className={`pill ${isPartialFailure ? 'sb-pill-amber' : 'sb-pill-muted'}`}>
                    {isPartialFailure ? 'Partial Failure — Retry Available' : art.status}
                  </span>
                  <span className="meta">
                    Approved by: {art.deletionApprovedByEmail || 'Operator'}
                  </span>
                </div>

                <h3>{art.enHeadline || art.title}</h3>
                {art.mediaId && (
                  <div className="meta" style={{ marginBottom: '6px' }}>
                    Attached media ({art.mediaId}):{' '}
                    {mediaGuard?.canDelete
                      ? 'Unshared — will be permanently deleted with this article.'
                      : `Shared with ${mediaGuard?.remainingArticleIds.length} other article(s) — media will be preserved.`}
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
                    <button
                      type="button"
                      className="btn ghost sb-admin-touch-btn"
                      disabled={busyId === art.id}
                      onClick={() => void handleCancel(art)}
                    >
                      Cancel &amp; Retain Privately
                    </button>
                    {canExecute && (
                      <button
                        type="button"
                        className="btn sb-admin-touch-btn"
                        style={{ background: 'var(--down)', borderColor: 'var(--down)' }}
                        disabled={busyId === art.id}
                        onClick={() => setConfirmExecuteId(art.id)}
                      >
                        {isPartialFailure ? 'Retry Permanent Deletion' : 'Execute Permanent Deletion'}
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
