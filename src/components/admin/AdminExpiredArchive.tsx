import { useState } from 'react';
import {
  approveArticleForPermanentDeletion,
  saveEditorialArticle,
  syncMediaVisibilityAcrossArticles,
} from '../../lib/firebase';
import type { DurationPreset, StoredArticleDoc } from '../../types/sakarbazaar';
import {
  computeExpiresAtMs,
  isArticleExpired,
  resolveDurationHours,
} from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

interface AdminExpiredArchiveProps extends AdminSectionBaseProps {
  onPublicContentChanged: () => Promise<void>;
}

export function AdminExpiredArchive({
  data,
  onRefresh,
  onPublicContentChanged,
  onNotify,
}: AdminExpiredArchiveProps) {
  const [restorePresetById, setRestorePresetById] = useState<Record<string, DurationPreset>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const nowMs = Date.now();

  const expiredItems = data.articles.filter(
    (art) =>
      (art.status === 'Expired' ||
        art.status === 'Retained' ||
        art.status === 'Archived' ||
        (art.status === 'Published' && isArticleExpired(art, nowMs))) &&
      art.deletionStatus !== 'approved' &&
      art.deletionStatus !== 'in_progress' &&
      art.deletionStatus !== 'partial_failure',
  );

  async function handleRetain(art: StoredArticleDoc) {
    setBusyId(art.id);
    try {
      await saveEditorialArticle({
        articleId: art.id,
        isNew: false,
        previousStatus: art.status,
        action: 'retain_private',
        payload: {
          ...art,
          status: 'Retained',
          retainedPrivate: true,
        },
      });
      await onRefresh();
      onNotify({ tone: 'ok', text: `Marked "${art.enHeadline || art.title}" as Retained Privately.` });
    } catch (err) {
      onNotify({ tone: 'err', text: err instanceof Error ? err.message : 'Unable to retain article.' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(art: StoredArticleDoc) {
    setBusyId(art.id);
    try {
      const preset = restorePresetById[art.id] ?? '15d';
      const hours = resolveDurationHours(preset);
      const publishedMs = Date.now();
      const nextExpiry = computeExpiresAtMs(publishedMs, hours);

      await saveEditorialArticle({
        articleId: art.id,
        isNew: false,
        previousStatus: art.status,
        action: 'restore_article',
        payload: {
          ...art,
          status: 'Published',
          retainedPrivate: false,
          durationPreset: preset,
          durationHours: hours,
          publishedAtMs: publishedMs,
          expiresAtMs: nextExpiry,
          publishedAt: new Date(publishedMs).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
        },
      });

      if (art.mediaId) {
        const updated = data.articles.map((a) =>
          a.id === art.id ? { ...a, status: 'Published' as const, expiresAtMs: nextExpiry } : a,
        );
        await syncMediaVisibilityAcrossArticles(art.mediaId, updated);
      }

      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Restored and republished "${art.enHeadline || art.title}" for ${hours} hours.`,
      });
    } catch (err) {
      onNotify({ tone: 'err', text: err instanceof Error ? err.message : 'Unable to restore article.' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleApproveDelete(art: StoredArticleDoc) {
    setBusyId(art.id);
    try {
      await approveArticleForPermanentDeletion(art);
      await onRefresh();
      onNotify({
        tone: 'ok',
        text: `Approved "${art.enHeadline || art.title}" for Pending Deletion.`,
      });
    } catch (err) {
      onNotify({ tone: 'err', text: err instanceof Error ? err.message : 'Unable to approve deletion.' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card snap">
      <div className="sec-h">
        <div>
          <h2>Expired / Private News ({expiredItems.length})</h2>
          <p className="sb-sec-sub">
            Expired articles are automatically hidden from all public routes and search, and safely retained here privately.
            Nothing is ever deleted automatically.
          </p>
        </div>
      </div>

      {expiredItems.length > 0 ? (
        <div className="sb-admin-card-list">
          {expiredItems.map((art) => {
            const preset = restorePresetById[art.id] ?? '15d';
            return (
              <article className="sb-admin-item-card" key={art.id}>
                <div className="sb-admin-item-top">
                  <span className="pill sb-pill-muted">{art.status}</span>
                  <span className="meta">
                    {art.category} · {art.retainedPrivate ? 'Retained Privately' : 'Expired'}
                  </span>
                </div>
                <h3>{art.enHeadline || art.title}</h3>
                {art.hiHeadline && <div className="meta" style={{ marginBottom: '8px' }}>{art.hiHeadline}</div>}
                <div className="sb-admin-item-actions">
                  <button
                    type="button"
                    className="btn ghost sb-admin-touch-btn"
                    disabled={busyId === art.id}
                    onClick={() => void handleRetain(art)}
                  >
                    Keep Retained Private
                  </button>
                  <select
                    value={preset}
                    onChange={(e) =>
                      setRestorePresetById((prev) => ({
                        ...prev,
                        [art.id]: e.target.value as DurationPreset,
                      }))
                    }
                    aria-label="Restore duration"
                  >
                    <option value="7d">Restore 7 Days</option>
                    <option value="15d">Restore 15 Days</option>
                    <option value="30d">Restore 30 Days</option>
                    <option value="60d">Restore 60 Days</option>
                  </select>
                  <button
                    type="button"
                    className="btn sb-admin-touch-btn"
                    disabled={busyId === art.id}
                    onClick={() => void handleRestore(art)}
                  >
                    Restore &amp; Publish
                  </button>
                  <button
                    type="button"
                    className="btn ghost sb-admin-touch-btn"
                    style={{ color: 'var(--down)' }}
                    disabled={busyId === art.id}
                    onClick={() => void handleApproveDelete(art)}
                  >
                    Approve Permanent Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="meta" style={{ margin: 0 }}>
          No expired or privately retained articles right now.
        </p>
      )}
    </section>
  );
}
