import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { MEDIA_ASSETS } from '../../data/editorialData';
import {
  saveCompressedPhotoAsset,
  saveEditorialArticle,
  saveYouTubeMediaAsset,
  syncMediaVisibilityAcrossArticles,
} from '../../lib/firebase';
import type {
  DurationPreset,
  EditorialWorkflowStatus,
  FeaturedPlacement,
  NewsCategory,
  StoredArticleDoc,
} from '../../types/sakarbazaar';
import {
  formatPublishedDateLabel,
  parseLegacyPublishedDateMs,
  toIstIsoDateInput,
} from '../../utils/historicalNews';
import {
  compressImageFileInBrowser,
  parseYouTubeVideoUrl,
} from '../../utils/mediaLibrary';
import {
  applyMinorEditPreservingExpiry,
  computeExpiresAtMs,
  extractReadableErrorMessage,
  extractTimestampMillis,
  formatRemainingDuration,
  isDeletionQueueEditLocked,
  resolveDurationHours,
  sanitizeArticleSlug,
  validateArticleDraftInput,
  validateArticlePublishInput,
} from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

const CATEGORIES: Exclude<NewsCategory, 'All'>[] = [
  'Markets',
  'IPO',
  'Corporate',
  'Economy',
  'RBI',
  'Banking',
  'Technology',
  'Personal finance',
];

interface AdminNewsDeskProps extends AdminSectionBaseProps {
  editingArticle: StoredArticleDoc | null;
  onClearEditing: () => void;
  onPublicContentChanged: () => Promise<void>;
}

export function AdminNewsDesk({
  data,
  userUid,
  editingArticle,
  onClearEditing,
  onRefresh,
  onPublicContentChanged,
  onNotify,
}: AdminNewsDeskProps) {
  const [composerLangTab, setComposerLangTab] = useState<'both' | 'en' | 'hi'>('both');
  const [category, setCategory] = useState<Exclude<NewsCategory, 'All'>>('Markets');
  const [author, setAuthor] = useState('SakarBazaar Editorial Desk');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  const [enHeadline, setEnHeadline] = useState('');
  const [enSummary, setEnSummary] = useState('');
  const [enBody, setEnBody] = useState('');

  const [hiHeadline, setHiHeadline] = useState('');
  const [hiSummary, setHiSummary] = useState('');
  const [hiBody, setHiBody] = useState('');

  const [durationPreset, setDurationPreset] = useState<DurationPreset>(
    data.systemSettings.defaultDurationPreset || '15d',
  );
  const [durationTouched, setDurationTouched] = useState(false);
  const [customHours, setCustomHours] = useState<number>(72);
  const [publishedDateMode, setPublishedDateMode] = useState<'preserve' | 'today'>('today');
  const [publishedDateIso, setPublishedDateIso] = useState<string>(() => toIstIsoDateInput(Date.now()));
  const [featuredPlacement, setFeaturedPlacement] = useState<FeaturedPlacement>('none');
  const [isPaid, setIsPaid] = useState(false);
  const [paidDisclosureLabel, setPaidDisclosureLabel] = useState('Partner Disclosure');

  // Photo or YouTube attachment inside composer
  const [mediaMode, setMediaMode] = useState<'none' | 'existing' | 'photo' | 'youtube'>('none');
  const [selectedExistingMediaId, setSelectedExistingMediaId] = useState('');

  // Compressed photo upload state
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoMime, setPhotoMime] = useState<'image/jpeg' | 'image/webp'>('image/jpeg');
  const [photoFileName, setPhotoFileName] = useState('');
  const [photoWidth, setPhotoWidth] = useState(0);
  const [photoHeight, setPhotoHeight] = useState(0);
  const [photoSizeBytes, setPhotoSizeBytes] = useState(0);
  const [photoOriginalBytes, setPhotoOriginalBytes] = useState(0);
  const [mediaCredit, setMediaCredit] = useState('');
  const [usageRightsConfirmed, setUsageRightsConfirmed] = useState(false);
  const [compressing, setCompressing] = useState(false);

  // YouTube input state
  const [youtubeInput, setYoutubeInput] = useState('');
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const parsedYouTube = parseYouTubeVideoUrl(youtubeInput);

  // Preview & Publish confirmation modals
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLang, setPreviewLang] = useState<'en' | 'hi'>('en');
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Synchronous submit + idempotency + optimistic version guards
  const savingRef = useRef(false);
  const pendingArticleIdRef = useRef<string | null>(null);
  const editingUpdatedAtMsRef = useRef<number | null>(null);
  const uploadedPhotoRef = useRef<{ signature: string; mediaId: string } | null>(null);

  const reusableMediaOptions = useMemo(() => {
    const seen = new Set(data.media.map((m) => m.id));
    const merged = [
      ...data.media.map((m) => ({
        id: m.id,
        label: `${m.fileName} (${m.mediaType}) — ${m.credit || 'No credit'}`,
      })),
      ...MEDIA_ASSETS.filter((m) => !seen.has(m.id)).map((m) => ({
        id: m.id,
        label: `${m.fileName} (${m.mediaType}, Legacy Bundled) — ${m.credit || m.sourceNote || 'Editorial'}`,
      })),
    ];
    return merged;
  }, [data.media]);

  useEffect(() => {
    if (!editingArticle && !durationTouched && data.systemSettings.defaultDurationPreset) {
      setDurationPreset(data.systemSettings.defaultDurationPreset);
    }
  }, [editingArticle, durationTouched, data.systemSettings.defaultDurationPreset]);

  useEffect(() => {
    if (!editingArticle) return;
    pendingArticleIdRef.current = editingArticle.id;
    editingUpdatedAtMsRef.current = extractTimestampMillis(editingArticle.updatedAt);
    uploadedPhotoRef.current = null;
    setCategory(editingArticle.category);
    setAuthor(editingArticle.author || 'SakarBazaar Editorial Desk');
    setSourceName(editingArticle.sourceName || '');
    setSourceUrl(editingArticle.sourceUrl || '');
    setEnHeadline(editingArticle.enHeadline || editingArticle.title || '');
    setEnSummary(editingArticle.enSummary || editingArticle.summary || '');
    setEnBody(editingArticle.enBody || editingArticle.body || '');
    setHiHeadline(editingArticle.hiHeadline || '');
    setHiSummary(editingArticle.hiSummary || '');
    setHiBody(editingArticle.hiBody || '');
    setDurationPreset(editingArticle.durationPreset || '15d');
    setDurationTouched(true);
    setCustomHours(editingArticle.durationHours || 72);
    const hasOriginalDate = Boolean(editingArticle.publishedAtMs || editingArticle.publishedAt);
    setPublishedDateMode(hasOriginalDate ? 'preserve' : 'today');
    setPublishedDateIso(
      toIstIsoDateInput(editingArticle.publishedAtMs, editingArticle.publishedAt) ||
        toIstIsoDateInput(Date.now()),
    );
    setFeaturedPlacement(editingArticle.featuredPlacement || 'none');
    setIsPaid(Boolean(editingArticle.isPaid));
    setPaidDisclosureLabel(editingArticle.paidDisclosureLabel || 'Partner Disclosure');

    setPhotoDataUrl('');
    setPhotoFileName('');
    setPhotoSizeBytes(0);
    setPhotoOriginalBytes(0);
    setMediaCredit('');
    setUsageRightsConfirmed(false);

    if (editingArticle.mediaId) {
      setMediaMode('existing');
      setSelectedExistingMediaId(editingArticle.mediaId);
      setYoutubeInput(editingArticle.youtubeUrl || editingArticle.youtubeVideoId || '');
      setYoutubeTitle(editingArticle.youtubeTitle || '');
    } else if (editingArticle.youtubeUrl || editingArticle.youtubeVideoId) {
      setMediaMode('youtube');
      setSelectedExistingMediaId('');
      setYoutubeInput(editingArticle.youtubeUrl || editingArticle.youtubeVideoId || '');
      setYoutubeTitle(editingArticle.youtubeTitle || '');
    } else {
      setMediaMode('none');
      setSelectedExistingMediaId('');
      setYoutubeInput('');
      setYoutubeTitle('');
    }
    setLocalError(null);
  }, [editingArticle]);

  function resetComposer() {
    onClearEditing();
    pendingArticleIdRef.current = null;
    editingUpdatedAtMsRef.current = null;
    uploadedPhotoRef.current = null;
    setCategory('Markets');
    setAuthor('SakarBazaar Editorial Desk');
    setSourceName('');
    setSourceUrl('');
    setEnHeadline('');
    setEnSummary('');
    setEnBody('');
    setHiHeadline('');
    setHiSummary('');
    setHiBody('');
    setDurationPreset(data.systemSettings.defaultDurationPreset || '15d');
    setDurationTouched(false);
    setCustomHours(72);
    setPublishedDateMode('today');
    setPublishedDateIso(toIstIsoDateInput(Date.now()));
    setFeaturedPlacement('none');
    setIsPaid(false);
    setPaidDisclosureLabel('Partner Disclosure');
    setMediaMode('none');
    setSelectedExistingMediaId('');
    setPhotoDataUrl('');
    setPhotoFileName('');
    setPhotoSizeBytes(0);
    setPhotoOriginalBytes(0);
    setMediaCredit('');
    setUsageRightsConfirmed(false);
    setYoutubeInput('');
    setYoutubeTitle('');
    setLocalError(null);
  }

  async function handlePhotoFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalError(null);
    setCompressing(true);
    setPhotoOriginalBytes(file.size);
    try {
      const compressed = await compressImageFileInBrowser(file, {
        targetBytes: data.systemSettings.maxImageSizeBytes || 180_000,
      });
      uploadedPhotoRef.current = null;
      setPhotoDataUrl(compressed.dataUrl);
      setPhotoMime(compressed.mimeType);
      setPhotoWidth(compressed.width);
      setPhotoHeight(compressed.height);
      setPhotoSizeBytes(compressed.sizeBytes);
      setPhotoFileName(file.name.replace(/\.[^.]+$/, '') + '.jpg');
      setMediaMode('photo');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to compress photograph.');
    } finally {
      setCompressing(false);
    }
  }

  function validateBeforeAction(targetMode: 'draft' | 'minor_edit' | 'publish'): string | null {
    if (author.trim().length < 2 || author.trim().length > 120) {
      return 'Author / Byline must be between 2 and 120 characters.';
    }
    if (targetMode === 'publish') {
      const publishCheck = validateArticlePublishInput({
        enHeadline,
        enSummary,
        enBody,
        hiHeadline,
        hiSummary,
        hiBody,
        sourceName,
        sourceUrl,
        durationPreset,
        customHours,
      });
      if (!publishCheck.valid) {
        return publishCheck.errors.join(' ');
      }
    } else {
      const draftCheck = validateArticleDraftInput({
        enHeadline,
        enSummary,
        enBody,
        hiHeadline,
        hiSummary,
        hiBody,
        sourceName,
        sourceUrl,
        durationPreset,
        customHours,
      });
      if (!draftCheck.valid) {
        return draftCheck.errors.join(' ');
      }
    }

    if (mediaMode === 'photo' && photoDataUrl && (!mediaCredit.trim() || !usageRightsConfirmed)) {
      return 'Please enter photographer/source credit and confirm usage rights before saving an uploaded photograph.';
    }
    if (mediaMode === 'youtube' && youtubeInput.trim() && !parsedYouTube) {
      return 'Enter a valid YouTube video URL or 11-character YouTube video ID.';
    }
    if (mediaMode === 'existing' && !selectedExistingMediaId) {
      return 'Select an existing asset from the Media Library or switch media mode to No Media.';
    }
    return null;
  }

  const isEditLocked = editingArticle ? isDeletionQueueEditLocked(editingArticle) : false;

  async function executeSave(targetMode: 'draft' | 'minor_edit' | 'publish') {
    if (savingRef.current || saving) return;
    if (editingArticle && isDeletionQueueEditLocked(editingArticle)) {
      const lockMsg =
        'This article is currently in Pending Deletion. Cancel deletion in Section 8 first before saving edits or republishing.';
      setLocalError(lockMsg);
      onNotify({ tone: 'err', text: lockMsg });
      return;
    }
    setLocalError(null);

    const validationError = validateBeforeAction(targetMode);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const baseSlug = sanitizeArticleSlug(enHeadline || hiHeadline, 'dispatch');
      if (!pendingArticleIdRef.current) {
        pendingArticleIdRef.current =
          editingArticle?.id || `${baseSlug.slice(0, 90)}-${Date.now().toString(36)}`;
      }
      const articleId = pendingArticleIdRef.current;
      // Check authoritative Firestore presence (an unmigrated static article has editingArticle set, but !existsInFirestore)
      const existsInFirestore = data.articles.some((a) => a.id === articleId);
      const isNew = !existsInFirestore;
      const slug = editingArticle?.slug
        ? sanitizeArticleSlug(editingArticle.slug, 'dispatch')
        : baseSlug.slice(0, 140);

      const nowMs = Date.now();
      const resolvedHours = resolveDurationHours(durationPreset, customHours);
      const parsedHistoricalMs = parseLegacyPublishedDateMs(publishedDateIso);
      const originalDateIso = editingArticle
        ? toIstIsoDateInput(editingArticle.publishedAtMs, editingArticle.publishedAt)
        : '';

      let nextStatus: EditorialWorkflowStatus = editingArticle?.status || 'Draft';
      let publishedAt = editingArticle?.publishedAt;
      let publishedAtMs = editingArticle?.publishedAtMs ?? null;
      let expiresAtMs = editingArticle?.expiresAtMs ?? null;
      let finalPreset = durationPreset;
      let finalHours = resolvedHours;
      let nextRetainedPrivate = Boolean(editingArticle?.retainedPrivate);

      if (targetMode === 'publish') {
        nextStatus = 'Published';
        nextRetainedPrivate = false;
        if (publishedDateMode === 'preserve' && parsedHistoricalMs !== null) {
          if (editingArticle && publishedDateIso === originalDateIso && editingArticle.publishedAt) {
            publishedAt = editingArticle.publishedAt;
            publishedAtMs = editingArticle.publishedAtMs ?? parsedHistoricalMs;
          } else {
            publishedAtMs = parsedHistoricalMs;
            publishedAt = formatPublishedDateLabel(parsedHistoricalMs);
          }
        } else {
          publishedAtMs = nowMs;
          publishedAt = formatPublishedDateLabel(nowMs);
        }
        expiresAtMs = computeExpiresAtMs(nowMs, resolvedHours);
      } else if (targetMode === 'minor_edit' && editingArticle) {
        // Minor corrections strictly preserve ID, slug, status, publishedAt, publishedAtMs, duration, and existing expiry!
        const preserved = applyMinorEditPreservingExpiry(editingArticle, {});
        nextStatus = editingArticle.status || 'Published';
        publishedAt =
          preserved.publishedAt ||
          (preserved.publishedAtMs ? formatPublishedDateLabel(preserved.publishedAtMs) : undefined);
        publishedAtMs = preserved.publishedAtMs ?? parsedHistoricalMs ?? null;
        expiresAtMs = preserved.expiresAtMs ?? null;
        finalPreset = preserved.durationPreset || durationPreset;
        finalHours = preserved.durationHours || resolvedHours;
      } else {
        nextStatus = 'Draft';
        nextRetainedPrivate = false;
        if (publishedDateMode === 'preserve' && parsedHistoricalMs !== null && editingArticle) {
          publishedAtMs = parsedHistoricalMs;
          publishedAt =
            publishedDateIso === originalDateIso && editingArticle.publishedAt
              ? editingArticle.publishedAt
              : formatPublishedDateLabel(parsedHistoricalMs);
        }
      }

      // Save attached media first if new photo or YouTube asset, reusing mediaId on retries
      let finalMediaId = mediaMode === 'existing' ? selectedExistingMediaId : undefined;
      let finalYoutubeUrl: string | undefined;
      let finalYoutubeId: string | undefined;
      let finalYoutubeTitle: string | undefined;

      const mediaIsPublic = nextStatus === 'Published';

      if (mediaMode === 'photo' && photoDataUrl) {
        const photoSig = `${photoFileName}:${photoSizeBytes}:${photoDataUrl.slice(0, 64)}`;
        const alreadyUploaded =
          uploadedPhotoRef.current?.signature === photoSig ? uploadedPhotoRef.current.mediaId : null;
        const targetMediaId =
          alreadyUploaded || `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

        await saveCompressedPhotoAsset({
          mediaId: targetMediaId,
          fileName: photoFileName || `${targetMediaId}.jpg`,
          mimeType: photoMime,
          dataUrl: photoDataUrl,
          sizeBytes: photoSizeBytes,
          width: photoWidth,
          height: photoHeight,
          credit: mediaCredit.trim(),
          usageRightsConfirmed,
          captions: (enSummary.trim() || enHeadline.trim()).slice(0, 1200),
          isPublic: mediaIsPublic,
          expiresAtMs,
          associatedArticleIds: [articleId],
          isUpdate: Boolean(alreadyUploaded),
        });
        uploadedPhotoRef.current = { signature: photoSig, mediaId: targetMediaId };
        finalMediaId = targetMediaId;
      } else if (mediaMode === 'youtube' && parsedYouTube) {
        const ytMediaId = `yt_${parsedYouTube.videoId}`;
        finalYoutubeUrl = parsedYouTube.canonicalUrl;
        finalYoutubeId = parsedYouTube.videoId;
        finalYoutubeTitle = (youtubeTitle.trim() || enHeadline.trim() || 'SakarBazaar Video Report').slice(0, 200);
        await saveYouTubeMediaAsset({
          mediaId: ytMediaId,
          youtubeUrl: parsedYouTube.canonicalUrl,
          youtubeVideoId: parsedYouTube.videoId,
          title: finalYoutubeTitle,
          credit: (mediaCredit.trim() || 'SakarBazaar YouTube Channel').slice(0, 200),
          usageRightsConfirmed: true,
          isPublic: mediaIsPublic,
          expiresAtMs,
          associatedArticleIds: [articleId],
        });
        finalMediaId = ytMediaId;
      }

      const cleanEnSummary = (enSummary.trim() || enBody.trim().slice(0, 200)).slice(0, 1200);
      const cleanHiSummary = (hiSummary.trim() || hiBody.trim().slice(0, 200)).slice(0, 1200);

      await saveEditorialArticle({
        articleId,
        isNew,
        previousStatus: editingArticle?.status,
        expectedUpdatedAtMs: isNew ? null : editingUpdatedAtMsRef.current,
        action:
          targetMode === 'publish'
            ? 'publish'
            : isNew
              ? 'create_draft'
              : 'update',
        payload: {
          title: (enHeadline.trim() || hiHeadline.trim()).slice(0, 250),
          slug,
          summary: (cleanEnSummary || cleanHiSummary).slice(0, 1100),
          body: (enBody.trim() || hiBody.trim()).slice(0, 24000),
          enHeadline: enHeadline.trim().slice(0, 260),
          enSummary: cleanEnSummary,
          enBody: enBody.trim().slice(0, 25000),
          hiHeadline: hiHeadline.trim().slice(0, 260),
          hiSummary: cleanHiSummary,
          hiBody: hiBody.trim().slice(0, 25000),
          category,
          tags: [category],
          keywords: [category, enHeadline.split(/\s+/)[0] || 'India'].filter(Boolean).slice(0, 20),
          entities: [],
          author: author.trim().slice(0, 120) || 'SakarBazaar Editorial Desk',
          status: nextStatus,
          verificationStatus:
            nextStatus === 'Published'
              ? 'verified'
              : targetMode === 'minor_edit' && editingArticle?.verificationStatus
                ? editingArticle.verificationStatus
                : 'awaiting_verification',
          sourceName: sourceName.trim().slice(0, 160),
          sourceUrl: sourceUrl.trim().slice(0, 500),
          mediaId: finalMediaId || '',
          youtubeUrl: finalYoutubeUrl ? finalYoutubeUrl.slice(0, 300) : '',
          youtubeVideoId: finalYoutubeId ? finalYoutubeId.slice(0, 32) : '',
          youtubeTitle: finalYoutubeTitle ? finalYoutubeTitle.slice(0, 200) : '',
          language: enHeadline.trim() && hiHeadline.trim() ? 'bilingual' : hiHeadline.trim() ? 'hi' : 'en',
          durationPreset: finalPreset,
          durationHours: finalHours,
          publishedAt,
          publishedAtMs,
          expiresAtMs,
          retainedPrivate: nextRetainedPrivate,
          featuredPlacement,
          featuredOrder: featuredPlacement === 'main' ? 0 : featuredPlacement === 'secondary' ? 1 : 99,
          isPaid,
          paidDisclosureLabel: isPaid ? paidDisclosureLabel.trim().slice(0, 64) || 'Partner Disclosure' : '',
          deletionStatus: 'none',
          createdByUid:
            editingArticle?.createdByUid && editingArticle.createdByUid !== 'static_catalog'
              ? editingArticle.createdByUid
              : userUid,
        },
      });

      const previousMediaId = editingArticle?.mediaId;
      const virtualUpdated = data.articles.some((a) => a.id === articleId)
        ? data.articles.map((a) =>
            a.id === articleId
              ? { ...a, mediaId: finalMediaId || '', status: nextStatus, expiresAtMs }
              : a,
          )
        : [
            ...data.articles,
            {
              id: articleId,
              mediaId: finalMediaId || '',
              status: nextStatus,
              expiresAtMs,
            } as StoredArticleDoc,
          ];

      if (finalMediaId) {
        await syncMediaVisibilityAcrossArticles(finalMediaId, virtualUpdated);
      }
      if (previousMediaId && previousMediaId !== finalMediaId) {
        await syncMediaVisibilityAcrossArticles(previousMediaId, virtualUpdated);
      }

      setConfirmPublishOpen(false);
      await onRefresh();
      await onPublicContentChanged();

      onNotify({
        tone: 'ok',
        text:
          targetMode === 'publish'
            ? `Published bilingual article "${enHeadline.trim()}" (expires in ${finalHours} hours).`
            : targetMode === 'minor_edit'
              ? `Updated article "${enHeadline.trim() || hiHeadline.trim()}" while keeping original publication duration unchanged.`
              : `Saved draft "${enHeadline.trim() || hiHeadline.trim()}".`,
      });
      if (targetMode === 'publish') {
        resetComposer();
      } else {
        // Advance our local baseline so consecutive draft saves from this session succeed cleanly
        editingUpdatedAtMsRef.current = Date.now() + 2_000;
      }
    } catch (err) {
      const msg = extractReadableErrorMessage(
        err,
        'Unable to publish or save article. Entered form fields have been preserved.',
      );
      setLocalError(msg);
      onNotify({ tone: 'err', text: msg });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="sb-admin-stack">
      <section className="card snap">
        <div className="sec-h">
          <div>
            <h2>{editingArticle ? 'Edit Bilingual Article' : 'News Desk · Bilingual Composer'}</h2>
            <p className="sb-sec-sub">
              One shared article record holds both English and Hindi versions with synchronized duration.
              Source attribution and Source URL are strictly optional.
            </p>
          </div>
          {editingArticle && (
            <button type="button" className="btn ghost sb-admin-touch-btn" onClick={resetComposer}>
              + Start Fresh Article
            </button>
          )}
        </div>

        {isEditLocked && editingArticle && (
          <div className="sb-admin-alert err" role="alert" style={{ marginBottom: '14px' }}>
            <strong>Deletion Queue Edit Lock Active ({editingArticle.status}):</strong> This article is queued for
            deletion (<code>{editingArticle.deletionStatus || 'pending_approval'}</code>) and cannot be edited or
            republished from News Desk. Cancel deletion in <strong>8. Pending Deletion</strong> first.
          </div>
        )}

        {editingArticle?.status === 'Published' && !isEditLocked && (
          <div className="sb-note-box" style={{ marginBottom: '14px' }}>
            <strong>Minor edit protection active:</strong> Saving minor edits keeps the current expiry
            countdown (<strong>{formatRemainingDuration(editingArticle.expiresAtMs)}</strong>)
            intact. To add hours or days, use <strong>Manage News → Extend Duration</strong>.
          </div>
        )}

        {localError && (
          <div className="sb-admin-alert err" role="alert" style={{ marginBottom: '14px' }}>
            {localError}
          </div>
        )}

        {/* Top metadata row */}
        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Exclude<NewsCategory, 'All'>)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="sb-form-field">
            <span>Author / Byline</span>
            <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Source Name (Optional)</span>
            <input
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="Leave blank if original reporting"
            />
          </label>
          <label className="sb-form-field">
            <span>Source URL (Optional)</span>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="Optional https://..."
            />
          </label>
        </div>

        {/* Language view switcher for smaller screens */}
        <div className="sb-filter-tabs" style={{ marginBottom: '14px' }}>
          <button
            type="button"
            className={`sb-filter-tab${composerLangTab === 'both' ? ' active' : ''}`}
            onClick={() => setComposerLangTab('both')}
          >
            English + हिंदी Side-by-Side
          </button>
          <button
            type="button"
            className={`sb-filter-tab${composerLangTab === 'en' ? ' active' : ''}`}
            onClick={() => setComposerLangTab('en')}
          >
            English Only
          </button>
          <button
            type="button"
            className={`sb-filter-tab${composerLangTab === 'hi' ? ' active' : ''}`}
            onClick={() => setComposerLangTab('hi')}
          >
            हिंदी Only
          </button>
        </div>

        <div className={composerLangTab === 'both' ? 'sb-admin-bilingual-grid' : 'sb-admin-stack'}>
          {(composerLangTab === 'both' || composerLangTab === 'en') && (
            <div className="sb-admin-lang-pane">
              <h3>English Version</h3>
              <label className="sb-form-field">
                <span>English Headline</span>
                <input
                  type="text"
                  value={enHeadline}
                  onChange={(e) => setEnHeadline(e.target.value)}
                  placeholder="Clear, factual English headline"
                />
              </label>
              <label className="sb-form-field">
                <span>English Short Summary</span>
                <textarea
                  rows={2}
                  value={enSummary}
                  onChange={(e) => setEnSummary(e.target.value)}
                  placeholder="2–3 line reader summary"
                />
              </label>
              <label className="sb-form-field">
                <span>English Full Article</span>
                <textarea
                  rows={7}
                  value={enBody}
                  onChange={(e) => setEnBody(e.target.value)}
                  placeholder="Write paragraphs separated by blank lines..."
                />
              </label>
            </div>
          )}

          {(composerLangTab === 'both' || composerLangTab === 'hi') && (
            <div className="sb-admin-lang-pane">
              <h3>हिंदी संस्करण (Hindi Version)</h3>
              <label className="sb-form-field">
                <span>हिंदी शीर्षक (Hindi Headline)</span>
                <input
                  type="text"
                  value={hiHeadline}
                  onChange={(e) => setHiHeadline(e.target.value)}
                  placeholder="सटीक और स्पष्ट हिंदी शीर्षक"
                />
              </label>
              <label className="sb-form-field">
                <span>हिंदी सारांश (Hindi Summary)</span>
                <textarea
                  rows={2}
                  value={hiSummary}
                  onChange={(e) => setHiSummary(e.target.value)}
                  placeholder="मुख्य निष्कर्ष 2–3 पंक्तियों में"
                />
              </label>
              <label className="sb-form-field">
                <span>पूरा हिंदी लेख (Hindi Article Body)</span>
                <textarea
                  rows={7}
                  value={hiBody}
                  onChange={(e) => setHiBody(e.target.value)}
                  placeholder="अनुच्छेदों को खाली पंक्ति से अलग करें..."
                />
              </label>
            </div>
          )}
        </div>

        {/* Duration, Featured, Paid Disclosure */}
        <div className="sb-admin-subpanel">
          <h3>Publication Duration &amp; Visibility</h3>
          <div className="sb-form-grid">
            <label className="sb-form-field">
              <span>Active Duration (exact elapsed hours)</span>
              <select
                value={durationPreset}
                onChange={(e) => {
                  setDurationPreset(e.target.value as DurationPreset);
                  setDurationTouched(true);
                }}
              >
                <option value="7d">7 Days (168 hours)</option>
                <option value="15d">15 Days (360 hours)</option>
                <option value="30d">30 Days (720 hours)</option>
                <option value="60d">60 Days (1,440 hours)</option>
                <option value="custom">Custom Duration (Hours)</option>
              </select>
            </label>

            {durationPreset === 'custom' ? (
              <label className="sb-form-field">
                <span>Custom Duration Hours</span>
                <input
                  type="number"
                  min={1}
                  max={43800}
                  value={customHours}
                  onChange={(e) => setCustomHours(Number(e.target.value))}
                />
              </label>
            ) : (
              <label className="sb-form-field">
                <span>Homepage Featured Placement (Manual)</span>
                <select
                  value={featuredPlacement}
                  onChange={(e) => setFeaturedPlacement(e.target.value as FeaturedPlacement)}
                >
                  <option value="none">Standard Feed Only</option>
                  <option value="main">Main Top Story (1 slot)</option>
                  <option value="secondary">Secondary Featured Story (3 slots)</option>
                </select>
              </label>
            )}
          </div>

          {durationPreset === 'custom' && (
            <label className="sb-form-field">
              <span>Homepage Featured Placement (Manual)</span>
              <select
                value={featuredPlacement}
                onChange={(e) => setFeaturedPlacement(e.target.value as FeaturedPlacement)}
              >
                <option value="none">Standard Feed Only</option>
                <option value="main">Main Top Story (1 slot)</option>
                <option value="secondary">Secondary Featured Story (3 slots)</option>
              </select>
            </label>
          )}

          <div className="sb-form-grid" style={{ marginTop: '10px' }}>
            <label className="sb-form-field">
              <span>Publication Date Handling</span>
              <select
                value={publishedDateMode}
                onChange={(e) => setPublishedDateMode(e.target.value as 'preserve' | 'today')}
              >
                <option value="preserve">Preserve / Specify Historical Date</option>
                <option value="today">Stamp Today&apos;s Date on Publish</option>
              </select>
            </label>
            {publishedDateMode === 'preserve' && (
              <label className="sb-form-field">
                <span>Historical Publication Date (IST)</span>
                <input
                  type="date"
                  value={publishedDateIso}
                  onChange={(e) => setPublishedDateIso(e.target.value)}
                />
              </label>
            )}
          </div>

          <div className="sb-admin-checkbox-row">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPaid}
                onChange={(e) => setIsPaid(e.target.checked)}
              />
              <span>Paid publication (shows clean disclosure badge only; no separate ad section)</span>
            </label>
            {isPaid && (
              <input
                type="text"
                value={paidDisclosureLabel}
                onChange={(e) => setPaidDisclosureLabel(e.target.value)}
                placeholder="Partner Disclosure"
                style={{ maxWidth: '240px' }}
              />
            )}
          </div>
        </div>

        {/* Media attachment (Compressed Photo OR YouTube Video) */}
        <div className="sb-admin-subpanel">
          <h3>Attach Media (Zero-Billing Photo or YouTube Video)</h3>
          <div className="sb-filter-tabs" style={{ marginBottom: '12px' }}>
            <button
              type="button"
              className={`sb-filter-tab${mediaMode === 'none' ? ' active' : ''}`}
              onClick={() => setMediaMode('none')}
            >
              No Media
            </button>
            <button
              type="button"
              className={`sb-filter-tab${mediaMode === 'photo' ? ' active' : ''}`}
              onClick={() => setMediaMode('photo')}
            >
              Upload Photograph
            </button>
            <button
              type="button"
              className={`sb-filter-tab${mediaMode === 'youtube' ? ' active' : ''}`}
              onClick={() => setMediaMode('youtube')}
            >
              Link YouTube Video
            </button>
            <button
              type="button"
              className={`sb-filter-tab${mediaMode === 'existing' ? ' active' : ''}`}
              onClick={() => setMediaMode('existing')}
            >
              Reuse Media Library ({reusableMediaOptions.length})
            </button>
          </div>

          {mediaMode === 'photo' && (
            <div className="sb-admin-stack">
              <label className="sb-form-field">
                <span>Select Photograph (compressed automatically in browser to ~150–180 KB)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void handlePhotoFileSelect(e)}
                />
              </label>
              {compressing && <div className="meta">Compressing image in browser…</div>}
              {photoDataUrl && (
                <div className="sb-admin-media-preview-box">
                  <img src={photoDataUrl} alt="Compressed preview" />
                  <div className="meta">
                    Original: {Math.round(photoOriginalBytes / 1024)} KB → Compressed:{' '}
                    <strong>{Math.round(photoSizeBytes / 1024)} KB</strong> ({photoWidth}×
                    {photoHeight})
                  </div>
                </div>
              )}
              <div className="sb-form-grid">
                <label className="sb-form-field">
                  <span>Photographer / Source Credit (Required for upload)</span>
                  <input
                    type="text"
                    value={mediaCredit}
                    onChange={(e) => setMediaCredit(e.target.value)}
                    placeholder="e.g. Press Information Bureau / SakarBazaar"
                  />
                </label>
                <label
                  className="sb-form-field"
                  style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', paddingTop: '22px' }}
                >
                  <input
                    type="checkbox"
                    checked={usageRightsConfirmed}
                    onChange={(e) => setUsageRightsConfirmed(e.target.checked)}
                  />
                  <span>I confirm legal usage rights for this photograph</span>
                </label>
              </div>
            </div>
          )}

          {mediaMode === 'youtube' && (
            <div className="sb-admin-stack">
              <div className="sb-form-grid">
                <label className="sb-form-field">
                  <span>YouTube Video URL or 11-char ID</span>
                  <input
                    type="text"
                    value={youtubeInput}
                    onChange={(e) => setYoutubeInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... or youtu.be/..."
                  />
                </label>
                <label className="sb-form-field">
                  <span>Video Title</span>
                  <input
                    type="text"
                    value={youtubeTitle}
                    onChange={(e) => setYoutubeTitle(e.target.value)}
                    placeholder="Brief description of the video report"
                  />
                </label>
              </div>
              {parsedYouTube ? (
                <div className="sb-admin-media-preview-box">
                  <img src={parsedYouTube.thumbnailUrl} alt="YouTube thumbnail preview" />
                  <div className="meta">
                    Valid YouTube ID: <strong>{parsedYouTube.videoId}</strong> · Privacy-enhanced
                    embed ready ({parsedYouTube.embedUrl})
                  </div>
                </div>
              ) : youtubeInput.trim() ? (
                <div className="meta" style={{ color: 'var(--down)' }}>
                  Enter a valid YouTube link (youtube.com/watch?v=..., youtu.be/..., or /shorts/...).
                </div>
              ) : null}
            </div>
          )}

          {mediaMode === 'existing' && (
            <label className="sb-form-field">
              <span>Choose Existing Asset from Media Library</span>
              <select
                value={selectedExistingMediaId}
                onChange={(e) => setSelectedExistingMediaId(e.target.value)}
              >
                <option value="">Select media asset…</option>
                {reusableMediaOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Action buttons */}
        <div className="sb-admin-action-bar">
          <button
            type="button"
            className="btn ghost sb-admin-touch-btn"
            onClick={() => setPreviewOpen(true)}
          >
            Preview EN &amp; हिंदी
          </button>
          {editingArticle && (
            <button
              type="button"
              className="btn ghost sb-admin-touch-btn"
              disabled={saving || isEditLocked}
              onClick={() => void executeSave('minor_edit')}
            >
              Save Corrections (Keep Status &amp; Expiry)
            </button>
          )}
          <button
            type="button"
            className="btn ghost sb-admin-touch-btn"
            disabled={saving || isEditLocked}
            onClick={() => void executeSave('draft')}
          >
            {editingArticle ? 'Save as Draft' : 'Save Draft'}
          </button>
          <button
            type="button"
            className="btn sb-admin-touch-btn"
            disabled={saving || isEditLocked}
            onClick={() => {
              if (isEditLocked) return;
              const validationError = validateBeforeAction('publish');
              if (validationError) {
                setLocalError(validationError);
                return;
              }
              setLocalError(null);
              setConfirmPublishOpen(true);
            }}
          >
            Publish / Republish →
          </button>
        </div>
      </section>

      {/* Bilingual Live Preview Modal */}
      {previewOpen && (
        <div className="sb-admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Article Preview">
          <div className="card snap sb-admin-modal">
            <div className="sec-h">
              <h2>Reader Preview</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
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
                <button type="button" className="btn ghost" onClick={() => setPreviewOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="sb-story-meta-row" style={{ marginBottom: '10px' }}>
              <span className="cat">{category}</span>
              {isPaid && <span className="pill sb-pill-muted">{paidDisclosureLabel || 'Partner Disclosure'}</span>}
              <span className="meta">Duration: {resolveDurationHours(durationPreset, customHours)}h</span>
            </div>

            <h3 style={{ font: '700 24px var(--serif)', margin: '0 0 8px' }}>
              {previewLang === 'hi' ? hiHeadline || '(हिंदी शीर्षक अभी खाली है)' : enHeadline || '(English headline blank)'}
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '15px', margin: '0 0 14px' }}>
              {previewLang === 'hi' ? hiSummary || hiBody.slice(0, 180) : enSummary || enBody.slice(0, 180)}
            </p>
            {(mediaMode === 'photo' && photoDataUrl) && (
              <img src={photoDataUrl} alt="Preview" style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }} />
            )}
            {(mediaMode === 'youtube' && parsedYouTube) && (
              <img src={parsedYouTube.thumbnailUrl} alt="YouTube preview" style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }} />
            )}
            {(mediaMode === 'existing' && selectedExistingMediaId) && (() => {
              const pay = data.payloadMap[selectedExistingMediaId]?.dataUrl;
              const fsMed = data.media.find((m) => m.id === selectedExistingMediaId);
              const staticMed = MEDIA_ASSETS.find((m) => m.id === selectedExistingMediaId);
              const imgUrl = pay || fsMed?.poster || staticMed?.posterUrl || staticMed?.publicUrl;
              if (!imgUrl) return null;
              return (
                <img
                  src={imgUrl}
                  alt="Existing media preview"
                  style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }}
                />
              );
            })()}
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
              {previewLang === 'hi' ? hiBody || '(हिंदी लेख अभी खाली है)' : enBody || '(English article body blank)'}
            </div>
          </div>
        </div>
      )}

      {/* Explicit Publish Confirmation Dialog */}
      {confirmPublishOpen && (
        <div className="sb-admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm Publication">
          <div className="card snap sb-admin-modal" style={{ maxWidth: '520px' }}>
            <h2>Confirm Bilingual Publication</h2>
            <p style={{ color: 'var(--muted)', lineHeight: 1.55 }}>
              Publishing will make both English and Hindi versions immediately visible to public readers
              for <strong>{resolveDurationHours(durationPreset, customHours)} hours</strong>. After that exact
              elapsed duration, the article will move automatically to Expired / Private.
            </p>
            <div className="sb-note-box" style={{ marginBottom: '12px', fontSize: '13px' }}>
              <div><strong>EN:</strong> {enHeadline.trim()}</div>
              <div><strong>हिंदी:</strong> {hiHeadline.trim()}</div>
              {(sourceName.trim() || sourceUrl.trim()) && (
                <div>
                  <strong>Source:</strong> {sourceName.trim() || 'Specified link'}
                  {sourceUrl.trim() ? ` (${sourceUrl.trim()})` : ''}
                </div>
              )}
            </div>
            {localError && (
              <div className="sb-admin-alert err" role="alert" style={{ marginBottom: '12px' }}>
                {localError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn ghost sb-admin-touch-btn"
                disabled={saving}
                onClick={() => {
                  setLocalError(null);
                  setConfirmPublishOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn sb-admin-touch-btn"
                disabled={saving}
                onClick={() => void executeSave('publish')}
              >
                {saving ? 'Publishing…' : 'Confirm & Publish Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
