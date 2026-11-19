import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminAuditHistory } from '../components/admin/AdminAuditHistory';
import { AdminAuthGate } from '../components/admin/AdminAuthGate';
import { AdminDashboardOverview } from '../components/admin/AdminDashboardOverview';
import { AdminExpiredArchive } from '../components/admin/AdminExpiredArchive';
import { AdminFeaturedManager } from '../components/admin/AdminFeaturedManager';
import { AdminIpoManager } from '../components/admin/AdminIpoManager';
import { AdminIpoReviews } from '../components/admin/AdminIpoReviews';
import { AdminManageNews } from '../components/admin/AdminManageNews';
import { AdminMediaLibrary } from '../components/admin/AdminMediaLibrary';
import { AdminNewsDesk } from '../components/admin/AdminNewsDesk';
import { AdminPaidManager } from '../components/admin/AdminPaidManager';
import { AdminPendingDeletion } from '../components/admin/AdminPendingDeletion';
import { AdminSettings } from '../components/admin/AdminSettings';
import type {
  AdminNavItem,
  AdminRefreshOptions,
  AdminRefreshScope,
  AdminSectionKey,
  AdminWorkspaceData,
} from '../components/admin/adminTypes';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import {
  fetchAdminUsers,
  fetchAllManagedIpos,
  fetchAllMediaLibraryItems,
  fetchAllStoredArticles,
  fetchAuthorizedEmails,
  fetchIpoSourceReviews,
  fetchPaidCampaigns,
  fetchRecentAuditLogs,
  fetchSystemSettings,
  subscribeToAdminOperationalCollections,
  sweepExpiredPublishedArticles,
} from '../lib/firebase';
import type { StoredArticleDoc } from '../types/sakarbazaar';
import { extractReadableErrorMessage, isArticleInDeletionQueue } from '../utils/newsLifecycle';
import {
  createTabSessionId,
  publishWorkspaceSyncSignal,
} from '../utils/workspaceSync';

const DEFAULT_WORKSPACE: AdminWorkspaceData = {
  articles: [],
  media: [],
  payloadMap: {},
  paidCampaigns: [],
  ipos: [],
  ipoReviews: [],
  auditLogs: [],
  authorizedEmails: [],
  adminUsers: [],
  systemSettings: {
    key: 'global',
    defaultDurationPreset: '15d',
    expiringSoonThresholdHours: 48,
    maxImageSizeBytes: 180_000,
    requireBilingualPublish: true,
    updatedByUid: 'system',
  },
};

function mergeRefreshScope(
  a?: AdminRefreshScope,
  b?: AdminRefreshScope,
): AdminRefreshScope {
  const rank: Record<AdminRefreshScope, number> = {
    none: 0,
    media: 1,
    paid: 1,
    settings: 1,
    non_realtime: 2,
    all: 3,
  };
  const sA = a ?? 'non_realtime';
  const sB = b ?? 'non_realtime';
  if (sA !== sB && rank[sA] === 1 && rank[sB] === 1) {
    return 'non_realtime';
  }
  return rank[sA] >= rank[sB] ? sA : sB;
}

export function AdminPage() {
  const {
    user,
    authReady,
    isAuthorizedEditor,
    adminRole,
    permissions,
    signInEditor,
    signOutEditor,
    refreshAuthSession,
    refreshArticles,
    refreshIpos,
  } = useSakarBazaar();

  const [section, setSection] = useState<AdminSectionKey>('dashboard');
  const [workspace, setWorkspace] = useState<AdminWorkspaceData>(DEFAULT_WORKSPACE);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [editingArticle, setEditingArticle] = useState<StoredArticleDoc | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  const loadingWorkspaceRef = useRef(false);
  const pendingWorkspaceRefreshRef = useRef<AdminRefreshOptions | null>(null);
  const refreshingSessionRef = useRef(false);
  const tabSessionIdRef = useRef<string>(createTabSessionId());
  const hasSweptInitialExpiredRef = useRef(false);

  useEffect(() => {
    document.title = 'SakarBazaar Admin · Private Newsroom & Intelligence';
  }, []);

  const handlePublicContentChanged = useCallback(async () => {
    await Promise.all([refreshArticles(), refreshIpos()]);
    publishWorkspaceSyncSignal(
      ['articles', 'ipos', 'legacyOverrides'],
      tabSessionIdRef.current,
      'admin_mutation',
    );
  }, [refreshArticles, refreshIpos]);

  const loadWorkspace = useCallback(async (opts?: AdminRefreshOptions) => {
    if (!isAuthorizedEditor || adminRole === 'none') return;
    const scope: AdminRefreshScope = opts?.manual
      ? 'all'
      : opts?.scope ?? 'non_realtime';
    if (scope === 'none' && !opts?.manual) {
      return;
    }

    if (loadingWorkspaceRef.current) {
      pendingWorkspaceRefreshRef.current = {
        manual: Boolean(pendingWorkspaceRefreshRef.current?.manual || opts?.manual),
        scope: mergeRefreshScope(pendingWorkspaceRefreshRef.current?.scope, scope),
      };
      return;
    }
    loadingWorkspaceRef.current = true;
    setLoadingWorkspace(true);
    try {
      if (scope === 'media') {
        const mediaBundle = await fetchAllMediaLibraryItems();
        setWorkspace((prev) => ({
          ...prev,
          media: mediaBundle.media,
          payloadMap: mediaBundle.payloadMap,
        }));
      } else if (scope === 'paid') {
        const paidCampaigns = await fetchPaidCampaigns();
        setWorkspace((prev) => ({ ...prev, paidCampaigns }));
      } else if (scope === 'settings') {
        const [systemSettings, ownerBundle] = await Promise.all([
          fetchSystemSettings(),
          permissions.canManagePermissionsAndSecurity
            ? Promise.all([
                fetchAuthorizedEmails().catch(() => []),
                fetchAdminUsers().catch(() => []),
              ])
            : Promise.resolve([[] as AdminWorkspaceData['authorizedEmails'], [] as AdminWorkspaceData['adminUsers']] as const),
        ]);
        setWorkspace((prev) => ({
          ...prev,
          systemSettings,
          authorizedEmails: ownerBundle[0],
          adminUsers: ownerBundle[1],
        }));
      } else if (scope === 'non_realtime') {
        const [mediaBundle, paidCampaigns, systemSettings, ownerBundle] = await Promise.all([
          fetchAllMediaLibraryItems(),
          fetchPaidCampaigns(),
          fetchSystemSettings(),
          permissions.canManagePermissionsAndSecurity
            ? Promise.all([
                fetchAuthorizedEmails().catch(() => []),
                fetchAdminUsers().catch(() => []),
              ])
            : Promise.resolve([[] as AdminWorkspaceData['authorizedEmails'], [] as AdminWorkspaceData['adminUsers']] as const),
        ]);
        setWorkspace((prev) => ({
          ...prev,
          media: mediaBundle.media,
          payloadMap: mediaBundle.payloadMap,
          paidCampaigns,
          systemSettings,
          authorizedEmails: ownerBundle[0],
          adminUsers: ownerBundle[1],
        }));
      } else {
        const [
          articlesRaw,
          mediaBundle,
          paidCampaigns,
          ipos,
          ipoReviews,
          auditLogs,
          systemSettings,
        ] = await Promise.all([
          fetchAllStoredArticles(),
          fetchAllMediaLibraryItems(),
          fetchPaidCampaigns(),
          fetchAllManagedIpos(),
          fetchIpoSourceReviews(),
          fetchRecentAuditLogs(80),
          fetchSystemSettings(),
        ]);

        // Automatically transition elapsed expired Published articles to Expired & sync media visibility
        const swept = await sweepExpiredPublishedArticles(articlesRaw);
        const articles = swept > 0 ? await fetchAllStoredArticles() : articlesRaw;
        if (swept > 0 || opts?.manual) {
          await handlePublicContentChanged();
        }

        const [authorizedEmails, adminUsers] = permissions.canManagePermissionsAndSecurity
          ? await Promise.all([
              fetchAuthorizedEmails().catch(() => []),
              fetchAdminUsers().catch(() => []),
            ])
          : [[], []];

        setWorkspace({
          articles,
          media: mediaBundle.media,
          payloadMap: mediaBundle.payloadMap,
          paidCampaigns,
          ipos,
          ipoReviews,
          auditLogs,
          authorizedEmails,
          adminUsers,
          systemSettings,
        });

        if (opts?.manual) {
          setBanner({
            tone: 'ok',
            text: `Workspace data refreshed from Firestore (${articles.length} articles, ${ipos.length} IPOs, ${ipoReviews.length} IPO reviews${swept > 0 ? `, swept ${swept} expired` : ''}).`,
          });
        }
      }
    } catch (err) {
      setBanner({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to load admin workspace collections.'),
      });
    } finally {
      loadingWorkspaceRef.current = false;
      setLoadingWorkspace(false);
      const queued = pendingWorkspaceRefreshRef.current;
      if (queued) {
        pendingWorkspaceRefreshRef.current = null;
        await loadWorkspace(queued);
      }
    }
  }, [isAuthorizedEditor, adminRole, permissions.canManagePermissionsAndSecurity, handlePublicContentChanged]);

  useEffect(() => {
    if (!isAuthorizedEditor || adminRole === 'none') {
      hasSweptInitialExpiredRef.current = false;
      return;
    }

    // Load non-subscribed collections + initial workspace snapshot once on mount
    void loadWorkspace({ scope: 'all' });

    // Attach targeted authenticated Admin-only real-time listeners for operational collections
    const unsubscribe = subscribeToAdminOperationalCollections(
      {
        onArticles: (articles) => {
          setWorkspace((prev) => ({ ...prev, articles }));
          if (!hasSweptInitialExpiredRef.current && articles.length > 0) {
            hasSweptInitialExpiredRef.current = true;
            void sweepExpiredPublishedArticles(articles).then((swept) => {
              if (swept > 0) {
                void handlePublicContentChanged();
              }
            });
          }
        },
        onIpos: (ipos) => {
          setWorkspace((prev) => ({ ...prev, ipos }));
        },
        onIpoReviews: (ipoReviews) => {
          setWorkspace((prev) => ({ ...prev, ipoReviews }));
        },
        onAuditLogs: (auditLogs) => {
          setWorkspace((prev) => ({ ...prev, auditLogs }));
        },
        onError: (collectionName, err) => {
          console.warn(`Admin realtime listener error (${collectionName}):`, err);
        },
      },
      { auditLogLimit: 80 },
    );

    return () => {
      unsubscribe();
    };
  }, [isAuthorizedEditor, adminRole, loadWorkspace, handlePublicContentChanged]);

  async function handleRefreshSessionClick() {
    if (refreshingSessionRef.current || refreshingSession) return;
    refreshingSessionRef.current = true;
    setRefreshingSession(true);
    setAuthError(null);
    try {
      const res = await refreshAuthSession();
      if (res.ok) {
        setBanner({ tone: 'ok', text: res.message });
      } else {
        setAuthError(res.message);
        setBanner({ tone: 'err', text: res.message });
      }
    } catch (err) {
      const msg = extractReadableErrorMessage(err, 'Unable to refresh authentication session.');
      setAuthError(msg);
      setBanner({ tone: 'err', text: msg });
    } finally {
      refreshingSessionRef.current = false;
      setRefreshingSession(false);
    }
  }

  async function handleSignInClick() {
    setAuthError(null);
    try {
      await signInEditor();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In did not complete.');
    }
  }

  if (!authReady || !user || !isAuthorizedEditor || adminRole === 'none') {
    return (
      <AdminAuthGate
        authReady={authReady}
        user={user}
        isAuthorizedEditor={isAuthorizedEditor}
        adminRole={adminRole}
        authError={authError}
        onSignIn={handleSignInClick}
        onSignOut={signOutEditor}
        onRefreshToken={refreshAuthSession}
      />
    );
  }

  const pendingDelCount = workspace.articles.filter(isArticleInDeletionQueue).length;
  const ipoReviewCount = workspace.ipoReviews.filter((r) => r.reviewStatus === 'Needs Review').length;

  const navItems: AdminNavItem[] = [
    { key: 'dashboard', label: '1. Dashboard', shortLabel: 'Dashboard' },
    { key: 'news-desk', label: '2. News Desk', shortLabel: 'News Desk' },
    { key: 'manage-news', label: '3. Manage News', shortLabel: 'Manage' },
    { key: 'media-library', label: '4. Media Library', shortLabel: 'Media' },
    { key: 'featured', label: '5. Featured Articles', shortLabel: 'Featured' },
    { key: 'paid', label: '6. Paid Publications', shortLabel: 'Paid' },
    { key: 'expired', label: '7. Expired / Private', shortLabel: 'Expired' },
    {
      key: 'pending-deletion',
      label: '8. Pending Deletion',
      shortLabel: 'Deletions',
      badgeCount: pendingDelCount,
    },
    { key: 'ipo-manager', label: '9. IPO Calendar Manager', shortLabel: 'IPO Desk' },
    {
      key: 'ipo-review',
      label: '10. IPO Source Review',
      shortLabel: 'IPO Review',
      badgeCount: ipoReviewCount,
    },
    { key: 'audit-history', label: '11. Audit History', shortLabel: 'Audit' },
    { key: 'settings', label: '12. Settings & Backup', shortLabel: 'Settings' },
  ];

  const baseProps = {
    data: workspace,
    adminRole,
    permissions,
    userUid: user.uid,
    userEmail: user.email || '',
    onRefresh: loadWorkspace,
    onNavigate: (next: AdminSectionKey) => setSection(next),
    onNotify: (msg: { text: string; tone: 'ok' | 'err' }) => setBanner(msg),
  };

  return (
    <main id="top" className="wrap sb-page sb-admin-page">
      {/* Header bar */}
      <header className="sb-admin-header card snap">
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill sb-pill-teal">
              {adminRole === 'owner' ? 'Owner Role' : 'Publisher Role'}
            </span>
            <span className="meta">Private SakarBazaar Admin</span>
          </div>
          <h1 style={{ font: '700 24px var(--serif)', margin: '6px 0 2px' }}>
            Newsroom, Media &amp; IPO Control Desk
          </h1>
          <div className="meta">Signed in as {user.email}</div>
        </div>

        <div className="sb-admin-header-actions">
          <button
            type="button"
            className="btn ghost sb-admin-touch-btn"
            disabled={loadingWorkspace}
            onClick={() => void loadWorkspace({ manual: true })}
          >
            {loadingWorkspace ? 'Refreshing…' : 'Refresh Data'}
          </button>
          <button
            type="button"
            className="btn ghost sb-admin-touch-btn"
            disabled={refreshingSession}
            onClick={() => void handleRefreshSessionClick()}
          >
            {refreshingSession ? 'Checking Session…' : 'Refresh Session'}
          </button>
          <button
            type="button"
            className="btn ghost sb-admin-touch-btn"
            onClick={() => void signOutEditor()}
          >
            Sign Out
          </button>
        </div>
      </header>

      {banner && (
        <div
          className={`sb-admin-alert ${banner.tone}`}
          role="status"
          style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}
        >
          <span>{banner.text}</span>
          <button type="button" className="btn ghost" onClick={() => setBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Mobile horizontal tab bar + Desktop left sidebar */}
      <div className="sb-admin-shell">
        <nav className="sb-admin-nav" aria-label="Admin sections">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`sb-admin-nav-btn${section === item.key ? ' active' : ''}`}
              aria-current={section === item.key ? 'page' : undefined}
              onClick={() => setSection(item.key)}
            >
              <span className="sb-admin-nav-full">{item.label}</span>
              <span className="sb-admin-nav-short">{item.shortLabel}</span>
              {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                <span className="sb-admin-badge">{item.badgeCount}</span>
              )}
            </button>
          ))}
        </nav>

        <section className="sb-admin-content">
          {section === 'dashboard' && <AdminDashboardOverview {...baseProps} />}
          {section === 'news-desk' && (
            <AdminNewsDesk
              {...baseProps}
              editingArticle={editingArticle}
              onClearEditing={() => setEditingArticle(null)}
              onPublicContentChanged={handlePublicContentChanged}
            />
          )}
          {section === 'manage-news' && (
            <AdminManageNews
              {...baseProps}
              onEditArticle={(art) => {
                setEditingArticle(art);
                setSection('news-desk');
              }}
              onPublicContentChanged={handlePublicContentChanged}
            />
          )}
          {section === 'media-library' && <AdminMediaLibrary {...baseProps} />}
          {section === 'featured' && (
            <AdminFeaturedManager
              {...baseProps}
              onPublicContentChanged={handlePublicContentChanged}
            />
          )}
          {section === 'paid' && <AdminPaidManager {...baseProps} />}
          {section === 'expired' && (
            <AdminExpiredArchive
              {...baseProps}
              onEditArticle={(art) => {
                setEditingArticle(art);
                setSection('news-desk');
              }}
              onPublicContentChanged={handlePublicContentChanged}
            />
          )}
          {section === 'pending-deletion' && (
            <AdminPendingDeletion
              {...baseProps}
              onPublicContentChanged={handlePublicContentChanged}
            />
          )}
          {section === 'ipo-manager' && (
            <AdminIpoManager
              {...baseProps}
              onPublicContentChanged={handlePublicContentChanged}
            />
          )}
          {section === 'ipo-review' && (
            <AdminIpoReviews
              {...baseProps}
              onPublicContentChanged={handlePublicContentChanged}
            />
          )}
          {section === 'audit-history' && <AdminAuditHistory {...baseProps} />}
          {section === 'settings' && (
            <AdminSettings
              {...baseProps}
              onPublicContentChanged={handlePublicContentChanged}
            />
          )}
        </section>
      </div>
    </main>
  );
}
