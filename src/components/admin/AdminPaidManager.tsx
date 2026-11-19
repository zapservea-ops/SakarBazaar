import { useRef, useState } from 'react';
import { savePaidCampaign } from '../../lib/firebase';
import type { PaidCampaignRecord } from '../../types/sakarbazaar';
import { extractReadableErrorMessage, extractTimestampMillis } from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

export function AdminPaidManager({ data, onRefresh, onNotify }: AdminSectionBaseProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [articleId, setArticleId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationHours, setDurationHours] = useState<number>(360);
  const [placementPreference, setPlacementPreference] = useState('Standard news feed');
  const [internalStatus, setInternalStatus] = useState<PaidCampaignRecord['internalStatus']>('Planned');
  const [disclosureEnabled, setDisclosureEnabled] = useState(true);
  const [disclosureLabel, setDisclosureLabel] = useState('Partner Disclosure');
  const [commercialNotes, setCommercialNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pendingPaidIdRef = useRef<string | null>(null);
  const editingUpdatedAtMsRef = useRef<number | null>(null);

  function resetForm() {
    pendingPaidIdRef.current = null;
    editingUpdatedAtMsRef.current = null;
    setEditingId(null);
    setClientName('');
    setArticleId('');
    setStartDate('');
    setEndDate('');
    setDurationHours(360);
    setPlacementPreference('Standard news feed');
    setInternalStatus('Planned');
    setDisclosureEnabled(true);
    setDisclosureLabel('Partner Disclosure');
    setCommercialNotes('');
  }

  function loadCampaign(c: PaidCampaignRecord) {
    pendingPaidIdRef.current = c.id;
    editingUpdatedAtMsRef.current = extractTimestampMillis(c.updatedAt);
    setEditingId(c.id);
    setClientName(c.clientName);
    setArticleId(c.articleId || '');
    setStartDate(c.startDate || '');
    setEndDate(c.endDate || '');
    setDurationHours(c.durationHours || 360);
    setPlacementPreference(c.placementPreference || '');
    setInternalStatus(c.internalStatus);
    setDisclosureEnabled(c.disclosureEnabled);
    setDisclosureLabel(c.disclosureLabel || 'Partner Disclosure');
    setCommercialNotes(c.commercialNotes || '');
  }

  async function handleSave() {
    if (busyRef.current) return;
    if (clientName.trim().length < 2) {
      onNotify({ tone: 'err', text: 'Client name (2+ characters) is required.' });
      return;
    }
    if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 43800) {
      onNotify({ tone: 'err', text: 'Campaign duration must be between 1 and 43,800 hours.' });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const linked = data.articles.find((a) => a.id === articleId);
      if (!editingId && !pendingPaidIdRef.current) {
        pendingPaidIdRef.current = `paid_${Date.now().toString(36)}`;
      }
      const id = editingId || pendingPaidIdRef.current!;
      await savePaidCampaign(
        {
          id,
          clientName: clientName.trim(),
          articleId: articleId || undefined,
          articleTitle: linked ? linked.enHeadline || linked.title : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          durationHours: Math.round(durationHours),
          placementPreference,
          internalStatus,
          disclosureEnabled,
          disclosureLabel: disclosureEnabled ? disclosureLabel : 'Editorial',
          commercialNotes,
        },
        !editingId,
        editingId ? editingUpdatedAtMsRef.current : null,
      );
      await onRefresh();
      resetForm();
      onNotify({ tone: 'ok', text: `Saved private paid campaign for ${clientName.trim()}.` });
    } catch (err) {
      onNotify({ tone: 'err', text: extractReadableErrorMessage(err, 'Unable to save campaign.') });
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
            <h2>Paid Publications (Private Internal Tracker)</h2>
            <p className="sb-sec-sub">
              Commercial notes, client agreements, and campaign records remain strictly private to Owner &amp; Publisher.
              Public site shows only a subtle disclosure label when enabled — never a separate Sponsored section.
            </p>
          </div>
          {editingId && (
            <button type="button" className="btn ghost sb-admin-touch-btn" onClick={resetForm}>
              + New Campaign
            </button>
          )}
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Client / Partner Name</span>
            <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Company or Agency" />
          </label>
          <label className="sb-form-field">
            <span>Linked News Article (Optional)</span>
            <select value={articleId} onChange={(e) => setArticleId(e.target.value)}>
              <option value="">None linked yet</option>
              {data.articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.enHeadline || a.title} ({a.status})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Start Date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="sb-form-field">
            <span>End Date</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Duration (Hours)</span>
            <input
              type="number"
              min={1}
              max={43800}
              value={durationHours}
              onChange={(e) => setDurationHours(Math.min(43800, Math.max(1, Number(e.target.value) || 24)))}
            />
          </label>
          <label className="sb-form-field">
            <span>Internal Status</span>
            <select
              value={internalStatus}
              onChange={(e) => setInternalStatus(e.target.value as PaidCampaignRecord['internalStatus'])}
            >
              <option value="Planned">Planned</option>
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>
        </div>

        <div className="sb-form-grid">
          <label className="sb-form-field">
            <span>Placement Preference</span>
            <input
              type="text"
              value={placementPreference}
              onChange={(e) => setPlacementPreference(e.target.value)}
            />
          </label>
          <label className="sb-form-field">
            <span>Public Disclosure Label (when enabled)</span>
            <input
              type="text"
              value={disclosureLabel}
              onChange={(e) => setDisclosureLabel(e.target.value)}
            />
          </label>
        </div>

        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          <input
            type="checkbox"
            checked={disclosureEnabled}
            onChange={(e) => setDisclosureEnabled(e.target.checked)}
          />
          <span>Display disclosure badge on linked article</span>
        </label>

        <label className="sb-form-field">
          <span>Private Commercial Notes (Never visible publicly)</span>
          <textarea
            rows={3}
            value={commercialNotes}
            onChange={(e) => setCommercialNotes(e.target.value)}
            placeholder="Agreement summary, contact details, invoice note..."
          />
        </label>

        <button type="button" className="btn sb-admin-touch-btn" disabled={busy} onClick={() => void handleSave()}>
          {editingId ? 'Update Private Campaign' : 'Save Private Campaign'}
        </button>
      </section>

      <section className="card snap">
        <h3>Saved Paid Campaigns ({data.paidCampaigns.length})</h3>
        {data.paidCampaigns.length > 0 ? (
          <div className="sb-admin-card-list">
            {data.paidCampaigns.map((c) => (
              <div className="sb-admin-item-card" key={c.id}>
                <div className="sb-admin-item-top">
                  <span className="pill sb-pill-teal">{c.internalStatus}</span>
                  <span className="meta">
                    {c.startDate || 'No start'} → {c.endDate || 'No end'} ({c.durationHours || 0}h)
                  </span>
                </div>
                <h3>{c.clientName}</h3>
                {c.articleTitle && <div className="meta">Article: {c.articleTitle}</div>}
                {c.commercialNotes && <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--muted)' }}>{c.commercialNotes}</p>}
                <div className="sb-admin-item-actions" style={{ marginTop: '10px' }}>
                  <button type="button" className="btn ghost" onClick={() => loadCampaign(c)}>
                    Edit Record
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="meta" style={{ margin: 0 }}>No private paid campaign records yet.</p>
        )}
      </section>
    </div>
  );
}
