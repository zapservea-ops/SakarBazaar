import { useState } from 'react';
import {
  approveArticleForPermanentDeletion,
  saveEditorialArticle,
  syncMediaVisibilityAcrossArticles,
} from '../../lib/firebase';
import type { StoredArticleDoc } from '../../types/sakarbazaar';
import {
  extendDurationFromNowOrExpiry,
  formatRemainingDuration,
  isArticleExpired,
  isArticlePubliclyVisible,
} from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

interface AdminManageNewsProps extends AdminSectionBaseProps {
  onEditArticle: (article: StoredArticleDoc) => void;
  onPublicContentChanged: () => Promise<void>;
}

export function AdminManageNews({
  data,
  onEditArticle,
  onRefresh,
  onPublicContentChanged,
  onNotify,
}: AdminManageNewsProps) {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'active' | 'drafts' | 'all'>('active');
  const [customHoursById, setCustomHoursById] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const nowMs = Date.now();
  const visibleRows = data.articles.filter((art) => {
    if (art.deletionStatus === 'approved' || art.deletionStatus === 'in_progress') return false;
    if (filterMode === 'active' && !isArticlePubliclyVisible(art, nowMs)) return false;
    if (
      filterMode === 'drafts' &&
      art.status !== 'Draft' &&
      art.status !== 'Awaiting Verification' &&
      art.status !== 'Verified'
    ) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (art.enHeadline || art.title || '').toLowerCase().includes(q) ||
        (art.hiHeadline || '').toLowerCase().includes(q) ||
        art.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function handleExtend(art: StoredArticleDoc, additionalHours: number) {
    setBusyId(art.id);
    try {
      const nextExpiry = extendDurationFromNowOrExpiry(art.expiresAtMs, additionalHours, Date.now());
      await saveEditorialArticle({
        articleId: art.id,
        isNew: false,
        previousStatus: art.status,
        action: 'extend_duration',
        payload: {
          ...art,
          status: 'Published',
          expiresAtMs: nextExpiry,
          durationHours: (art.durationHours ?? 0) + additionalHours,
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
        text: `Extended "${art.enHeadline || art.title}" by ${additionalHours} hours.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Unable to extend duration.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetainPrivate(art: StoredArticleDoc) {
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
      if (art.mediaId) {
        const updated = data.articles.map((a) =>
          a.id === art.id ? { ...a, status: 'Retained' as const } : a,
        );
        await syncMediaVisibilityAcrossArticles(art.mediaId, updated);
      }
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Moved "${art.enHeadline || art.title}" to Expired / Private Archive.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Unable to unpublish article.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleApproveDelete(art: StoredArticleDoc) {
    setBusyId(art.id);
    try {
      await approveArticleForPermanentDeletion(art);
      if (art.mediaId) {
        const updated = data.articles.map((a) =>
          a.id === art.id ? { ...a, status: 'Pending Deletion' as const, deletionStatus: 'approved' as const } : a,
        );
        await syncMediaVisibilityAcrossArticles(art.mediaId, updated);
      }
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Moved "${art.enHeadline || art.title}" to Pending Deletion for final confirmation.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Unable to move to pending deletion.',
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card snap">
      <div className="sec-h">
        <div>
          <h2>Manage News ({visibleRows.length})</h2>
          <p className="sb-sec-sub">
            Extend live elapsed-hour durations, make minor edits without resetting expiry, or move articles to private retention.
          </p>
        </div>
      </div>

      <div className="sb-admin-toolbar">
        <div className="sb-filter-tabs">
          <button
            type="button"
            className={`sb-filter-tab${filterMode === 'active' ? ' active' : ''}`}
            onClick={() => setFilterMode('active')}
          >
            Live Published
          </button>
          <button
            type="button"
            className={`sb-filter-tab${filterMode === 'drafts' ? ' active' : ''}`}
            onClick={() => setFilterMode('drafts')}
          >
            Drafts
          </button>
          <button
            type="button"
            className={`sb-filter-tab${filterMode === 'all' ? ' active' : ''}`}
            onClick={() => setFilterMode('all')}
          >
            All Active &amp; Drafts
          </button>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search English or Hindi headlines…"
          className="sb-admin-search-input"
        />
      </div>

      {visibleRows.length > 0 ? (
        <div className="sb-admin-card-list">
          {visibleRows.map((art) => {
            const expired = isArticleExpired(art, nowMs);
            const customAdd = customHoursById[art.id] ?? 168;
            return (
              <article className="sb-admin-item-card" key={art.id}>
                <div className="sb-admin-item-top">
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className={`pill ${art.status === 'Published' && !expired ? 'sb-pill-teal' : 'sb-pill-muted'}`}>
                      {expired && art.status === 'Published' ? 'Expired' : art.status}
                    </span>
                    <span className="pill">{art.category}</span>
                    {art.isPaid && <span className="pill sb-pill-amber">Paid</span>}
                    {art.featuredPlacement && art.featuredPlacement !== 'none' && (
                      <span className="pill sb-pill-teal">Featured: {art.featuredPlacement}</span>
                    )}
                  </div>
                  <span className="meta">
                    {art.status === 'Published' ? formatRemainingDuration(art.expiresAtMs, nowMs) : 'Unpublished'}
                  </span>
                </div>

                <h3>{art.enHeadline || art.title}</h3>
                {art.hiHeadline && <div className="meta" style={{ marginBottom: '8px' }}>{art.hiHeadline}</div>}

                <div className="sb-admin-item-actions">
                  <button
                    type="button"
                    className="btn ghost sb-admin-touch-btn"
                    onClick={() => onEditArticle(art)}
                  >
                    Edit (Keep Expiry)
                  </button>
                  <button
                    type="button"
                    className="btn ghost sb-admin-touch-btn"
                    disabled={busyId === art.id}
                    onClick={() => void handleExtend(art, 24 * 7)}
                  >
                    +7d (168h)
                  </button>
                  <button
                    type="button"
                    className="btn ghost sb-admin-touch-btn"
                    disabled={busyId === art.id}
                    onClick={() => void handleExtend(art, 24 * 15)}
                  >
                    +15d (360h)
                  </button>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="number"
                      min={1}
                      max={4380}
                      value={customAdd}
                      onChange={(e) =>
                        setCustomHoursById((prev) => ({
                          ...prev,
                          [art.id]: Number(e.target.value) || 24,
                        }))
                      }
                      aria-label="Custom extension hours"
                      style={{ width: '78px', padding: '6px 8px' }}
                    />
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busyId === art.id}
                      onClick={() => void handleExtend(art, customAdd)}
                    >
                      +Hours
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn ghost sb-admin-touch-btn"
                    disabled={busyId === art.id}
                    onClick={() => void handleRetainPrivate(art)}
                  >
                    Make Private
                  </button>
                  <button
                    type="button"
                    className="btn ghost sb-admin-touch-btn"
                    style={{ color: 'var(--down)' }}
                    disabled={busyId === art.id}
                    onClick={() => void handleApproveDelete(art)}
                  >
                    Approve Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="meta" style={{ margin: '12px 0 0' }}>
          No matching articles in this filter. Create a bilingual dispatch in the News Desk.
        </p>
      )}
    </section>
  );
}
