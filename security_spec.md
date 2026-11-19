# SakarBazaar Firestore Security Specification (Phase 0 TDD)

## 1. Roles & Authorization Invariants
1. **Two-Role RBAC (Owner & Publisher):**
   - **Owner:** `jeetsheetalpuri@gmail.com` (`isBootstrappedOwner()`, never locked out) or `/admins/{uid}` with `role in ['owner', 'admin']` (with `email_verified == true`). Holds full operational + system-settings/permissions authority.
   - **Publisher:** `/admins/{uid}` with `role in ['publisher', 'editor']`, OR an active entry in `/authorizedEmails/{emailLower}` (`active == true`) with `email_verified == true`. Holds full operational authority across newsroom drafting/publishing/extending/retaining/restoring, media management, featured placement, paid publications, permanent deletion approval/execution, IPO management & official-source review, and full manual backup export. Cannot modify `/admins/*`, `/authorizedEmails/*`, or `/systemSettings/*`.
2. **Public Zero-Exposure of Expired, Draft, Deleted, or Private Records:**
   - Public `get` and `list` on `/articles` are allowed ONLY when `status == 'Published'`, `expiresAt > request.time`, and `deletionStatus == 'none'` (or when authorized Owner/Publisher).
   - Public `get` on `/media/{mediaId}` and `/mediaPayloads/{mediaId}` is allowed ONLY when `isPublic == true` and `(expiresAt == null || expiresAt > request.time)`.
   - Public `list` on `/media` and `/mediaPayloads` is NEVER allowed (`if isAuthorizedUser()`).
   - `/paidCampaigns`, `/ipoSourceReviews`, `/authorizedEmails`, `/systemSettings`, `/admins`, `/auditLogs`, and `/contactSubmissions` (reads) are NEVER publicly readable.
3. **Either-User Permanent Deletion & Immutable Audit Trail:**
   - Both Owner and Publisher may transition articles into `Pending Deletion` -> `Deletion In Progress` and delete unshared `/media`, `/mediaPayloads`, and `/articles` documents.
   - `/auditLogs` is append-only (`allow update, delete: if false`) for all clients, preserving minimal deletion and approval history.
4. **Zero-Billing Document Caps & Schema Validation:**
   - `/mediaPayloads/{mediaId}` strictly enforces `sizeBytes <= 450000` and `dataUrl.size() <= 620000` to remain safely under Firestore's 1 MiB document ceiling.
   - All collections validate required keys, `hasOnly(...)` allowlists, bounded string/array lengths, valid IDs, and `request.time` server timestamps.

## 2. Adversarial "Dirty Dozen" Payloads (All Must Return PERMISSION_DENIED)
1. Anonymous client creating or modifying an article in `/articles/{id}` -> Denied (`!isEditor()`).
2. Signed-in regular Google user (`email_verified: true`, not Owner/Publisher) reading `/paidCampaigns` or `/auditLogs` -> Denied.
3. Unverified email matching Owner or Publisher email attempting privileged read/write (`email_verified: false`) -> Denied.
4. Anonymous client reading an expired article via direct `getDoc('/articles/{id}')` where `expiresAt <= request.time` -> Denied.
5. Anonymous client reading an expired/private photograph payload via `getDoc('/mediaPayloads/{id}')` where `isPublic == false` or `expiresAt <= request.time` -> Denied.
6. Anonymous client listing `/mediaPayloads` -> Denied (`allow list: if isEditor()`).
7. Publisher attempting to modify `/authorizedEmails/{email}` or `/admins/{uid}` or `/systemSettings/{id}` to escalate role to `'owner'` -> Denied (`!isOwner()`).
8. Editor attempting to upload a >1 MB uncompressed photo payload (`dataUrl.size() > 620000`) -> Denied.
9. Editor attempting to create `/articles/{id}` with ghost field (`isSuperAdmin: true`) -> Denied by `hasOnly`.
10. Editor attempting to spoof `actorUid` or delete an `/auditLogs/{id}` document -> Denied (`allow update, delete: if false`).
11. Anonymous client reading `/paidCampaigns/{id}` (internal commercial notes) -> Denied.
12. Path ID poisoning (`>128` chars or slashes/special chars) -> Denied by `isValidId()`.
