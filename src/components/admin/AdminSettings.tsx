import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  exportFullBackupBundle,
  restoreBackupBundleToFirestore,
  saveSystemSettings,
  updateAdminUserRole,
  upsertAuthorizedEmail,
} from '../../lib/firebase';
import type {
  AdminUserRecord,
  AuthorizedEmailRecord,
  DurationPreset,
  SakarBazaarBackupBundle,
} from '../../types/sakarbazaar';
import {
  BOOTSTRAPPED_OWNER_EMAIL,
  isValidOperatorEmail,
  normalizeEmailKey,
} from '../../utils/adminPermissions';
import { validateBackupBundle, type BackupValidationReport } from '../../utils/backupRestore';
import { extractReadableErrorMessage } from '../../utils/newsLifecycle';
import type { AdminSectionBaseProps } from './adminTypes';

interface AdminSettingsProps extends AdminSectionBaseProps {
  onPublicContentChanged: () => Promise<void>;
}

export function AdminSettings({
  data,
  adminRole,
  permissions,
  onRefresh,
  onPublicContentChanged,
  onNotify,
}: AdminSettingsProps) {
  // Publisher Google Account Allowlist (Owner-only)
  const [newEmail, setNewEmail] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<'publisher' | 'owner'>('publisher');
  const [savingEmail, setSavingEmail] = useState(false);

  // Global System Settings (Owner-only)
  const [defaultPreset, setDefaultPreset] = useState<DurationPreset>(
    data.systemSettings.defaultDurationPreset || '15d',
  );
  const [expiringHours, setExpiringHours] = useState<number>(
    data.systemSettings.expiringSoonThresholdHours || 48,
  );
  const [maxImgBytes, setMaxImgBytes] = useState<number>(
    data.systemSettings.maxImageSizeBytes || 180_000,
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyOperatorKey, setBusyOperatorKey] = useState<string | null>(null);

  useEffect(() => {
    setDefaultPreset(data.systemSettings.defaultDurationPreset || '15d');
    setExpiringHours(data.systemSettings.expiringSoonThresholdHours || 48);
    setMaxImgBytes(data.systemSettings.maxImageSizeBytes || 180_000);
  }, [
    data.systemSettings.defaultDurationPreset,
    data.systemSettings.expiringSoonThresholdHours,
    data.systemSettings.maxImageSizeBytes,
  ]);

  // Backup Export & Restore
  const [exporting, setExporting] = useState(false);
  const [pendingRestoreBundle, setPendingRestoreBundle] = useState<SakarBazaarBackupBundle | null>(
    null,
  );
  const [validationReport, setValidationReport] = useState<BackupValidationReport | null>(null);
  const [restoring, setRestoring] = useState(false);
  const actionLocksRef = useRef<Record<string, boolean>>({});

  async function handleExportBackup() {
    if (actionLocksRef.current.export) return;
    actionLocksRef.current.export = true;
    setExporting(true);
    try {
      const bundle = await exportFullBackupBundle(adminRole);
      const json = JSON.stringify(bundle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sakarbazaar-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await onRefresh();
      onNotify({
        tone: 'ok',
        text: `Downloaded full backup JSON (${bundle.counts.articles} articles, ${bundle.counts.mediaPayloads} photo payloads, ${bundle.counts.ipos} IPOs).`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Backup export failed.',
      });
    } finally {
      actionLocksRef.current.export = false;
      setExporting(false);
    }
  }

  async function handleBackupFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const report = validateBackupBundle(parsed);
      setValidationReport(report);
      setPendingRestoreBundle(report.valid ? (parsed as SakarBazaarBackupBundle) : null);
    } catch {
      setValidationReport({
        valid: false,
        errors: ['Selected file is not valid JSON.'],
        warnings: [],
        summary: {
          articles: 0,
          media: 0,
          mediaPayloads: 0,
          paidCampaigns: 0,
          ipos: 0,
          ipoSourceReviews: 0,
          auditLogs: 0,
        },
      });
      setPendingRestoreBundle(null);
    }
  }

  async function handleApplyRestore() {
    if (actionLocksRef.current.restore || !permissions.canRestoreBackup || !pendingRestoreBundle) return;
    actionLocksRef.current.restore = true;
    setRestoring(true);
    try {
      const res = await restoreBackupBundleToFirestore(pendingRestoreBundle);
      setPendingRestoreBundle(null);
      setValidationReport(null);
      await onRefresh();
      await onPublicContentChanged();
      onNotify({
        tone: 'ok',
        text: `Owner restore complete: restored ${res.restoredCount} records across collections.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Restore failed.',
      });
    } finally {
      actionLocksRef.current.restore = false;
      setRestoring(false);
    }
  }

  async function handleAddAuthorizedEmail() {
    if (actionLocksRef.current.email || !permissions.canManagePermissionsAndSecurity) return;
    const emailLower = normalizeEmailKey(newEmail);
    if (!isValidOperatorEmail(emailLower)) {
      onNotify({ tone: 'err', text: 'Enter a valid Google email address.' });
      return;
    }
    if (newDisplayName.trim().length < 2) {
      onNotify({ tone: 'err', text: 'Enter a display name (e.g. Father / Publisher).' });
      return;
    }
    actionLocksRef.current.email = true;
    setSavingEmail(true);
    try {
      const exists = data.authorizedEmails.some((item) => item.id === emailLower);
      await upsertAuthorizedEmail({
        email: emailLower,
        displayName: newDisplayName.trim(),
        role: newRole,
        active: true,
        isNew: !exists,
      });
      const matchingAdmin = data.adminUsers.find(
        (u) => normalizeEmailKey(u.email) === emailLower && u.role !== newRole,
      );
      if (matchingAdmin) {
        await updateAdminUserRole(matchingAdmin, newRole);
      }
      setNewEmail('');
      setNewDisplayName('');
      await onRefresh();
      onNotify({ tone: 'ok', text: `Authorized ${newRole} Google account: ${emailLower}` });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Unable to save authorized Google email.',
      });
    } finally {
      actionLocksRef.current.email = false;
      setSavingEmail(false);
    }
  }

  async function handleSaveSystemSettings() {
    if (actionLocksRef.current.settings || !permissions.canManagePermissionsAndSecurity) return;
    actionLocksRef.current.settings = true;
    setSavingSettings(true);
    try {
      await saveSystemSettings({
        defaultDurationPreset: defaultPreset,
        expiringSoonThresholdHours: Math.max(1, Math.min(720, Number(expiringHours) || 48)),
        maxImageSizeBytes: Math.max(40_000, Math.min(400_000, Number(maxImgBytes) || 180_000)),
        requireBilingualPublish: true,
      });
      await onRefresh();
      onNotify({ tone: 'ok', text: 'Saved global newsroom defaults.' });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to save settings.'),
      });
    } finally {
      actionLocksRef.current.settings = false;
      setSavingSettings(false);
    }
  }

  async function handleToggleEmailActive(item: AuthorizedEmailRecord) {
    if (actionLocksRef.current.operator || !permissions.canManagePermissionsAndSecurity || busyOperatorKey) return;
    actionLocksRef.current.operator = true;
    setBusyOperatorKey(item.id);
    try {
      await upsertAuthorizedEmail({
        email: item.email,
        displayName: item.displayName,
        role: item.role,
        active: !item.active,
        isNew: false,
      });
      await onRefresh();
      onNotify({
        tone: 'ok',
        text: `${item.active ? 'Disabled access for' : 'Re-enabled'} ${item.email}.`,
      });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to update operator access.'),
      });
    } finally {
      actionLocksRef.current.operator = false;
      setBusyOperatorKey(null);
    }
  }

  async function handleSwitchAdminRole(usr: AdminUserRecord) {
    if (actionLocksRef.current.operator || !permissions.canManagePermissionsAndSecurity || busyOperatorKey) return;
    actionLocksRef.current.operator = true;
    const nextRole = usr.role === 'owner' ? 'publisher' : 'owner';
    setBusyOperatorKey(usr.uid);
    try {
      await updateAdminUserRole(usr, nextRole);
      const emailLower = normalizeEmailKey(usr.email);
      const matchingAllow = data.authorizedEmails.find((item) => item.id === emailLower);
      if (matchingAllow && matchingAllow.role !== nextRole) {
        await upsertAuthorizedEmail({
          email: matchingAllow.email,
          displayName: matchingAllow.displayName,
          role: nextRole,
          active: matchingAllow.active,
          isNew: false,
        });
      }
      await onRefresh();
      onNotify({ tone: 'ok', text: `Changed ${usr.email} role to ${nextRole}.` });
    } catch (err) {
      onNotify({
        tone: 'err',
        text: extractReadableErrorMessage(err, 'Unable to switch operator role.'),
      });
    } finally {
      actionLocksRef.current.operator = false;
      setBusyOperatorKey(null);
    }
  }

  return (
    <div className="sb-admin-stack">
      {/* Manual Backup Export & Owner-Only Restore */}
      <section className="card snap">
        <div className="sec-h">
          <div>
            <h2>Full Manual Backup &amp; Restore</h2>
            <p className="sb-sec-sub">
              Exports bilingual articles, media metadata, compressed photo payloads, YouTube links/IDs,
              paid campaign tracking, IPO dossiers, review decisions, and audit history as one portable JSON file.
            </p>
          </div>
          <button
            type="button"
            className="btn sb-admin-touch-btn"
            disabled={exporting}
            onClick={() => void handleExportBackup()}
          >
            {exporting ? 'Preparing Backup JSON…' : 'Download Full Backup JSON'}
          </button>
        </div>

        <div className="sb-note-box">
          <strong>Important Backup Scope:</strong> Compressed article photographs are included in the JSON
          backup. Video files live on YouTube and on the Owner PC — this backup includes YouTube IDs,
          URLs, and video metadata only.
        </div>

        {permissions.canRestoreBackup ? (
          <div className="sb-admin-subpanel" style={{ marginTop: '14px' }}>
            <h3>Owner-Only Backup Restore (Dry-Run Validation + Merge)</h3>
            <label className="sb-form-field">
              <span>Upload SakarBazaar Backup JSON File</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => void handleBackupFileSelect(e)}
              />
            </label>

            {validationReport && (
              <div className={`sb-admin-alert ${validationReport.valid ? 'ok' : 'err'}`} style={{ marginTop: '10px' }}>
                {validationReport.valid ? (
                  <div>
                    <strong>Valid SakarBazaar v1.0.0 Backup Detected:</strong>{' '}
                    {validationReport.summary.articles} articles · {validationReport.summary.mediaPayloads} photos ·{' '}
                    {validationReport.summary.ipos} IPOs · {validationReport.summary.paidCampaigns} paid records.
                    {validationReport.warnings.length > 0 && (
                      <div className="meta" style={{ marginTop: '4px' }}>
                        Warnings: {validationReport.warnings.join(' | ')}
                      </div>
                    )}
                    <div style={{ marginTop: '10px' }}>
                      <button
                        type="button"
                        className="btn sb-admin-touch-btn"
                        disabled={restoring}
                        onClick={() => void handleApplyRestore()}
                      >
                        {restoring ? 'Restoring Records…' : 'Confirm & Restore Backup to Firestore'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <strong>Backup Validation Failed:</strong> {validationReport.errors.join(' ')}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="meta" style={{ marginTop: '12px' }}>
            Only the <strong>Owner</strong> account may restore backups or alter system permissions.
          </p>
        )}
      </section>

      {/* Owner-Only: Publisher / Operator Access Management */}
      <section className="card snap">
        <div className="sec-h">
          <div>
            <h2>Operator Permissions (Owner-Only Access Control)</h2>
            <p className="sb-sec-sub">
              Bootstrapped Owner: <strong>{BOOTSTRAPPED_OWNER_EMAIL}</strong>. Add your father&apos;s
              verified Google account email here with role <strong>Publisher</strong>.
            </p>
          </div>
        </div>

        {permissions.canManagePermissionsAndSecurity ? (
          <>
            <div className="sb-form-grid">
              <label className="sb-form-field">
                <span>Operator Google Email Address</span>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="father-email@gmail.com"
                />
              </label>
              <label className="sb-form-field">
                <span>Display Name</span>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="e.g. Father (Publisher)"
                />
              </label>
            </div>

            <div className="sb-form-grid">
              <label className="sb-form-field">
                <span>Assigned Role</span>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'publisher' | 'owner')}
                >
                  <option value="publisher">Publisher (News, Media, Deletions, IPOs)</option>
                  <option value="owner">Owner (Full Control + Settings + Restore)</option>
                </select>
              </label>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '12px' }}>
                <button
                  type="button"
                  className="btn sb-admin-touch-btn"
                  disabled={savingEmail}
                  onClick={() => void handleAddAuthorizedEmail()}
                >
                  {savingEmail ? 'Saving…' : 'Authorize Google Email'}
                </button>
              </div>
            </div>

            {data.authorizedEmails.length > 0 && (
              <div className="sb-admin-list" style={{ marginTop: '12px' }}>
                {data.authorizedEmails.map((item) => (
                  <div className="sb-admin-list-row" key={item.id}>
                    <div>
                      <strong>{item.displayName}</strong> — {item.email}
                      <div className="meta">Role: {item.role} · {item.active ? 'Active' : 'Disabled'}</div>
                    </div>
                    {item.id !== BOOTSTRAPPED_OWNER_EMAIL.toLowerCase() && (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busyOperatorKey === item.id}
                        onClick={() => void handleToggleEmailActive(item)}
                      >
                        {busyOperatorKey === item.id
                          ? 'Updating…'
                          : item.active
                            ? 'Revoke Access'
                            : 'Re-enable'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {data.adminUsers.length > 0 && (
              <>
                <h3 style={{ marginTop: '18px' }}>Signed-In Operator Profiles ({data.adminUsers.length})</h3>
                <div className="sb-admin-list">
                  {data.adminUsers.map((usr) => (
                    <div className="sb-admin-list-row" key={usr.uid}>
                      <div>
                        <strong>{usr.displayName}</strong> ({usr.email})
                        <div className="meta">UID: {usr.uid} · Role: {usr.role}</div>
                      </div>
                      {usr.email.toLowerCase() !== BOOTSTRAPPED_OWNER_EMAIL.toLowerCase() && (
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={busyOperatorKey === usr.uid}
                          onClick={() => void handleSwitchAdminRole(usr)}
                        >
                          {busyOperatorKey === usr.uid
                            ? 'Updating…'
                            : `Switch to ${usr.role === 'owner' ? 'Publisher' : 'Owner'}`}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <p className="meta" style={{ margin: 0 }}>
            Restricted to Owner account. Your Publisher account has full news, media, deletion, and IPO workflow rights.
          </p>
        )}
      </section>

      {/* Owner-Only System Defaults */}
      {permissions.canManagePermissionsAndSecurity && (
        <section className="card snap">
          <div className="sec-h">
            <h2>Default Duration &amp; Compression Settings</h2>
          </div>
          <div className="sb-form-grid">
            <label className="sb-form-field">
              <span>Default Publication Duration</span>
              <select
                value={defaultPreset}
                onChange={(e) => setDefaultPreset(e.target.value as DurationPreset)}
              >
                <option value="7d">7 Days (168h)</option>
                <option value="15d">15 Days (360h)</option>
                <option value="30d">30 Days (720h)</option>
                <option value="60d">60 Days (1,440h)</option>
              </select>
            </label>
            <label className="sb-form-field">
              <span>Expiring Soon Dashboard Threshold (Hours)</span>
              <input
                type="number"
                min={1}
                max={720}
                value={expiringHours}
                onChange={(e) => setExpiringHours(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="sb-form-field" style={{ maxWidth: '320px' }}>
            <span>Target Compressed Photo Size (Bytes)</span>
            <input
              type="number"
              min={40000}
              max={380000}
              step={10000}
              value={maxImgBytes}
              onChange={(e) => setMaxImgBytes(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="btn sb-admin-touch-btn"
            disabled={savingSettings}
            onClick={() => void handleSaveSystemSettings()}
          >
            {savingSettings ? 'Saving Defaults…' : 'Save System Defaults'}
          </button>
        </section>
      )}
    </div>
  );
}
