import { useMemo, useRef, useState } from 'react';
import { MEDIA_ASSETS } from '../../data/editorialData';
import { ARTICLES_CATALOG } from '../../data/sampleData';
import {
  approveArticleForPermanentDeletion,
  migrateLegacyStaticArticles,
  saveEditorialArticle,
  syncMediaVisibilityAcrossArticles,
} from '../../lib/firebase';
import type {
  DurationPreset,
  EditorialWorkflowStatus,
  LegacyMigrationPreview,
  LegacyMigrationReport,
  ManagedNewsItem,
  NewsCategory,
  StoredArticleDoc,
} from '../../types/sakarbazaar';
import {
  buildLegacyMigrationPreview,
  buildUnifiedManageNewsList,
  filterHistoricalAndCurrentNews,
  formatPublishedDateLabel,
  parseBodyToSections,
  parseLegacyPublishedDateMs,
  toIstIsoDateInput,
  type ManageDateFilter,
  type ManageOriginFilter,
  type ManageStatusFilter,
} from '../../utils/historicalNews';
import {
  computeExpiresAtMs,
  extendDurationFromNowOrExpiry,
  extractReadableErrorMessage,
  extractTimestampMillis,
  formatRemainingDuration,
  isArticleExpired,
  isArticleInDeletionQueue,
  isArticlePermanentlyDeleted,
  isArticlePubliclyVisible,
  resolveDurationHours,
} from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

const CATEGORIES: NewsCategory[] = [
  'All',
  'Markets',
  'IPO',
  'Corporate',
  'Economy',
  'RBI',
  'Banking',
  'Technology',
  'Personal finance',
];

interface AdminManageNewsProps extends AdminSectionBaseProps {
  onEditArticle: (article: StoredArticleDoc) => void;
  onPublicContentChanged: () => Promise<void>;
}

export function AdminManageNews({
  data,
  userUid,
  onEditArticle,
  onRefresh,
  onPublicContentChanged,
  onNotify,
}: AdminManageNewsProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ManageStatusFilter>('all');
  const [originFilter, setOriginFilter] = useState<ManageOriginFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<NewsCategory>('All');
  const [dateFilter, setDateFilter] = useState<ManageDateFilter>('all');
  const [exactDate, setExactDate] = useState('');

  const [customHoursById, setCustomHoursById] = useState<Record<string, number>>({});
  const [republishPresetById, setRepublishPresetById] = useState<Record<string, DurationPreset>>({});
  const [preserveDateById, setPreserveDateById] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyIdsRef = useRef<Set<string>>(new Set());

  // Article Reader Preview Modal
  const [previewItem, setPreviewItem] = useState<ManagedNewsItem | null>(null);
  const [previewLang, setPreviewLang] = useState<'en' | 'hi'>('en');

  // Legacy Migration Preview & Report Modals
  const [migrationPreview, setMigrationPreview] = useState<LegacyMigrationPreview | null>(null);
  const [migrationTargetStatus, setMigrationTargetStatus] =
    useState<EditorialWorkflowStatus>('Draft');
  const [migrationDurationPreset, setMigrationDurationPreset] =
    useState<DurationPreset>('60d');
  const [migrating, setMigrating] = useState(false);
  const [migrationReport, setMigrationReport] = useState<LegacyMigrationReport | null>(null);

  const nowMs = Date.now();

  const unifiedItems = useMemo(
    () => buildUnifiedManageNewsList(data.articles, ARTICLES_CATALOG),
    [data.articles],
  );

  const unmigratedStaticCount = useMemo(
    () => unifiedItems.filter((item) => item.origin === 'static').length,
    [unifiedItems],
  );

  const filteredItems = useMemo(
    () =>
      filterHistoricalAndCurrentNews(unifiedItems, {
        search,
        statusFilter,
        originFilter,
        categoryFilter,
        dateFilter,
        exactDate,
        nowMs,
      }),
    [unifiedItems, search, statusFilter, originFilter, categoryFilter, dateFilter, exactDate, nowMs],
  );

  function getUpdatedArticlesSnapshot(
    targetId: string,
    updatedDoc: StoredArticleDoc,
  ): StoredArticleDoc[] {
    const exists = data.articles.some((a) => a.id === targetId);
    if (exists) {
      return data.articles.map((a) => (a.id === targetId ? updatedDoc : a));
    }
    return [...data.articles, updatedDoc];
  }

  function resolveSaveMeta(item: ManagedNewsItem) {
    const existsInFirestore = data.articles.some((a) => a.id === item.doc.id);
    return {
      isNew: !existsInFirestore,
      expectedUpdatedAtMs: existsInFirestore ? extractTimestampMillis(item.doc.updatedAt) : null,
    };
  }

  async function handleExtend(item: ManagedNewsItem, additionalHours: number) {
    const art = item.doc;
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    const safeAdditionalHours = Math.max(
      1,
      Math.min(43800, Math.round(Number(additionalHours) || 24)),
    );
    setBusyId(art.id);
    try {
      const now = Date.now();
      const nextExpiry = extendDurationFromNowOrExpiry(art.expiresAtMs, safeAdditionalHours, now);
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...cleanArt } = art;
      const { isNew, expectedUpdatedAtMs } = resolveSaveMeta(item);
      const preservedPubMs =
        art.publishedAtMs ?? parseLegacyPublishedDateMs(art.publishedAt) ?? now;
      const preservedPubLabel =
        art.publishedAt || formatPublishedDateLabel(preservedPubMs);

      await saveEditorialArticle({
        articleId: art.id,
        isNew,
        previousStatus: art.status,
        expectedUpdatedAtMs,
        action: 'extend_duration',
        payload: {
          ...cleanArt,
          status: 'Published',
          verificationStatus: 'verified',
          retainedPrivate: false,
          publishedAtMs: preservedPubMs,
          publishedAt: preservedPubLabel,
          expiresAtMs: nextExpiry,
          durationHours: (art.durationHours ?? 0) + safeAdditionalHours,
          createdByUid: art.createdByUid === 'static_catalog' ? userUid : art.createdByUid,
        },
      });
      if (art.mediaId) {
        const updated = getUpdatedArticlesSnapshot(art.id, {
          ...art,
          status: 'Published',
          expiresAtMs: nextExpiry,
        });
        await syncMediaVisibilityAcrossArticles(art.mediaId, updated);
      }
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Extended "${art.enHeadline || art.title}" by ${safeAdditionalHours} hours (original publication date ${preservedPubLabel} preserved).`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to extend duration.'),
      });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  async function handleStatusTransition(
    item: ManagedNewsItem,
    targetStatus: 'Draft' | 'Retained' | 'Archived',
    actionName: 'update' | 'retain_private' | 'archive',
  ) {
    const art = item.doc;
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    setBusyId(art.id);
    try {
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...cleanArt } = art;
      const { isNew, expectedUpdatedAtMs } = resolveSaveMeta(item);
      const isPrivate = targetStatus === 'Retained' || targetStatus === 'Archived';

      await saveEditorialArticle({
        articleId: art.id,
        isNew,
        previousStatus: art.status,
        expectedUpdatedAtMs,
        action: actionName,
        payload: {
          ...cleanArt,
          status: targetStatus,
          retainedPrivate: isPrivate,
          createdByUid: art.createdByUid === 'static_catalog' ? userUid : art.createdByUid,
        },
      });

      if (art.mediaId) {
        const updated = getUpdatedArticlesSnapshot(art.id, {
          ...art,
          status: targetStatus,
          retainedPrivate: isPrivate,
        });
        await syncMediaVisibilityAcrossArticles(art.mediaId, updated);
      }

      await onRefresh();
      await onPublicContentChanged();
      const label =
        targetStatus === 'Draft'
          ? 'Unpublished to Drafts'
          : targetStatus === 'Archived'
            ? 'Archived privately'
            : 'Moved to Retained Private Archive';
      onNotify({
        tone: 'ok',
        text: `${label}: "${art.enHeadline || art.title}". Public website updated immediately.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, `Unable to move article to ${targetStatus}.`),
      });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  async function handleRestoreOrRepublish(item: ManagedNewsItem) {
    const art = item.doc;
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    setBusyId(art.id);
    try {
      const now = Date.now();
      const preset = republishPresetById[art.id] ?? art.durationPreset ?? '30d';
      const hours = resolveDurationHours(preset, art.durationHours);
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
      const { isNew, expectedUpdatedAtMs } = resolveSaveMeta(item);

      await saveEditorialArticle({
        articleId: art.id,
        isNew,
        previousStatus: art.status,
        expectedUpdatedAtMs,
        action: 'restore_article',
        payload: {
          ...cleanArt,
          status: 'Published',
          verificationStatus: 'verified',
          retainedPrivate: false,
          deletionStatus: 'none',
          durationPreset: preset,
          durationHours: hours,
          publishedAtMs: resolvedPublishedMs,
          publishedAt: resolvedPublishedLabel,
          expiresAtMs: nextExpiry,
          createdByUid: art.createdByUid === 'static_catalog' ? userUid : art.createdByUid,
        },
      });

      if (art.mediaId) {
        const updated = getUpdatedArticlesSnapshot(art.id, {
          ...art,
          status: 'Published',
          expiresAtMs: nextExpiry,
        });
        await syncMediaVisibilityAcrossArticles(art.mediaId, updated);
      }

      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Restored & republished "${art.enHeadline || art.title}" for ${hours} hours (date: ${resolvedPublishedLabel}).`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to restore article.'),
      });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  async function handleApproveDelete(item: ManagedNewsItem) {
    const art = item.doc;
    if (busyIdsRef.current.has(art.id)) return;
    busyIdsRef.current.add(art.id);
    setBusyId(art.id);
    try {
      const existsInFirestore = data.articles.some((a) => a.id === art.id);
      if (!existsInFirestore) {
        // Persist static record into Firestore first so Pending Deletion workflow (Section 8) can track and suppress it cleanly
        const { id: _id, createdAt: _ca, updatedAt: _ua, ...cleanArt } = art;
        await saveEditorialArticle({
          articleId: art.id,
          isNew: true,
          previousStatus: art.status,
          action: 'retain_private',
          payload: {
            ...cleanArt,
            status: 'Retained',
            retainedPrivate: true,
            createdByUid: userUid,
          },
        });
      }

      await approveArticleForPermanentDeletion(art);
      if (art.mediaId) {
        const updated = getUpdatedArticlesSnapshot(art.id, {
          ...art,
          status: 'Pending Deletion',
          deletionStatus: 'approved',
        });
        await syncMediaVisibilityAcrossArticles(art.mediaId, updated);
      }
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Queued "${art.enHeadline || art.title}" in Pending Deletion (Section 8) for final permanent removal.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to move to pending deletion.'),
      });
    } finally {
      busyIdsRef.current.delete(art.id);
      setBusyId(null);
    }
  }

  function handleOpenMigrationPreview() {
    const preview = buildLegacyMigrationPreview(
      ARTICLES_CATALOG,
      MEDIA_ASSETS,
      data.articles,
      data.media,
    );
    setMigrationPreview(preview);
  }

  async function handleExecuteMigration() {
    if (migrating) return;
    setMigrating(true);
    try {
      const report = await migrateLegacyStaticArticles({
        targetStatus: migrationTargetStatus,
        durationPreset: migrationDurationPreset,
      });
      setMigrationPreview(null);
      setMigrationReport(report);
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: report.errors.length > 0 ? 'err' : 'ok',
        text: `Legacy migration finished: ${report.migratedArticleIds.length} migrated, ${report.skippedArticleIds.length} skipped, ${report.registeredMediaIds.length} media registered.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Legacy article migration failed.'),
      });
    } finally {
      setMigrating(false);
    }
  }

  function renderPreviewMedia(doc: StoredArticleDoc) {
    if (doc.mediaId) {
      const payload = data.payloadMap[doc.mediaId];
      if (payload?.dataUrl) {
        return (
          <img
            src={payload.dataUrl}
            alt={doc.enHeadline || doc.title}
            style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }}
          />
        );
      }
      const fsMedia = data.media.find((m) => m.id === doc.mediaId);
      const staticMedia = MEDIA_ASSETS.find((m) => m.id === doc.mediaId);
      const poster = fsMedia?.poster || staticMedia?.posterUrl || staticMedia?.publicUrl;
      if (poster) {
        return (
          <img
            src={poster}
            alt={doc.enHeadline || doc.title}
            style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }}
          />
        );
      }
    }
    if (doc.youtubeVideoId) {
      return (
        <img
          src={`https://i.ytimg.com/vi/${doc.youtubeVideoId}/hqdefault.jpg`}
          alt={doc.youtubeTitle || doc.enHeadline || doc.title}
          style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }}
        />
      );
    }
    return null;
  }

  return (
    <div className="sb-admin-stack">
      <section className="card snap">
        <div className="sec-h">
          <div>
            <h2>Manage News — Current &amp; Historical ({filteredItems.length})</h2>
            <p className="sb-sec-sub">
              Unified control over Firestore dispatches, legacy static archive articles, edits, unpublishing,
              archiving, restoration, and deletion approval.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn ghost sb-admin-touch-btn"
              onClick={handleOpenMigrationPreview}
            >
              {unmigratedStaticCount > 0
                ? `Migrate Legacy News (${unmigratedStaticCount} Pending)`
                : 'Legacy Migration Report'}
            </button>
          </div>
        </div>

        {unmigratedStaticCount > 0 && (
          <div className="sb-note-box" style={{ marginBottom: '14px' }}>
            <strong>{unmigratedStaticCount} legacy static article(s)</strong> from the built-in catalog are ready
            for Firestore migration. You can preview &amp; migrate them all in one click, or manage/edit any single
            article directly below—static items automatically migrate safely on save without creating public duplicates.
          </div>
        )}

        {/* Primary Status Tabs */}
        <div className="sb-admin-toolbar" style={{ marginBottom: '10px' }}>
          <div className="sb-filter-tabs">
            <button
              type="button"
              className={`sb-filter-tab${statusFilter === 'all' ? ' active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All Current &amp; Historical (
              {unifiedItems.filter((i) => !isArticleInDeletionQueue(i.doc) && !isArticlePermanentlyDeleted(i.doc)).length})
            </button>
            <button
              type="button"
              className={`sb-filter-tab${statusFilter === 'live' ? ' active' : ''}`}
              onClick={() => setStatusFilter('live')}
            >
              Live Public
            </button>
            <button
              type="button"
              className={`sb-filter-tab${statusFilter === 'drafts' ? ' active' : ''}`}
              onClick={() => setStatusFilter('drafts')}
            >
              Drafts &amp; Review
            </button>
            <button
              type="button"
              className={`sb-filter-tab${statusFilter === 'historical' ? ' active' : ''}`}
              onClick={() => setStatusFilter('historical')}
            >
              Historical / Archived / Expired
            </button>
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search EN/HI headline, article ID, or slug…"
            aria-label="Search news by English headline, Hindi headline, article ID, or slug"
            className="sb-admin-search-input"
          />
        </div>

        {/* Secondary Category / Date / Origin Filters */}
        <div className="sb-form-grid" style={{ marginBottom: '14px' }}>
          <label className="sb-form-field">
            <span>Source Origin</span>
            <select
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value as ManageOriginFilter)}
              aria-label="Filter by source origin"
            >
              <option value="all">All Sources (Firestore + Legacy Static)</option>
              <option value="firestore">Firestore Records Only</option>
              <option value="static">Unmigrated Legacy Static Only</option>
            </select>
          </label>

          <label className="sb-form-field">
            <span>Category</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as NewsCategory)}
              aria-label="Filter by news category"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
          </label>

          <label className="sb-form-field">
            <span>Publication Date Range</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as ManageDateFilter)}
              aria-label="Filter by publication date range"
            >
              <option value="all">All Dates (Current + Historical)</option>
              <option value="last_7d">Last 7 Days</option>
              <option value="last_30d">Last 30 Days</option>
              <option value="older_30d">Historical (Older than 30 Days)</option>
              <option value="exact_date">Specific Date / Month (IST)</option>
            </select>
          </label>

          {dateFilter === 'exact_date' && (
            <label className="sb-form-field">
              <span>Date or Month (YYYY-MM-DD or YYYY-MM)</span>
              <input
                type="text"
                value={exactDate}
                onChange={(e) => setExactDate(e.target.value)}
                placeholder="e.g. 2026-11-17 or 2026-11"
              />
            </label>
          )}
        </div>

        {filteredItems.length > 0 ? (
          <div className="sb-admin-card-list">
            {filteredItems.map((item) => {
              const art = item.doc;
              const isStatic = item.origin === 'static';
              const isLive = isStatic
                ? art.status === 'Published' || art.status === 'Awaiting Verification'
                : isArticlePubliclyVisible(art, nowMs);
              const expired = !isStatic && isArticleExpired(art, nowMs);
              const customAdd = customHoursById[art.id] ?? 168;
              const republishPreset = republishPresetById[art.id] ?? art.durationPreset ?? '30d';
              const hasOriginalDate = Boolean(art.publishedAtMs || art.publishedAt);
              const preserveDate = preserveDateById[art.id] ?? hasOriginalDate;
              const displayDate =
                art.publishedAt ||
                (item.publishedAtMsResolved > 0
                  ? formatPublishedDateLabel(item.publishedAtMsResolved)
                  : 'Unscheduled');

              return (
                <article className="sb-admin-item-card" key={art.id}>
                  <div className="sb-admin-item-top">
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span
                        className={`pill ${
                          isLive ? 'sb-pill-teal' : 'sb-pill-muted'
                        }`}
                      >
                        {expired && art.status === 'Published' ? 'Expired' : art.status}
                      </span>
                      <span className="pill">{art.category}</span>
                      <span
                        className={`pill ${isStatic ? 'sb-pill-amber' : 'sb-pill-muted'}`}
                      >
                        {isStatic
                          ? 'Legacy Static'
                          : item.matchesLegacyCatalog
                            ? 'Firestore (Migrated Legacy)'
                            : 'Firestore'}
                      </span>
                      {art.isPaid && <span className="pill sb-pill-amber">Paid</span>}
                      {art.featuredPlacement && art.featuredPlacement !== 'none' && (
                        <span className="pill sb-pill-teal">Featured: {art.featuredPlacement}</span>
                      )}
                    </div>
                    <span className="meta">
                      {displayDate} ·{' '}
                      {isStatic
                        ? isLive
                          ? 'Live (Static Catalog)'
                          : `${art.status} (Static Catalog)`
                        : art.status === 'Published'
                          ? formatRemainingDuration(art.expiresAtMs, nowMs)
                          : art.status}
                    </span>
                  </div>

                  <h3>{art.enHeadline || art.title}</h3>
                  {art.hiHeadline && (
                    <div className="meta" style={{ marginBottom: '4px' }}>
                      {art.hiHeadline}
                    </div>
                  )}
                  <div className="meta" style={{ marginBottom: '10px', fontSize: '12px' }}>
                    ID: <code>{art.id}</code> · Slug: <code>{art.slug}</code>
                    {art.sourceName ? ` · Source: ${art.sourceName}` : ''}
                  </div>

                  <div className="sb-admin-item-actions">
                    <button
                      type="button"
                      className="btn ghost sb-admin-touch-btn"
                      onClick={() => {
                        setPreviewItem(item);
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

                    {isLive && (
                      <>
                        <button
                          type="button"
                          className="btn ghost sb-admin-touch-btn"
                          disabled={busyId === art.id}
                          onClick={() => void handleExtend(item, 24 * 7)}
                        >
                          +7d
                        </button>
                        <button
                          type="button"
                          className="btn ghost sb-admin-touch-btn"
                          disabled={busyId === art.id}
                          onClick={() => void handleExtend(item, 24 * 15)}
                        >
                          +15d
                        </button>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input
                            type="number"
                            min={1}
                            max={43800}
                            value={customAdd}
                            onChange={(e) =>
                              setCustomHoursById((prev) => ({
                                ...prev,
                                [art.id]: Number(e.target.value) || 24,
                              }))
                            }
                            aria-label={`Custom extension hours for ${art.id}`}
                            style={{ width: '74px', padding: '6px 8px' }}
                          />
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={busyId === art.id}
                            onClick={() => void handleExtend(item, customAdd)}
                          >
                            +Hours
                          </button>
                        </div>
                      </>
                    )}

                    {art.status !== 'Draft' && (
                      <button
                        type="button"
                        className="btn ghost sb-admin-touch-btn"
                        disabled={busyId === art.id}
                        onClick={() => void handleStatusTransition(item, 'Draft', 'update')}
                      >
                        Unpublish (Draft)
                      </button>
                    )}

                    {art.status !== 'Retained' && (
                      <button
                        type="button"
                        className="btn ghost sb-admin-touch-btn"
                        disabled={busyId === art.id}
                        onClick={() => void handleStatusTransition(item, 'Retained', 'retain_private')}
                      >
                        Make Private
                      </button>
                    )}

                    {art.status !== 'Archived' && (
                      <button
                        type="button"
                        className="btn ghost sb-admin-touch-btn"
                        disabled={busyId === art.id}
                        onClick={() => void handleStatusTransition(item, 'Archived', 'archive')}
                      >
                        Archive
                      </button>
                    )}

                    {!isLive && (
                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <select
                          value={republishPreset}
                          onChange={(e) =>
                            setRepublishPresetById((prev) => ({
                              ...prev,
                              [art.id]: e.target.value as DurationPreset,
                            }))
                          }
                          aria-label={`Republish duration for ${art.id}`}
                        >
                          <option value="7d">7 Days</option>
                          <option value="15d">15 Days</option>
                          <option value="30d">30 Days</option>
                          <option value="60d">60 Days</option>
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
                          onClick={() => void handleRestoreOrRepublish(item)}
                        >
                          Restore &amp; Publish
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn ghost sb-admin-touch-btn"
                      style={{ color: 'var(--down)' }}
                      disabled={busyId === art.id}
                      onClick={() => void handleApproveDelete(item)}
                    >
                      Queue Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="meta" style={{ margin: '12px 0 0' }}>
            No articles match your active search or filters. Clear filters or create a bilingual dispatch in the News Desk.
          </p>
        )}
      </section>

      {/* Bilingual Reader Preview Modal */}
      {previewItem && (
        <div
          className="sb-admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Historical & Current Article Preview"
        >
          <div className="card snap sb-admin-modal">
            <div className="sec-h">
              <div>
                <h2 style={{ margin: 0 }}>Article Preview</h2>
                <div className="meta">
                  ID: <code>{previewItem.doc.id}</code> · Slug: <code>{previewItem.doc.slug}</code> ·{' '}
                  {previewItem.origin === 'static' ? 'Legacy Static' : 'Firestore'}
                </div>
              </div>
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
                    onEditArticle(previewItem.doc);
                    setPreviewItem(null);
                  }}
                >
                  Edit in News Desk
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setPreviewItem(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="sb-story-meta-row" style={{ marginBottom: '10px' }}>
              <span className="cat">{previewItem.doc.category}</span>
              <span className="pill sb-pill-muted">{previewItem.doc.status}</span>
              <span className="meta">
                Published: {previewItem.doc.publishedAt || toIstIsoDateInput(previewItem.publishedAtMsResolved)}
              </span>
              {previewItem.doc.isPaid && (
                <span className="pill sb-pill-amber">
                  {previewItem.doc.paidDisclosureLabel || 'Partner Disclosure'}
                </span>
              )}
            </div>

            <h3 style={{ font: '700 24px var(--serif)', margin: '0 0 8px' }}>
              {previewLang === 'hi'
                ? previewItem.doc.hiHeadline || '(हिंदी शीर्षक उपलब्ध नहीं)'
                : previewItem.doc.enHeadline || previewItem.doc.title}
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '15px', margin: '0 0 14px' }}>
              {previewLang === 'hi'
                ? previewItem.doc.hiSummary || '(हिंदी सारांश उपलब्ध नहीं)'
                : previewItem.doc.enSummary || previewItem.doc.summary}
            </p>

            {renderPreviewMedia(previewItem.doc)}

            <div style={{ display: 'grid', gap: '12px', lineHeight: 1.65 }}>
              {parseBodyToSections(
                previewLang === 'hi'
                  ? previewItem.doc.hiBody
                  : previewItem.doc.enBody || previewItem.doc.body,
                previewLang === 'hi'
                  ? previewItem.doc.hiSummary
                  : previewItem.doc.enSummary || previewItem.doc.summary,
                previewLang === 'hi' ? 'संपादकीय रिपोर्ट' : 'Editorial Dispatch',
              ).map((sec, idx) => (
                <div key={`${sec.heading}-${idx}`}>
                  <h4 style={{ margin: '0 0 6px', fontSize: '16px' }}>{sec.heading}</h4>
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

      {/* Dry-Run Legacy Migration Preview Modal */}
      {migrationPreview && (
        <div
          className="sb-admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Legacy News Migration Preview"
        >
          <div className="card snap sb-admin-modal" style={{ maxWidth: '820px' }}>
            <div className="sec-h">
              <div>
                <h2 style={{ margin: 0 }}>Legacy News Migration Preview</h2>
                <p className="sb-sec-sub">
                  Idempotent transfer of built-in static articles into Firestore while strictly preserving IDs,
                  slugs, and original publication dates. Zero duplicate public entries will be created.
                </p>
              </div>
              <button
                type="button"
                className="btn ghost"
                disabled={migrating}
                onClick={() => setMigrationPreview(null)}
              >
                Close
              </button>
            </div>

            <div className="sb-admin-kpi-grid" style={{ marginBottom: '14px' }}>
              <div className="sb-admin-kpi">
                <b>{migrationPreview.totalStaticArticles}</b>
                <span>Total Static Catalog</span>
              </div>
              <div className="sb-admin-kpi">
                <b>{migrationPreview.readyCount}</b>
                <span>Ready to Migrate</span>
              </div>
              <div className="sb-admin-kpi">
                <b>{migrationPreview.blockedFromPublishCount}</b>
                <span>Held From Auto-Publish</span>
              </div>
              <div className="sb-admin-kpi">
                <b>{migrationPreview.alreadyMigratedCount}</b>
                <span>Already in Firestore</span>
              </div>
              <div className="sb-admin-kpi">
                <b>{migrationPreview.conflictCount}</b>
                <span>Slug Conflicts</span>
              </div>
            </div>

            {migrationPreview.blockedFromPublishCount > 0 && (
              <div className="sb-note-box" style={{ marginBottom: '14px' }}>
                <strong>Safe Migration Gate Active:</strong>{' '}
                {migrationPreview.blockedFromPublishCount} ready legacy article(s) have{' '}
                <code>awaiting_verification</code> status or lack complete English/Hindi body sections
                (<code>sectionsHi</code>). Even if you choose &ldquo;Published&rdquo;, those records will be
                safely downgraded to <strong>Awaiting Verification</strong> or <strong>Draft</strong> until an
                editor reviews them.
              </div>
            )}

            <div className="sb-form-grid" style={{ marginBottom: '14px' }}>
              <label className="sb-form-field">
                <span>Initial Status for Migrated Records</span>
                <select
                  value={migrationTargetStatus}
                  onChange={(e) =>
                    setMigrationTargetStatus(e.target.value as EditorialWorkflowStatus)
                  }
                >
                  <option value="Draft">Draft (Safe Default — Hold for Review)</option>
                  <option value="Retained">Retained (Private Archive)</option>
                  <option value="Archived">Archived (Private Historical)</option>
                  <option value="Published">Published (Verified Bilingual Items Only)</option>
                </select>
              </label>
              <label className="sb-form-field">
                <span>Active Window (if Published)</span>
                <select
                  value={migrationDurationPreset}
                  onChange={(e) => setMigrationDurationPreset(e.target.value as DurationPreset)}
                >
                  <option value="60d">60 Days (1,440h)</option>
                  <option value="30d">30 Days (720h)</option>
                  <option value="15d">15 Days (360h)</option>
                  <option value="7d">7 Days (168h)</option>
                </select>
              </label>
            </div>

            <div className="sb-admin-list" style={{ maxHeight: '320px', overflowY: 'auto', marginBottom: '14px' }}>
              {migrationPreview.items.map((item) => (
                <div className="sb-admin-list-row" key={item.articleId}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                      <span
                        className={`pill ${
                          item.action === 'migrate'
                            ? 'sb-pill-teal'
                            : item.action === 'slug_conflict'
                              ? 'sb-pill-amber'
                              : 'sb-pill-muted'
                        }`}
                      >
                        {item.action === 'migrate'
                          ? 'Migrate'
                          : item.action === 'already_in_firestore'
                            ? 'Already Migrated'
                            : 'Slug Conflict'}
                      </span>
                      <span className="pill">{item.category}</span>
                      {item.verificationStatus === 'awaiting_verification' && (
                        <span className="pill sb-pill-amber">Awaiting Verification</span>
                      )}
                      {item.hindiBodySeededFromDeck && (
                        <span className="pill sb-pill-muted">HI seeded (Needs full HI)</span>
                      )}
                      {!item.publishSafety.completeEn && (
                        <span className="pill sb-pill-amber">Incomplete EN</span>
                      )}
                      {item.publishSafety.missingMedia && (
                        <span className="pill sb-pill-amber">Missing Media</span>
                      )}
                      {migrationTargetStatus === 'Published' &&
                        item.action === 'migrate' &&
                        !item.publishSafety.canSafelyPublish && (
                          <span className="pill sb-pill-amber">
                            Coerced to {item.publishSafety.resultingStatusIfPublished}
                          </span>
                        )}
                    </div>
                    <strong>{item.headline}</strong>
                    <div className="meta">
                      ID: <code>{item.articleId}</code> · Slug: <code>{item.slug}</code> · Date:{' '}
                      {item.publishedAt}
                    </div>
                    <div className="meta">{item.reason}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn ghost sb-admin-touch-btn"
                disabled={migrating}
                onClick={() => setMigrationPreview(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn sb-admin-touch-btn"
                disabled={migrating || migrationPreview.readyCount === 0}
                onClick={() => void handleExecuteMigration()}
              >
                {migrating
                  ? 'Migrating Historical News…'
                  : `Run Safe Migration (${migrationPreview.readyCount} Articles)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Migration Report Modal */}
      {migrationReport && (
        <div
          className="sb-admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Legacy News Migration Report"
        >
          <div className="card snap sb-admin-modal" style={{ maxWidth: '640px' }}>
            <div className="sec-h">
              <h2>Migration Report</h2>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setMigrationReport(null)}
              >
                Close
              </button>
            </div>

            <div className="sb-note-box" style={{ marginBottom: '12px' }}>
              <div>
                <strong>Migrated articles:</strong> {migrationReport.migratedArticleIds.length} (status:{' '}
                {migrationReport.targetStatus})
              </div>
              <div>
                <strong>Skipped (already present / conflict):</strong>{' '}
                {migrationReport.skippedArticleIds.length}
              </div>
              <div>
                <strong>Registered legacy media records:</strong>{' '}
                {migrationReport.registeredMediaIds.length}
              </div>
              <div>
                <strong>Completed at:</strong> {migrationReport.completedAt}
              </div>
            </div>

            {migrationReport.migratedArticleIds.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <strong>Migrated IDs:</strong>
                <div className="meta" style={{ wordBreak: 'break-word', marginTop: '4px' }}>
                  {migrationReport.migratedArticleIds.join(', ')}
                </div>
              </div>
            )}

            {migrationReport.downgradedItems && migrationReport.downgradedItems.length > 0 && (
              <div className="sb-note-box" style={{ marginBottom: '12px' }}>
                <strong>
                  Held From Auto-Publish ({migrationReport.downgradedItems.length}):
                </strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                  {migrationReport.downgradedItems.map((d) => (
                    <li key={d.id} style={{ marginBottom: '4px' }}>
                      <code>{d.id}</code> → saved as <strong>{d.resultingStatus}</strong> (
                      {d.reasons.join(' ')})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {migrationReport.errors.length > 0 && (
              <div className="sb-admin-alert err" style={{ marginBottom: '12px' }}>
                {migrationReport.errors.join(' | ')}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn sb-admin-touch-btn"
                onClick={() => setMigrationReport(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
