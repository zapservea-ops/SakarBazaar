import { useState } from 'react';
import { updateFeaturedPlacementsInFirestore } from '../../lib/firebase';
import type { FeaturedPlacement } from '../../types/sakarbazaar';
import { applyManualFeaturedPlacement, isArticlePubliclyVisible } from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

interface AdminFeaturedManagerProps extends AdminSectionBaseProps {
  onPublicContentChanged: () => Promise<void>;
}

export function AdminFeaturedManager({
  data,
  onRefresh,
  onPublicContentChanged,
  onNotify,
}: AdminFeaturedManagerProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const activeArticles = data.articles.filter((a) => isArticlePubliclyVisible(a));

  const mainStory = activeArticles.find((a) => a.featuredPlacement === 'main');
  const secondaryStories = activeArticles
    .filter((a) => a.featuredPlacement === 'secondary')
    .sort((a, b) => (a.featuredOrder ?? 99) - (b.featuredOrder ?? 99));

  async function handleAssign(articleId: string, placement: FeaturedPlacement, order: number = 1) {
    setBusyId(articleId);
    try {
      const changes = applyManualFeaturedPlacement(data.articles, articleId, placement, order);
      await updateFeaturedPlacementsInFirestore(changes);
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Updated featured homepage placement (${placement}).`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Unable to update featured placement.',
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card snap">
      <div className="sec-h">
        <div>
          <h2>Featured Articles (Manual Homepage Curation)</h2>
          <p className="sb-sec-sub">
            Manually select <strong>1 Main Top Story</strong> and up to <strong>3 Secondary Featured Stories</strong>.
            Featured placement is completely independent of duration or paid status.
          </p>
        </div>
      </div>

      <div className="sb-admin-two-col" style={{ marginBottom: '20px' }}>
        <div className="sb-admin-subpanel">
          <h3>Main Top Story Slot (1 Max)</h3>
          {mainStory ? (
            <div>
              <strong>{mainStory.enHeadline || mainStory.title}</strong>
              <div className="meta" style={{ marginTop: '4px' }}>{mainStory.category}</div>
              <button
                type="button"
                className="btn ghost"
                style={{ marginTop: '8px' }}
                disabled={busyId === mainStory.id}
                onClick={() => void handleAssign(mainStory.id, 'none')}
              >
                Clear Main Slot
              </button>
            </div>
          ) : (
            <p className="meta" style={{ margin: 0 }}>
              No custom Main Top Story pinned — homepage falls back cleanly to latest dispatches.
            </p>
          )}
        </div>

        <div className="sb-admin-subpanel">
          <h3>Secondary Featured Slots ({secondaryStories.length} / 3)</h3>
          {secondaryStories.length > 0 ? (
            <div className="sb-admin-list">
              {secondaryStories.map((s, idx) => (
                <div className="sb-admin-list-row" key={s.id}>
                  <div style={{ minWidth: 0 }}>
                    <strong>
                      #{idx + 1}: {s.enHeadline || s.title}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busyId === s.id}
                    onClick={() => void handleAssign(s.id, 'none')}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="meta" style={{ margin: 0 }}>No secondary slots manually pinned yet.</p>
          )}
        </div>
      </div>

      <h3>Live Published Articles Available to Feature ({activeArticles.length})</h3>
      {activeArticles.length > 0 ? (
        <div className="sb-admin-card-list">
          {activeArticles.map((art) => (
            <div className="sb-admin-item-card" key={art.id}>
              <div className="sb-admin-item-top">
                <span className="pill">{art.category}</span>
                <span className="meta">
                  Current: <strong>{art.featuredPlacement || 'none'}</strong>
                </span>
              </div>
              <h3>{art.enHeadline || art.title}</h3>
              <div className="sb-admin-item-actions">
                <button
                  type="button"
                  className={`btn ${art.featuredPlacement === 'main' ? '' : 'ghost'} sb-admin-touch-btn`}
                  disabled={busyId === art.id}
                  onClick={() => void handleAssign(art.id, 'main', 0)}
                >
                  Set as Main Top Story
                </button>
                <button
                  type="button"
                  className={`btn ${art.featuredPlacement === 'secondary' ? '' : 'ghost'} sb-admin-touch-btn`}
                  disabled={busyId === art.id}
                  onClick={() => void handleAssign(art.id, 'secondary', secondaryStories.length + 1)}
                >
                  Add to Secondary (Max 3)
                </button>
                {art.featuredPlacement && art.featuredPlacement !== 'none' && (
                  <button
                    type="button"
                    className="btn ghost sb-admin-touch-btn"
                    disabled={busyId === art.id}
                    onClick={() => void handleAssign(art.id, 'none')}
                  >
                    Standard Feed Only
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="meta">No active published Firestore articles found. Publish a bilingual article in News Desk first.</p>
      )}
    </section>
  );
}
