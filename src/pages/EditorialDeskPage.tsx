import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { MEDIA_ASSETS } from '../data/sampleData';
import {
  auth,
  fetchAllEditorArticles,
  fetchRecentAuditLogs,
  recordMediaMetadata,
  saveEditorialArticle,
  type StoredEditorialArticle,
} from '../lib/firebase';
import type {
  AiGeneratedBriefPayload,
  EditorialWorkflowStatus,
  NewsCategory,
  VerificationStatus,
} from '../types/sakarbazaar';
import { slugifyTitle } from '../utils/marketFormat';

const EDITORIAL_CATEGORIES: Exclude<NewsCategory, 'All'>[] = [
  'IPO',
  'Economy',
  'Markets',
  'Corporate',
  'RBI',
  'Banking',
  'Technology',
  'Personal finance',
];

export function EditorialDeskPage() {
  const {
    ui,
    user,
    authReady,
    isAuthorizedEditor,
    editorRole,
    signInEditor,
    signOutEditor,
    refreshArticles,
  } = useSakarBazaar();

  const [sourceMaterial, setSourceMaterial] = useState('');
  const [sourceName, setSourceName] = useState('User-supplied editorial material');
  const [sourceUrl, setSourceUrl] = useState('');
  const [category, setCategory] = useState<Exclude<NewsCategory, 'All'>>('IPO');
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [author, setAuthor] = useState('SakarBazaar Editorial Desk');
  const [mediaId, setMediaId] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [previousStatus, setPreviousStatus] = useState<EditorialWorkflowStatus | undefined>(
    undefined,
  );
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [entitiesText, setEntitiesText] = useState('');
  const [checklist, setChecklist] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const [savedArticles, setSavedArticles] = useState<StoredEditorialArticle[]>([]);
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string;
      actorEmail: string;
      nextStatus: string;
      summary: string;
    }>
  >([]);

  useEffect(() => {
    document.title = `Newsroom Editorial Desk – SakarBazaar`;
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    if (!isAuthorizedEditor) return;
    try {
      const [docs, logs] = await Promise.all([
        fetchAllEditorArticles(),
        fetchRecentAuditLogs(),
      ]);
      setSavedArticles(docs);
      setAuditLogs(logs);
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : 'Unable to load workspace documents.',
        tone: 'err',
      });
    }
  }, [isAuthorizedEditor]);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  async function handleGenerateAiBrief() {
    if (sourceMaterial.trim().length < 30) {
      setFeedback({
        text: 'Paste at least 30 characters of source text before generating an AI brief.',
        tone: 'err',
      });
      return;
    }

    setAiLoading(true);
    setFeedback(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Please sign in first.');
      }
      const res = await fetch('/api/editorial/generate-brief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sourceMaterial,
          category,
          sourceName,
          sourceUrl,
        }),
      });
      const data = (await res.json()) as AiGeneratedBriefPayload & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'AI brief generation failed.');
      }

      setTitle(data.headline);
      setSummary(data.summaryBrief);
      if (!body.trim()) {
        setBody(`${data.summaryBrief}\n\n${sourceMaterial.trim()}`);
      }
      const allEntities = [
        ...data.entities.companies,
        ...data.entities.instrumentsAndSymbols,
        ...data.entities.regulatorsAndExchanges,
      ].filter(Boolean);
      setEntitiesText([...new Set(allEntities)].slice(0, 16).join(', '));
      setKeywordsText((data.keywords ?? []).slice(0, 18).join(', '));
      setTagsText((data.keywords ?? []).slice(0, 6).join(', '));
      setChecklist(data.verificationChecklist ?? []);
      setFeedback({
        text: `AI brief generated (${data.wordCount} words). Saved into draft workspace only — review facts before marking verified or publishing.`,
        tone: 'ok',
      });
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : 'Unable to generate AI brief.',
        tone: 'err',
      });
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSaveWithStatus(nextStatus: EditorialWorkflowStatus) {
    if (title.trim().length < 5 || summary.trim().length < 10 || body.trim().length < 20) {
      setFeedback({
        text: 'Headline (5+ chars), <100-word summary (10+ chars), and body (20+ chars) are required.',
        tone: 'err',
      });
      return;
    }

    const articleId =
      editingId ||
      `${slugifyTitle(title) || 'dispatch'}-${Date.now().toString(36)}`.slice(0, 120);
    const slug = slugifyTitle(title) || articleId;

    const verificationStatus: VerificationStatus =
      nextStatus === 'Verified' || nextStatus === 'Published'
        ? 'verified'
        : 'awaiting_verification';

    const action =
      nextStatus === 'Draft'
        ? editingId
          ? 'update'
          : 'create_draft'
        : nextStatus === 'Awaiting Verification'
          ? 'mark_awaiting_verification'
          : nextStatus === 'Verified'
            ? 'verify'
            : nextStatus === 'Published'
              ? 'publish'
              : 'archive';

    setSaving(true);
    setFeedback(null);

    try {
      await saveEditorialArticle({
        articleId,
        isNew: !editingId,
        previousStatus,
        action,
        payload: {
          title: title.trim(),
          slug,
          summary: summary.trim(),
          body: body.trim(),
          category,
          tags: tagsText
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 12),
          keywords: keywordsText
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean)
            .slice(0, 20),
          entities: entitiesText
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean)
            .slice(0, 20),
          author: author.trim() || 'SakarBazaar Editorial Desk',
          status: nextStatus,
          verificationStatus,
          sourceName: sourceName.trim() || 'Editorial source',
          ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
          ...(mediaId ? { mediaId } : {}),
          language,
          createdByUid: user?.uid || 'unknown',
          ...(nextStatus === 'Published'
            ? { publishedAt: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
            : {}),
        },
      });

      if (mediaId === MEDIA_ASSETS[0].id) {
        const asset = MEDIA_ASSETS[0];
        await recordMediaMetadata({
          mediaId: asset.id,
          fileName: asset.fileName,
          storagePath: asset.storagePath,
          mediaType: asset.mediaType,
          duration: asset.durationSec ?? 20,
          width: asset.width ?? 1024,
          height: asset.height ?? 576,
          captions: asset.caption,
          transcript: asset.transcript ?? '',
          associatedArticleId: articleId,
        });
      }

      setEditingId(articleId);
      setPreviousStatus(nextStatus);
      await loadWorkspaceData();
      await refreshArticles();

      setFeedback({
        text: `Saved article "${title.trim()}" with status: ${nextStatus}. Audit entry recorded.`,
        tone: 'ok',
      });
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : 'Failed to save article.',
        tone: 'err',
      });
    } finally {
      setSaving(false);
    }
  }

  function loadArticleIntoEditor(docItem: StoredEditorialArticle) {
    setEditingId(docItem.id);
    setPreviousStatus(docItem.status);
    setTitle(docItem.title);
    setSummary(docItem.summary);
    setBody(docItem.body);
    setCategory(docItem.category);
    setAuthor(docItem.author);
    setSourceName(docItem.sourceName);
    setSourceUrl(docItem.sourceUrl ?? '');
    setTagsText((docItem.tags ?? []).join(', '));
    setKeywordsText((docItem.keywords ?? []).join(', '));
    setEntitiesText((docItem.entities ?? []).join(', '));
    setLanguage(docItem.language === 'hi' ? 'hi' : 'en');
    setMediaId(docItem.mediaId ?? '');
    setFeedback({ text: `Loaded "${docItem.title}" into editor.`, tone: 'ok' });
  }

  function resetForm() {
    setEditingId(null);
    setPreviousStatus(undefined);
    setTitle('');
    setSummary('');
    setBody('');
    setTagsText('');
    setKeywordsText('');
    setEntitiesText('');
    setChecklist([]);
    setMediaId('');
    setFeedback(null);
  }

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/"
        parentLabel={ui.backToMarkets}
        currentLabel="Newsroom Editorial Desk"
      />

      <div className="sb-page-head">
        <div>
          <h1>Newsroom Editorial &amp; Verification Desk</h1>
          <p>
            Authenticated editorial workspace for drafting, AI-assisted &lt;100-word brief
            preparation, entity extraction, and human-verified publishing.
          </p>
        </div>
        {user && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill">
              {user.email} ({editorRole})
            </span>
            <button type="button" className="btn ghost" onClick={() => void signOutEditor()}>
              Sign out
            </button>
          </div>
        )}
      </div>

      {!authReady ? (
        <div className="card snap">Checking newsroom authentication…</div>
      ) : !user ? (
        <section className="card snap" style={{ maxWidth: '62ch' }}>
          <h2 style={{ marginBottom: '8px' }}>Editor Sign-In Required</h2>
          <p style={{ color: 'var(--muted)', margin: '0 0 16px' }}>
            Sign in with your authorized SakarBazaar Google account to draft articles, generate AI
            briefs from uploaded material, attach media metadata, and manage verification states.
            AI tools never auto-publish content.
          </p>
          <button type="button" className="btn" onClick={() => void signInEditor()}>
            Sign in with Google
          </button>
        </section>
      ) : !isAuthorizedEditor ? (
        <section className="card snap" style={{ maxWidth: '62ch' }}>
          <span className="pill sb-pill-amber">Access restricted</span>
          <h2 style={{ margin: '10px 0 8px' }}>Unauthorized account</h2>
          <p style={{ color: 'var(--muted)', margin: '0 0 16px' }}>
            Signed in as <strong>{user.email}</strong>, which does not currently hold editor or
            administrator access in SakarBazaar. Public dispatches remain readable on the homepage
            and news sections.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn ghost" onClick={() => void signOutEditor()}>
              Switch account
            </button>
            <Link to="/news" className="btn">
              Browse public news →
            </Link>
          </div>
        </section>
      ) : (
        <div className="sb-two-col">
          <div>
            <section className="card snap" style={{ marginBottom: '20px' }}>
              <div className="sec-h">
                <h2>{editingId ? 'Edit Editorial Record' : 'New Editorial Draft'}</h2>
                {editingId && (
                  <button type="button" className="btn ghost" onClick={resetForm}>
                    + New draft
                  </button>
                )}
              </div>

              <div className="sb-note-box" style={{ marginTop: 0, marginBottom: '16px' }}>
                <strong>Workflow safeguard:</strong> AI brief extraction always saves into a{' '}
                <strong>Draft</strong> workspace only. An editor or administrator must explicitly
                confirm sources before choosing <strong>Verified</strong> or{' '}
                <strong>Published</strong>.
              </div>

              <div className="sb-form-grid">
                <label className="sb-form-field">
                  <span>Category</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Exclude<NewsCategory, 'All'>)}
                  >
                    {EDITORIAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="sb-form-field">
                  <span>Language</span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}
                  >
                    <option value="en">English (en)</option>
                    <option value="hi">Hindi (hi)</option>
                  </select>
                </label>
              </div>

              <label className="sb-form-field">
                <span>Raw editorial / regulatory source material</span>
                <textarea
                  rows={5}
                  value={sourceMaterial}
                  onChange={(e) => setSourceMaterial(e.target.value)}
                  placeholder="Paste press release, DRHP/RHP note, or newsroom source text…"
                />
              </label>

              <div className="sb-form-grid">
                <label className="sb-form-field">
                  <span>Source attribution</span>
                  <input
                    type="text"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                  />
                </label>
                <label className="sb-form-field">
                  <span>Official source URL (optional)</span>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://www.sebi.gov.in/..."
                  />
                </label>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={aiLoading}
                  onClick={() => void handleGenerateAiBrief()}
                >
                  {aiLoading
                    ? 'Generating <100-word brief & extracting entities…'
                    : 'Generate <100-word AI Brief & Extract Entities'}
                </button>
              </div>

              <label className="sb-form-field">
                <span>Headline</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Factual headline"
                />
              </label>

              <label className="sb-form-field">
                <span>
                  Summary brief ({summary.trim() ? summary.trim().split(/\s+/).length : 0} words)
                </span>
                <textarea
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Concise <100-word factual summary in past tense…"
                />
              </label>

              <label className="sb-form-field">
                <span>Full article body</span>
                <textarea
                  rows={7}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Full editorial article paragraphs…"
                />
              </label>

              <div className="sb-form-grid">
                <label className="sb-form-field">
                  <span>Extracted entities (comma-separated)</span>
                  <input
                    type="text"
                    value={entitiesText}
                    onChange={(e) => setEntitiesText(e.target.value)}
                  />
                </label>
                <label className="sb-form-field">
                  <span>Search keywords (comma-separated)</span>
                  <input
                    type="text"
                    value={keywordsText}
                    onChange={(e) => setKeywordsText(e.target.value)}
                  />
                </label>
              </div>

              <div className="sb-form-grid">
                <label className="sb-form-field">
                  <span>Tags (comma-separated)</span>
                  <input
                    type="text"
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                  />
                </label>
                <label className="sb-form-field">
                  <span>Attach media asset metadata</span>
                  <select value={mediaId} onChange={(e) => setMediaId(e.target.value)}>
                    <option value="">None</option>
                    {MEDIA_ASSETS.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.fileName} ({asset.durationSec}s MP4)
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {checklist.length > 0 && (
                <div className="sb-note-box" style={{ marginBottom: '16px' }}>
                  <strong>AI-extracted editor verification checklist:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                    {checklist.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={saving}
                  onClick={() => void handleSaveWithStatus('Draft')}
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={saving}
                  onClick={() => void handleSaveWithStatus('Awaiting Verification')}
                >
                  Mark Awaiting Verification
                </button>
                {editorRole === 'admin' && (
                  <>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={saving}
                      onClick={() => void handleSaveWithStatus('Verified')}
                    >
                      Mark Verified
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={saving}
                      onClick={() => void handleSaveWithStatus('Published')}
                    >
                      Publish Dispatch
                    </button>
                  </>
                )}
              </div>

              {feedback && (
                <div
                  className="msg"
                  role="status"
                  style={{
                    color: feedback.tone === 'err' ? 'var(--down)' : 'var(--teal)',
                    marginTop: '12px',
                  }}
                >
                  {feedback.text}
                </div>
              )}
            </section>
          </div>

          <aside>
            <section className="card snap" style={{ marginBottom: '16px' }}>
              <div className="sec-h">
                <h2>Firestore Dispatches ({savedArticles.length})</h2>
              </div>
              {savedArticles.length > 0 ? (
                savedArticles.map((docItem) => (
                  <div className="sb-watchlist-item" key={docItem.id}>
                    <div>
                      <span className="pill sb-pill-muted" style={{ fontSize: '11px' }}>
                        {docItem.status}
                      </span>
                      <div style={{ fontWeight: 600, marginTop: '4px' }}>{docItem.title}</div>
                      <small style={{ color: 'var(--muted)' }}>
                        {docItem.category} · {docItem.author}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => loadArticleIntoEditor(docItem)}
                    >
                      Edit
                    </button>
                  </div>
                ))
              ) : (
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '14px' }}>
                  No custom Firestore articles created yet.
                </p>
              )}
            </section>

            <section className="card snap">
              <div className="sec-h">
                <h2>Recent Audit Log ({auditLogs.length})</h2>
              </div>
              {auditLogs.length > 0 ? (
                auditLogs.slice(0, 8).map((entry) => (
                  <div className="row" style={{ gridTemplateColumns: '1fr', gap: '2px' }} key={entry.id}>
                    <span className="meta">
                      {entry.action} → {entry.nextStatus}
                    </span>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{entry.summary}</div>
                    <small>{entry.actorEmail}</small>
                  </div>
                ))
              ) : (
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '14px' }}>
                  Editorial audit actions will appear here automatically.
                </p>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
