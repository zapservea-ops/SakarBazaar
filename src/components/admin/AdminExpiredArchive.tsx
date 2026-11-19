import { useRef, useState } from 'react';
import { MEDIA_ASSETS } from '../../data/editorialData';
import {
  approveArticleForPermanentDeletion,
  saveEditorialArticle,
  syncMediaVisibilityAcrossArticles,
} from '../../lib/firebase';
import type { DurationPreset, StoredArticleDoc } from '../../types/sakarbazaar';
import {
  formatPublishedDateLabel,
  parseBodyToSections,
  parseLegacyPublishedDateMs,
} from '../../utils/historicalNews';
import {
  computeExpiresAtMs,
  extractReadableErrorMessage,
  extractTimestampMillis,
  isArticleExpired,
  resolveDurationHours,
} from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

interface AdminExpiredArchiveProps extends AdminSectionBaseProps {
  onEditArticle: (article: StoredArticleDoc) => void;
  onPublicContentChanged: () => Promise<void>;
}

export function AdminExpiredArchive({
  data,
  onEditArticle,
  onRefresh,
  onPublicContentChanged,
  onNotify,
}: AdminExpiredArchiveProps) {
  const [restorePresetById, setRestorePresetById] = useState<Record<string, DurationPreset>>({});
  const [preserveDateById, setPreserveDateById] = useState<Record<string, boolean>>({});
  const [previewArt, setPreviewArt] = useState<StoredArticleDoc | null>(null);
  const [previewLang, setPreviewLang] = useState<'en' | 'hi'>('en');
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyIdsRef = useRef<Set<string>>(new Set());
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
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    setBusyId(art.id);
    try {
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...cleanArt } = art;
      await saveEditorialArticle({
        articleId: art.id,
        isNew: false,
        previousStatus: art.status,
        expectedUpdatedAtMs: extractTimestampMillis(art.updatedAt),
        action: 'retain_private',
        payload: {
          ...cleanArt,
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
      onNotify({ tone: 'ok', text: `Marked "${art.enHeadline || art.title}" as Retained Privately.` });
    } catch (err) {
      onNotify({ tone: 'err', text: extractReadableErrorMessage(err, 'Unable to retain article.') });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  async function handleArchive(art: StoredArticleDoc) {
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    setBusyId(art.id);
    try {
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...cleanArt } = art;
      await saveEditorialArticle({
        articleId: art.id,
        isNew: false,
        previousStatus: art.status,
        expectedUpdatedAtMs: extractTimestampMillis(art.updatedAt),
        action: 'archive',
        payload: {
          ...cleanArt,
          status: 'Archived',
          retainedPrivate: true,
        },
      });
      if (art.mediaId) {
        const updated = data.articles.map((a) =>
          a.id === art.id ? { ...a, status: 'Archived' as const } : a,
        );
        await syncMediaVisibilityAcrossArticles(art.mediaId, updated);
      }
      await onRefresh();
      await onPublicContentChanged();
      onNotify({ tone: 'ok', text: `Archived "${art.enHeadline || art.title}" privately.` });
    } catch (err) {
      onNotify({ tone: 'err', text: extractReadableErrorMessage(err, 'Unable to archive article.') });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  async function handleRestore(art: StoredArticleDoc) {
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    setBusyId(art.id);
    try {
      const preset = restorePresetById[art.id] ?? '15d';
      const hours = resolveDurationHours(preset);
      const now = Date.now();
      const nextExpiry = computeExpiresAtMs(now, hours);
      const hasOriginalDate = Boolean(art.publishedAtMs || art.publishedAt);
      const preserveDate = preserveDateById[art.id] ?? hasOriginalDate;
      const resolvedPublishedMs = preserveDate
        ? art.publishedAtMs ?? parseLegacyPublishedDateMs(art.publishedAt) ?? now
        : now;
      const resolvedPublishedLabel = preserveDate
        ? art.publishedAt || formatPublishedDateLabel(resolvedPublishedMs)
        : formatPublishedDateLabel(now);
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...cleanArt } = art;

      await saveEditorialArticle({
        articleId: art.id,
        isNew: false,
        previousStatus: art.status,
        expectedUpdatedAtMs: extractTimestampMillis(art.updatedAt),
        action: 'restore_article',
        payload: {
          ...cleanArt,
          status: 'Published',
          verificationStatus: 'verified',
          retainedPrivate: false,
          durationPreset: preset,
          durationHours: hours,
          publishedAtMs: resolvedPublishedMs,
          expiresAtMs: nextExpiry,
          publishedAt: resolvedPublishedLabel,
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
        text: `Restored and republished "${art.enHeadline || art.title}" for ${hours} hours (date: ${resolvedPublishedLabel}).`,
      });
    } catch (err) {
      onNotify({ tone: 'err', text: extractReadableErrorMessage(err, 'Unable to restore article.') });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  async function handleApproveDelete(art: StoredArticleDoc) {
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
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
        text: `Approved "${art.enHeadline || art.title}" for Pending Deletion.`,
      });
    } catch (err) {
      onNotify({ tone: 'err', text: extractReadableErrorMessage(err, 'Unable to approve deletion.') });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  return (
    <section className="card snap">
      <div className="sec-h">
        <div>
          <h2>Expired, Retained &amp; Archived Private News ({expiredItems.length})</h2>
          <p className="sb-sec-sub">
            Expired, retained, and archived articles are automatically hidden from all public routes and search, and
            safely retained here privately. Nothing is ever deleted automatically.
          </p>
        </div>
      </div>

      {expiredItems.length > 0 ? (
        <div className="sb-admin-card-list">
          {expiredItems.map((art) => {
            const preset = restorePresetById[art.id] ?? '15d';
            const hasOriginalDate = Boolean(art.publishedAtMs || art.publishedAt);
            const preserveDate = preserveDateById[art.id] ?? hasOriginalDate;
            return (
              <article className="sb-admin-item-card" key={art.id}>
                <div className="sb-admin-item-top">
                  <span className="pill sb-pill-muted">{art.status}</span>
                  <span className="meta">
                    {art.category} · {art.publishedAt || 'Unscheduled'} ·{' '}
                    {art.status === 'Archived'
                      ? 'Archived Privately'
                      : art.retainedPrivate
                        ? 'Retained Privately'
                        : 'Expired'}
                  </span>
                </div>
                <h3>{art.enHeadline || art.title}</h3>
                {art.hiHeadline && <div className="meta" style={{ marginBottom: '4px' }}>{art.hiHeadline}</div>}
                <div className="meta" style={{ marginBottom: '8px', fontSize: '12px' }}>
                  ID: <code>{art.id}</code> · Slug: <code>{art.slug}</code>
                </div>
                <div className="sb-admin-item-actions">
                  <button
                    type="button"
                    className="btn ghost sb-admin-touch-btn"
                    onClick={() => {
                      setPreviewArt(art);
                      setPreviewLang('en');
                    }}
                  >
                    Preview EN/HI
                  </button>
                  <button
                    type="button"
                    className="btn ghost sb-admin-touch-btn"
                    onClick={() => onEditArticle(art)}
                  >
                    Edit Content
                  </button>
                  {art.status !== 'Retained' && (
                    <button
                      type="button"
                      className="btn ghost sb-admin-touch-btn"
                      disabled={busyId === art.id}
                      onClick={() => void handleRetain(art)}
                    >
                      Keep Retained Private
                    </button>
                  )}
                  {art.status !== 'Archived' && (
                    <button
                      type="button"
                      className="btn ghost sb-admin-touch-btn"
                      disabled={busyId === art.id}
                      onClick={() => void handleArchive(art)}
                    >
                      Move to Archived
                    </button>
                  )}
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
                  {hasOriginalDate && (
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={preserveDate}
                        onChange={(e) =>
                          setPreserveDateById((prev) => ({
                            ...prev,
                            [art.id]: e.target.checked,
                          }))
                        }
                      />
                      <span>Keep original date</span>
                    </label>
                  )}
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
          No expired, retained, or archived articles right now.
        </p>
      )}

      {previewArt && (
        <div
          className="sb-admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Expired or Archived Article Preview"
        >
          <div className="card snap sb-admin-modal">
            <div className="sec-h">
              <h2>Private Archive Preview</h2>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn ${previewLang === 'en' ? '' : 'ghost'}`}
                  onClick={() => setPreviewLang('en')}
                >
                  English
                </button>
                <button
                  type="button"
                  className={`btn ${previewLang === 'hi' ? '' : 'ghost'}`}
                  onClick={() => setPreviewLang('hi')}
                >
                  हिंदी
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    onEditArticle(previewArt);
                    setPreviewArt(null);
                  }}
                >
                  Edit in News Desk
                </button>
                <button type="button" className="btn ghost" onClick={() => setPreviewArt(null)}>
                  Close
                </button>
              </div>
            </div>
            <h3 style={{ font: '700 22px var(--serif)', margin: '0 0 8px' }}>
              {previewLang === 'hi'
                ? previewArt.hiHeadline || '(हिंदी शीर्षक उपलब्ध नहीं)'
                : previewArt.enHeadline || previewArt.title}
            </h3>
            <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>
              {previewLang === 'hi'
                ? previewArt.hiSummary || '(हिंदी सारांश उपलब्ध नहीं)'
                : previewArt.enSummary || previewArt.summary}
            </p>
            {previewArt.mediaId &&
              (data.payloadMap[previewArt.mediaId]?.dataUrl ||
                MEDIA_ASSETS.find((m) => m.id === previewArt.mediaId)?.posterUrl) && (
                <img
                  src={
                    data.payloadMap[previewArt.mediaId]?.dataUrl ||
                    MEDIA_ASSETS.find((m) => m.id === previewArt.mediaId)?.posterUrl
                  }
                  alt={previewArt.enHeadline || previewArt.title}
                  style={{ width: '100%', maxHeight: '240px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }}
                />
              )}
            <div style={{ display: 'grid', gap: '10px', lineHeight: 1.65 }}>
              {parseBodyToSections(
                previewLang === 'hi'
                  ? previewArt.hiBody
                  : previewArt.enBody || previewArt.body,
                previewLang === 'hi'
                  ? previewArt.hiSummary
                  : previewArt.enSummary || previewArt.summary,
                previewLang === 'hi' ? 'संपादकीय रिपोर्ट' : 'Editorial Dispatch',
              ).map((sec, idx) => (
                <div key={`${sec.heading}-${idx}`}>
                  <h4 style={{ margin: '0 0 4px', fontSize: '15px' }}>{sec.heading}</h4>
                  {sec.paragraphs.map((p, pIdx) => (
                    <p key={pIdx} style={{ margin: '0 0 8px' }}>
                      {p}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
