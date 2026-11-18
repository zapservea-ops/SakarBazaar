# SakarBazaar Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Editorial RBAC & Zero Public Writes:** Public visitors may read `articles` ONLY when `status == 'Published'`, `ipos` ONLY when `verificationStatus == 'verified'`, `marketInstruments`, and `media`. Only verified-email administrators/editors (`isAdmin()` or `isEditor()`) may create, edit, verify, or publish editorial records.
2. **Draft & Verification Isolation:** Drafts (`status == 'Draft'`), unverified claims (`status == 'Awaiting Verification'`), `auditLogs`, `admins`, and `contactSubmissions` are NEVER publicly readable or writable.
3. **Immutable Audit Trail:** `auditLogs` are append-only by authorized editors/admins matching `actorUid == request.auth.uid` and `createdAt == request.time`, and cannot be updated or deleted by anyone via client SDKs.
4. **Bootstrapped Admin & Anti-Privilege-Escalation:** Users cannot write `/admins/{uid}` directly unless they are the bootstrapped owner (`jeetsheetalpuri@gmail.com` with `email_verified == true`) or an existing admin in `/admins/{request.auth.uid}`.
5. **Bounded Arrays & Strict Schemas:** Every string has `.size()` bounds, every array is bounded (`<= 20` keywords/entities, `<= 12` tags, `<= 8` citations), every ID matches `^[a-zA-Z0-9_-]+$`, and `createdAt`/`updatedAt` strictly equal `request.time`.

## 2. Adversarial "Dirty Dozen" Payloads (All Must Return PERMISSION_DENIED)
1. Anonymous client creating an article in `/articles/fake-1` -> Denied (`!isEditor()`).
2. Signed-in non-admin regular Google user (`email_verified: true`, not in `/admins`) publishing an article -> Denied (`!isEditor()`).
3. Unverified email matching admin email attempting privileged read/write (`email_verified: false`) -> Denied (`token.email_verified != true`).
4. Anonymous client reading an article with `status: 'Draft'` or `'Awaiting Verification'` -> Denied.
5. Anonymous client querying `/articles` without `where('status', '==', 'Published')` -> Denied by `allow list`.
6. Anonymous client reading `/ipos` where `verificationStatus == 'awaiting_verification'` -> Denied.
7. Non-admin reading `/contactSubmissions` (contains reader emails PII) -> Denied.
8. Authorized editor creating an article with a ghost field (`isSuperAdmin: true`) -> Denied by `hasOnly`.
9. Authorized editor spoofing `createdByUid` to another UID -> Denied by identity check.
10. Authorized editor spoofing `createdAt` or `updatedAt` with client timestamp -> Denied by `== request.time`.
11. Authorized editor attempting to delete or mutate an `/auditLogs/{id}` document -> Denied (`allow update, delete: if false`).
12. Path ID poisoning (`1500`-char document ID or invalid characters) -> Denied by `isValidId()`.
