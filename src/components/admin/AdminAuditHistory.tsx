import { useState } from 'react';
import type { AdminSectionBaseProps } from './adminTypes';

export function AdminAuditHistory({ data }: AdminSectionBaseProps) {
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [queryText, setQueryText] = useState('');

  const filtered = data.auditLogs.filter((entry) => {
    if (entityFilter !== 'all' && entry.entityType !== entityFilter) return false;
    if (queryText.trim()) {
      const q = queryText.toLowerCase();
      return (
        entry.summary.toLowerCase().includes(q) ||
        entry.actorEmail.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <section className="card snap">
      <div className="sec-h">
        <div>
          <h2>Audit History ({filtered.length})</h2>
          <p className="sb-sec-sub">
            Immutable chronological log of publications, edits, duration extensions, deletions,
            IPO approvals, backups, and security updates.
          </p>
        </div>
      </div>

      <div className="sb-admin-toolbar">
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          aria-label="Filter audit entity type"
        >
          <option value="all">All Entities</option>
          <option value="article">Articles</option>
          <option value="media">Media</option>
          <option value="ipo">IPOs</option>
          <option value="ipoReview">IPO Reviews</option>
          <option value="paidCampaign">Paid Campaigns</option>
          <option value="backup">Backups</option>
          <option value="system">System / Permissions</option>
        </select>

        <input
          type="search"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Search operator email, action, or summary…"
          className="sb-admin-search-input"
        />
      </div>

      {filtered.length > 0 ? (
        <div className="sb-admin-list">
          {filtered.map((entry) => (
            <div className="sb-admin-list-row" key={entry.id}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <span className="pill">{entry.entityType}</span>
                  <span className="pill sb-pill-teal">{entry.action}</span>
                  {entry.previousStatus && (
                    <span className="meta">
                      {entry.previousStatus} → {entry.nextStatus}
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{entry.summary}</div>
                <div className="meta">
                  By {entry.actorEmail}
                  {entry.createdAtMs
                    ? ` · ${new Date(entry.createdAtMs).toLocaleString('en-IN')}`
                    : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="meta" style={{ margin: '12px 0 0' }}>
          No audit entries match this filter.
        </p>
      )}
    </section>
  );
}
