# SakarBazaar Firestore Security Specification

## 1. Roles & Authorization Invariants
1. **Two-Role RBAC (Owner & Publisher) — Authoritative Allowlist Only:**
   - **Owner:** `jeetsheetalpuri@gmail.com` (`isBootstrappedOwner()`, never locked out) OR `/authorizedEmails/{emailLower}` with `active == true && role == 'owner'` (with `email_verified == true`). Holds full operational + system-settings/permissions + Owner-only delete authority.
   - **Publisher:** `/authorizedEmails/{emailLower}` with `active == true && role == 'publisher'` (with `email_verified == true`). Holds full operational authority across newsroom drafting/publishing/extending/retaining/restoring, media management, featured placement, paid publications, permanent deletion approval/execution, IPO management & official-source review, and full manual backup export. Cannot modify `/admins/*`, `/authorizedEmails/*`, or `/systemSettings/*`, and cannot delete verified/audited IPO or commercial records.
   - **No Legacy `/admins/{uid}` Bypass:** `/admins/{uid}` stores display metadata only and never grants authorization when `/authorizedEmails/{emailLower}` is missing or revoked (`active == false`). Both Firestore rules and `server.ts` enforce the exact same allowlist check.
2. **Public Zero-Exposure of Expired, Draft, Deleted, or Private Records:**
   - Public `get` and `list` on `/articles` are allowed ONLY when `status == 'Published'`, `expiresAt > request.time`, and `deletionStatus == 'none'` (or when authorized Owner/Publisher).
   - Public `get` on `/media/{mediaId}` and `/mediaPayloads/{mediaId}` is allowed ONLY when `isPublic == true` and `(expiresAt == null || expiresAt > request.time)`.
   - Public `list` on `/media` and `/mediaPayloads` is NEVER allowed (`if isAuthorizedUser()`).
   - `/paidCampaigns`, `/ipoSourceReviews`, `/authorizedEmails`, `/systemSettings`, `/admins`, `/auditLogs`, and `/contactSubmissions` (reads) are NEVER publicly readable.
   - `/publicCatalog/legacyOverrides` is publicly gettable (singleton `get` only; `list` requires Owner/Publisher) so unpublished, archived, expired, or permanently deleted historical articles cannot resurface from static bundles; writable only by authenticated Owner/Publisher (`isAuthorizedUser()`).
3. **Rule-Enforced Permanent Deletion Workflow & Immutable Audit Trail:**
   - Both Owner and Publisher may transition articles into `Pending Deletion` (`approved`) -> `Deletion In Progress` (`in_progress`).
   - Direct SDK `deleteDoc` on `/articles/{id}` is **DENIED by Firestore rules** unless the existing document already has `status in ['Pending Deletion', 'Deletion In Progress']` AND `deletionStatus in ['approved', 'in_progress', 'partial_failure']`.
   - Deleting `/media/{id}` requires `/mediaPayloads/{id}` to be deleted first (`!exists(mediaPayloads/{id})`) so payloads cannot become orphaned.
   - Deleting `/ipos/{id}` is Owner-only and blocked on `verificationStatus == 'verified'`; `/ipoSourceReviews/{id}` deletion is Owner-only; `/paidCampaigns/{id}` deletion is Owner-only and limited to `Cancelled`, `Completed`, or `Planned` records.
   - `/auditLogs` is append-only (`allow update, delete: if false`) for all clients.
4. **Zero-Billing Document Caps & Schema Validation:**
   - `/mediaPayloads/{mediaId}` strictly enforces `sizeBytes <= 450000` and `dataUrl.size() <= 620000` to remain safely under Firestore's 1 MiB document ceiling.
   - All collections validate required keys, `hasOnly(...)` allowlists, bounded string/array lengths, valid IDs, and `request.time` server timestamps.

## 2. Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. Anonymous client creating or modifying an article in `/articles/{id}` -> Denied (`!isAuthorizedUser()`).
2. Signed-in regular Google user (`email_verified: true`, not allowlisted) reading `/paidCampaigns` or `/auditLogs` -> Denied.
3. Unverified email matching Owner or Publisher email attempting privileged read/write (`email_verified: false`) -> Denied.
4. Revoked or removed allowlist user who still has a stale `/admins/{uid}` document attempting privileged read/write -> Denied (no `/admins/{uid}` bypass).
5. Authorized operator attempting direct `deleteDoc('/articles/{id}')` on a `Published`, `Draft`, `Expired`, or `Retained` article -> Denied (`deletionStatus` not `approved`/`in_progress`/`partial_failure`).
6. Authorized operator attempting to delete `/media/{id}` while `/mediaPayloads/{id}` still exists -> Denied.
7. Publisher attempting to modify `/authorizedEmails/{email}` or `/admins/{uid}` or `/systemSettings/{id}` to escalate role to `'owner'`, or deleting verified IPO / active paid campaign -> Denied (`!isOwner()`).
8. Editor attempting to upload a >1 MB uncompressed photo payload (`dataUrl.size() > 620000`) -> Denied.
9. Editor attempting to create `/articles/{id}` with ghost field (`isSuperAdmin: true`) -> Denied by `hasOnly`.
10. Editor attempting to spoof `actorUid` or delete an `/auditLogs/{id}` document -> Denied (`allow update, delete: if false`).
11. Anonymous client reading an expired article (`expiresAt <= request.time`), expired media, or `/paidCampaigns/{id}` -> Denied.
12. Path ID poisoning (`>128` chars or slashes/special chars) -> Denied by `isValidId()`.
