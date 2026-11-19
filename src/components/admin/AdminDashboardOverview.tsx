import { ARTICLES_CATALOG } from '../../data/sampleData';
import {
  formatRemainingDuration,
  isArticleExpired,
  isArticleExpiringSoon,
  isArticlePubliclyVisible,
} from '../../utils/newsLifecycle';
import { estimateMediaQuotaUsage } from '../../utils/mediaLibrary';
import type { AdminSectionBaseProps } from './adminTypes';

export function AdminDashboardOverview({
  data,
  adminRole,
  onNavigate,
}: AdminSectionBaseProps) {
  const nowMs = Date.now();
  const thresholdHours = data.systemSettings.expiringSoonThresholdHours || 48;

  const activePublished = data.articles.filter((a) => isArticlePubliclyVisible(a, nowMs));
  const drafts = data.articles.filter((a) => a.status === 'Draft' || a.status === 'Awaiting Verification' || a.status === 'Verified');
  const expiringSoon = data.articles.filter((a) => isArticleExpiringSoon(a, nowMs, thresholdHours));
  const expiredOrRetained = data.articles.filter(
    (a) =>
      (a.status === 'Expired' ||
        a.status === 'Retained' ||
        a.status === 'Archived' ||
        (a.status === 'Published' && isArticleExpired(a, nowMs))) &&
      a.deletionStatus !== 'approved' &&
      a.deletionStatus !== 'in_progress' &&
      a.deletionStatus !== 'partial_failure',
  );
  const firestoreIds = new Set(data.articles.map((a) => a.id));
  const firestoreSlugs = new Set(data.articles.map((a) => a.slug));
  const unmigratedLegacyCount = ARTICLES_CATALOG.filter(
    (base) => !firestoreIds.has(base.id) && !firestoreSlugs.has(base.slug),
  ).length;
  const pendingDeletion = data.articles.filter(
    (a) =>
      a.status === 'Pending Deletion' ||
      a.status === 'Deletion In Progress' ||
      a.deletionStatus === 'approved' ||
      a.deletionStatus === 'partial_failure',
  );
  const needsReviewIpos = data.ipoReviews.filter((r) => r.reviewStatus === 'Needs Review');
  const quota = estimateMediaQuotaUsage(data.media);

  return (
    <div className="sb-admin-stack">
      <section className="card snap">
        <div className="sec-h">
          <div>
            <h2>Newsroom Overview</h2>
            <p className="sb-sec-sub">
              Signed in with <strong>{adminRole === 'owner' ? 'Owner (Full Control)' : 'Publisher (News, Media & IPO Operations)'}</strong> permissions.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn sb-admin-touch-btn"
              onClick={() => onNavigate('news-desk')}
            >
              + New Bilingual Article
            </button>
            <button
              type="button"
              className="btn ghost sb-admin-touch-btn"
              onClick={() => onNavigate('ipo-review')}
            >
              Check IPO Sources
            </button>
          </div>
        </div>

        <div className="sb-admin-kpi-grid">
          <button type="button" className="sb-admin-kpi" onClick={() => onNavigate('manage-news')}>
            <b>{activePublished.length}</b>
            <span>Live Public Articles</span>
          </button>
          <button type="button" className="sb-admin-kpi" onClick={() => onNavigate('manage-news')}>
            <b>{expiringSoon.length}</b>
            <span>Expiring Within {thresholdHours}h</span>
          </button>
          <button type="button" className="sb-admin-kpi" onClick={() => onNavigate('manage-news')}>
            <b>{drafts.length}</b>
            <span>Working Drafts</span>
          </button>
          <button type="button" className="sb-admin-kpi" onClick={() => onNavigate('expired')}>
            <b>{expiredOrRetained.length}</b>
            <span>Expired / Archived Private</span>
          </button>
          <button type="button" className="sb-admin-kpi" onClick={() => onNavigate('manage-news')}>
            <b>{unmigratedLegacyCount}</b>
            <span>Legacy Static Unmigrated</span>
          </button>
          <button type="button" className="sb-admin-kpi" onClick={() => onNavigate('pending-deletion')}>
            <b>{pendingDeletion.length}</b>
            <span>Pending Deletion</span>
          </button>
          <button type="button" className="sb-admin-kpi" onClick={() => onNavigate('ipo-review')}>
            <b>{needsReviewIpos.length}</b>
            <span>IPO Changes Need Review</span>
          </button>
        </div>
      </section>

      <div className="sb-admin-two-col">
        <section className="card snap">
          <div className="sec-h">
            <h2>Expiring Soon ({expiringSoon.length})</h2>
            <button type="button" className="btn ghost" onClick={() => onNavigate('manage-news')}>
              Manage News →
            </button>
          </div>
          {expiringSoon.length > 0 ? (
            <div className="sb-admin-list">
              {expiringSoon.slice(0, 6).map((art) => (
                <div className="sb-admin-list-row" key={art.id}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{art.enHeadline || art.title}</strong>
                    <div className="meta">
                      {art.category} · {formatRemainingDuration(art.expiresAtMs, nowMs)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => onNavigate('manage-news')}
                  >
                    Extend
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="meta" style={{ margin: 0 }}>
              No published articles are within the {thresholdHours}-hour expiry alert window.
            </p>
          )}
        </section>

        <section className="card snap">
          <div className="sec-h">
            <h2>Zero-Billing Spark Quota Monitor</h2>
            <span
              className={`pill ${
                quota.warningLevel === 'critical'
                  ? 'sb-pill-amber'
                  : quota.warningLevel === 'caution'
                    ? 'sb-pill-amber'
                    : 'sb-pill-teal'
              }`}
            >
              {quota.warningLevel.toUpperCase()}
            </span>
          </div>
          <div className="sb-admin-quota-stats">
            <div>
              <span className="meta">Stored Photos</span>
              <strong>{quota.photoCount} compressed files</strong>
            </div>
            <div>
              <span className="meta">Estimated DB Footprint</span>
              <strong>{quota.totalStoredMb} MB / 1,024 MB (Spark 1 GiB)</strong>
            </div>
            <div>
              <span className="meta">Daily Read Budget</span>
              <strong>50,000 reads/day (all visitors combined)</strong>
            </div>
          </div>
          <p className="meta" style={{ margin: '10px 0 0', lineHeight: 1.55 }}>
            {quota.guidanceNote}
          </p>
        </section>
      </div>

      <section className="card snap">
        <div className="sec-h">
          <h2>Recent Audit Activity</h2>
          <button type="button" className="btn ghost" onClick={() => onNavigate('audit-history')}>
            Full Audit Log →
          </button>
        </div>
        {data.auditLogs.length > 0 ? (
          <div className="sb-admin-list">
            {data.auditLogs.slice(0, 6).map((log) => (
              <div className="sb-admin-list-row" key={log.id}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{log.summary}</div>
                  <div className="meta">
                    {log.action} → {log.nextStatus} · {log.actorEmail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="meta" style={{ margin: 0 }}>
            Audit actions (drafts, publishes, duration extensions, deletions, backups) appear here.
          </p>
        )}
      </section>
    </div>
  );
}
