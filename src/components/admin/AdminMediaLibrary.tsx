import { useRef, useState, type ChangeEvent } from 'react';
import {
  deleteMediaAssetSafely,
  saveCompressedPhotoAsset,
  saveYouTubeMediaAsset,
} from '../../lib/firebase';
import {
  canSafelyDeleteMediaAsset,
  compressImageFileInBrowser,
  estimateMediaQuotaUsage,
  parseYouTubeVideoUrl,
} from '../../utils/mediaLibrary';
import { extractReadableErrorMessage } from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

export function AdminMediaLibrary({
  data,
  onRefresh,
  onNotify,
}: AdminSectionBaseProps) {
  const [uploadTab, setUploadTab] = useState<'none' | 'photo' | 'youtube'>('none');
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [credit, setCredit] = useState('');
  const [caption, setCaption] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [ytInput, setYtInput] = useState('');
  const [ytTitle, setYtTitle] = useState('');
  const [ytCredit, setYtCredit] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pendingPhotoIdRef = useRef<string | null>(null);

  const [photoPreview, setPhotoPreview] = useState<{
    dataUrl: string;
    mimeType: 'image/jpeg' | 'image/webp';
    fileName: string;
    width: number;
    height: number;
    sizeBytes: number;
  } | null>(null);

  function resetPhotoForm() {
    pendingPhotoIdRef.current = null;
    setReplacingId(null);
    setPhotoPreview(null);
    setCredit('');
    setCaption('');
    setRightsConfirmed(false);
  }

  function resetYouTubeForm() {
    setYtInput('');
    setYtTitle('');
    setYtCredit('');
  }

  const quota = estimateMediaQuotaUsage(data.media);
  const parsedYt = parseYouTubeVideoUrl(ytInput);
  const photos = data.media.filter((m) => m.mediaType.startsWith('image/'));
  const videos = data.media.filter((m) => m.mediaType.startsWith('video/'));

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const res = await compressImageFileInBrowser(file, {
        targetBytes: data.systemSettings.maxImageSizeBytes || 180_000,
      });
      setPhotoPreview({
        ...res,
        fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg',
      });
    } catch (err) {
      onNotify({ tone: 'err', text: err instanceof Error ? err.message : 'Compression failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePhoto() {
    if (busyRef.current) return;
    if (!photoPreview) {
      onNotify({ tone: 'err', text: 'Select a photograph first.' });
      return;
    }
    if (!credit.trim() || !rightsConfirmed) {
      onNotify({ tone: 'err', text: 'Enter credit and confirm usage rights before saving.' });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      if (!replacingId && !pendingPhotoIdRef.current) {
        pendingPhotoIdRef.current = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      }
      const targetId = replacingId || pendingPhotoIdRef.current!;
      const existing = replacingId ? data.media.find((m) => m.id === replacingId) : undefined;
      await saveCompressedPhotoAsset({
        mediaId: targetId,
        fileName: photoPreview.fileName,
        mimeType: photoPreview.mimeType,
        dataUrl: photoPreview.dataUrl,
        sizeBytes: photoPreview.sizeBytes,
        width: photoPreview.width,
        height: photoPreview.height,
        credit: credit.trim(),
        usageRightsConfirmed: rightsConfirmed,
        captions: caption.trim() || photoPreview.fileName,
        isPublic: existing?.isPublic ?? false,
        expiresAtMs: existing?.expiresAtMs ?? null,
        associatedArticleIds: existing?.associatedArticleIds ?? [],
        isUpdate: Boolean(replacingId),
      });
      pendingPhotoIdRef.current = null;
      setPhotoPreview(null);
      setCredit('');
      setCaption('');
      setRightsConfirmed(false);
      setReplacingId(null);
      setUploadTab('none');
      await onRefresh({ scope: 'media' });
      onNotify({
        tone: 'ok',
        text: replacingId ? 'Replaced photograph in Media Library.' : 'Added compressed photograph to Media Library.',
      });
    } catch (err) {
      onNotify({ tone: 'err', text: extractReadableErrorMessage(err, 'Failed to save photo.') });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleSaveYouTube() {
    if (busyRef.current) return;
    if (!parsedYt) {
      onNotify({ tone: 'err', text: 'Enter a valid YouTube link or video ID.' });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await saveYouTubeMediaAsset({
        mediaId: `yt_${parsedYt.videoId}`,
        youtubeUrl: parsedYt.canonicalUrl,
        youtubeVideoId: parsedYt.videoId,
        title: ytTitle.trim() || `YouTube Report (${parsedYt.videoId})`,
        credit: ytCredit.trim() || 'SakarBazaar YouTube Channel',
        usageRightsConfirmed: true,
        isPublic: false,
      });
      resetYouTubeForm();
      setUploadTab('none');
      await onRefresh({ scope: 'media' });
      onNotify({ tone: 'ok', text: `Saved YouTube video ${parsedYt.videoId} to Media Library.` });
    } catch (err) {
      onNotify({ tone: 'err', text: extractReadableErrorMessage(err, 'Failed to save YouTube link.') });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleSafeDelete(mediaId: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await deleteMediaAssetSafely(mediaId, data.articles);
      if (!res.deleted) {
        onNotify({ tone: 'err', text: res.reason || 'Media asset is still referenced by articles.' });
        return;
      }
      await onRefresh({ scope: 'media' });
      onNotify({ tone: 'ok', text: 'Unreferenced media asset deleted cleanly.' });
    } catch (err) {
      onNotify({ tone: 'err', text: extractReadableErrorMessage(err, 'Delete failed.') });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="sb-admin-stack">
      <section className="card snap">
        <div className="sec-h">
          <div>
            <h2>Media Library (Zero-Billing Photos &amp; YouTube)</h2>
            <p className="sb-sec-sub">
              Photographs are client-compressed into /mediaPayloads ({quota.totalStoredMb} MB / 1,024 MB Spark free storage).
              Videos stay on YouTube and store links/IDs only.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn ghost sb-admin-touch-btn"
              onClick={() => {
                resetPhotoForm();
                setUploadTab(uploadTab === 'photo' ? 'none' : 'photo');
              }}
            >
              + Add Photo
            </button>
            <button
              type="button"
              className="btn ghost sb-admin-touch-btn"
              onClick={() => {
                resetYouTubeForm();
                setUploadTab(uploadTab === 'youtube' ? 'none' : 'youtube');
              }}
            >
              + Add YouTube Video
            </button>
          </div>
        </div>

        {uploadTab === 'photo' && (
          <div className="sb-admin-subpanel" style={{ marginBottom: '16px' }}>
            <h3>{replacingId ? `Replace Photo (${replacingId})` : 'Upload Compressed Photograph'}</h3>
            <div className="sb-form-grid">
              <label className="sb-form-field">
                <span>Choose Image File</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void handleFileChange(e)} />
              </label>
              <label className="sb-form-field">
                <span>Credit / Attribution</span>
                <input type="text" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="e.g. PIB India / Staff Photo" />
              </label>
            </div>
            <label className="sb-form-field">
              <span>Caption / Alt Description</span>
              <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} />
            </label>
            {photoPreview && (
              <div className="sb-admin-media-preview-box" style={{ marginBottom: '10px' }}>
                <img src={photoPreview.dataUrl} alt="Preview" />
                <div className="meta">
                  Compressed size: <strong>{Math.round(photoPreview.sizeBytes / 1024)} KB</strong> ({photoPreview.width}×{photoPreview.height})
                </div>
              </div>
            )}
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
              <input type="checkbox" checked={rightsConfirmed} onChange={(e) => setRightsConfirmed(e.target.checked)} />
              <span>Usage rights &amp; editorial permission confirmed</span>
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn sb-admin-touch-btn" disabled={busy} onClick={() => void handleSavePhoto()}>
                Save Photograph
              </button>
              <button
                type="button"
                className="btn ghost sb-admin-touch-btn"
                onClick={() => {
                  resetPhotoForm();
                  setUploadTab('none');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {uploadTab === 'youtube' && (
          <div className="sb-admin-subpanel" style={{ marginBottom: '16px' }}>
            <h3>Add YouTube Video Entry</h3>
            <div className="sb-form-grid">
              <label className="sb-form-field">
                <span>YouTube URL or Video ID</span>
                <input type="text" value={ytInput} onChange={(e) => setYtInput(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
              </label>
              <label className="sb-form-field">
                <span>Video Title</span>
                <input type="text" value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} placeholder="Headline or video topic" />
              </label>
            </div>
            <label className="sb-form-field">
              <span>Channel / Source Credit</span>
              <input type="text" value={ytCredit} onChange={(e) => setYtCredit(e.target.value)} placeholder="SakarBazaar YouTube" />
            </label>
            {parsedYt && (
              <div className="sb-admin-media-preview-box" style={{ marginBottom: '10px' }}>
                <img src={parsedYt.thumbnailUrl} alt="YouTube poster" />
                <div className="meta">Embed preview ready: {parsedYt.embedUrl}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn sb-admin-touch-btn" disabled={busy} onClick={() => void handleSaveYouTube()}>
                Save YouTube Entry
              </button>
              <button
                type="button"
                className="btn ghost sb-admin-touch-btn"
                onClick={() => {
                  resetYouTubeForm();
                  setUploadTab('none');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <h3 style={{ marginTop: 0 }}>Photographs ({photos.length})</h3>
        {photos.length > 0 ? (
          <div className="sb-admin-media-grid">
            {photos.map((m) => {
              const payload = data.payloadMap[m.id];
              const guard = canSafelyDeleteMediaAsset(m.id, data.articles);
              return (
                <article className="sb-admin-media-card" key={m.id}>
                  {payload?.dataUrl ? (
                    <img src={payload.dataUrl} alt={m.fileName} />
                  ) : (
                    <div className="sb-admin-media-placeholder">No payload cached</div>
                  )}
                  <div className="sb-admin-media-meta">
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span className={`pill ${m.isPublic ? 'sb-pill-teal' : 'sb-pill-muted'}`}>
                        {m.isPublic ? 'Public' : 'Private'}
                      </span>
                      <span className="pill">{Math.round((m.sizeBytes ?? 0) / 1024)} KB</span>
                    </div>
                    <strong>{m.fileName}</strong>
                    <div className="meta">Credit: {m.credit || 'Missing'} · Used by {guard.remainingArticleIds.length} article(s)</div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          setPhotoPreview(null);
                          setReplacingId(m.id);
                          setCredit(m.credit || '');
                          setCaption(m.captions || '');
                          setRightsConfirmed(Boolean(m.usageRightsConfirmed));
                          setUploadTab('photo');
                        }}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={!guard.canDelete || busy}
                        title={guard.canDelete ? 'Delete unused photo' : 'In use by active/retained articles'}
                        onClick={() => void handleSafeDelete(m.id)}
                      >
                        {guard.canDelete ? 'Delete' : 'In Use'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="meta">No compressed photographs uploaded yet.</p>
        )}

        <h3 style={{ marginTop: '24px' }}>YouTube Videos ({videos.length})</h3>
        {videos.length > 0 ? (
          <div className="sb-admin-media-grid">
            {videos.map((v) => {
              const guard = canSafelyDeleteMediaAsset(v.id, data.articles);
              return (
                <article className="sb-admin-media-card" key={v.id}>
                  {v.poster && <img src={v.poster} alt={v.fileName} />}
                  <div className="sb-admin-media-meta">
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span className={`pill ${v.isPublic ? 'sb-pill-teal' : 'sb-pill-muted'}`}>
                        {v.isPublic ? 'Public' : 'Private'}
                      </span>
                      <span className="pill">YouTube</span>
                    </div>
                    <strong>{v.captions || v.fileName}</strong>
                    <div className="meta">ID: {v.youtubeVideoId || v.id} · Used by {guard.remainingArticleIds.length} article(s)</div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {v.youtubeUrl && (
                        <a href={v.youtubeUrl} target="_blank" rel="noreferrer" className="btn ghost">
                          Open YouTube ↗
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={!guard.canDelete || busy}
                        onClick={() => void handleSafeDelete(v.id)}
                      >
                        {guard.canDelete ? 'Remove' : 'In Use'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="meta">No YouTube video links added yet.</p>
        )}
      </section>
    </div>
  );
}
