# SakarBazaar IPO Manager Investigation & Implementation Ledger

## Status
- **Current Phase**: Phase 1 Complete (Inspection Only — Blocked on GitHub `53785de` Reconciliation Gate)
- **Last Updated**: 2026-11-19
- **App Code Modified in This Turn**: None (per Phase 1 "no code changes yet" and Section 2 GitHub sync gate)

---

## 1. Git / Workspace Continuity Check (`zapservea-ops/SakarBazaar`, `main`, target `53785de`)
- **Container Git State (`VERIFIED`)**: `git status` / `git log -n 5` returned `fatal: not a git repository (or any of the parent directories): .git`. AI Studio does not expose a `.git` folder or a GitHub Sync panel tool to the coding agent.
- **Check against `53785de` (`VERIFIED`)**:
  - `src/components/admin/AdminIpoManager.tsx` is **298 lines** (vs ~1,580 lines expected in `53785de`).
  - `buildUnifiedIpoManagementList` is **absent** across the codebase.
  - `manualStage` state is **absent** in `src/components/admin/AdminIpoManager.tsx` (line 21 defaults `verificationStatus` to `'verified'` — `"Verified (Visible on Public /ipo & /calendar)"`).
  - `src/utils/ipoLifecycle.ts` is **823 lines** (vs ~2,550 lines expected in `53785de`), exporting `buildUnifiedIpoManagementRecords`, `getAllowedIpoActions`, `getIpoCategoryCounts`, `filterAndSortManagedIpos`, `resolveEffectiveIpoStatus`, `calculateIpoStatusFromDates`, `isPublicVerifiedIpo`.
  - `src/lib/firebase.ts` is **1,815 lines** (vs ~2,800 lines expected in `53785de`); lacks `updateIpoLifecycleStatus` and `deleteIpoRecordSafely`.
  - `firestore.rules` (644 lines) has inline rules under `match /ipos/{ipoId}` (lines 527–549) and **no** `isPublicIpo` helper.
  - `firestore.indexes.json` does **not** exist in `/`.
- **Conclusion (`VERIFIED`)**: This workspace is **behind/diverged from `53785de`** for IPO Management, while also containing earlier local fixes (`src/pages/CalendarPage.tsx`, `src/pages/EditorialDeskPage.tsx`, `src/utils/newsLifecycle.ts`, `src/lib/firebase.ts`, `src/components/admin/AdminSettings.tsx`, `src/pages/AdminPage.tsx`, `src/utils/adminAndLifecycle.test.ts`).
- **Action Required Before App Code Edits**: Per Section 2 (*"Never push the workspace over GitHub, never force-push, never re-implement something GitHub already has. If the sync panel reports a conflict or divergence, stop and report it; ask the Owner before choosing a direction"*), stopped after Phase 1 inspection to ask the Owner whether to pull `53785de` via the AI Studio GitHub panel or proceed building on this workspace.

---

## 2. Root Cause (`VERIFIED`)
1. **Workspace Behind `53785de` + Disconnected UI (`src/components/admin/AdminIpoManager.tsx:1-298`)**:
   - `AdminIpoManager.tsx` imports only `calculateIpoStatusFromDates` and `formatOfficialIpoField` from `src/utils/ipoLifecycle.ts` (line 4) and `saveManagedIpoRecord` from `src/lib/firebase.ts` (line 2).
   - It never imports or calls `buildUnifiedIpoManagementRecords()`, `getAllowedIpoActions()`, `getIpoCategoryCounts()`, or `filterAndSortManagedIpos()`.
   - When `data.ipos` (Firestore `/ipos`) is empty, lines 289–293 render only `"No custom Firestore IPO records yet. Add one above or run IPO Source Review to import official candidates."` — so the Owner sees only the manual entry form (with `'verified'` selected by default at line 21) and zero built-in IPO rows (`1` editorial + `7` SEBI filings).
2. **Backend/Logic Gaps in Current Workspace (`VERIFIED`)**:
   - `saveManagedIpoRecord()` (`src/lib/firebase.ts:1300-1361`) unconditionally overwrites `status` with `calculateIpoStatusFromDates(...)`, preventing `Draft`, `Rejected`, `Archived`, `Pending Deletion`, and `Deleted` states from persisting.
   - No IPO lifecycle transition or safe-deletion persistence functions exist in `src/lib/firebase.ts`.
   - `AdminIpoManager.tsx:91-116` recomputes `slug` from `companyName` on edit instead of preserving the existing slug, and passes `!editingId` (`isNew=false`) without checking if a static record exists in Firestore `/ipos`.
   - `buildUnifiedIpoManagementRecords()` (`src/utils/ipoLifecycle.ts:361`) deduplicates by `normCompany`, which merges distinct IPO issues that share a company name.
   - `fetchPublicVerifiedIpos()` (`src/lib/firebase.ts:1267-1284`) filters only `where('verificationStatus', '==', 'verified')` and omits filtering by `isPublicVerifiedIpo()`, risking public exposure if an archived/pending-deletion/deleted record still has `verificationStatus === 'verified'`.
   - `CalendarPage.tsx:47-49` suppresses verified Firestore IPOs whose `companyName` matches any static `SEBI_IPO_FILINGS` entry (`!seenNames.has(...)`), preventing Firestore edits from shadowing static filings.
   - `SakarBazaarContext.tsx:348-364` merges `IPO_ALL_RECORDS` whenever a slug is absent from `remoteVerifiedIpos`, so archiving/unpublishing/deleting a static IPO in Firestore would allow `IPO_ALL_RECORDS` to reappear publicly.

---

## 3. IPO Source Inventory Table

| Source | File / Collection | Record Count | Key Fields | (a) How it reaches Admin Table | (b) How it reaches Public Pages |
|---|---|---|---|---|---|
| Built-in Editorial IPO Catalog | `src/data/editorialData.ts` (`IPO_ALL_RECORDS`, L668–718) | **1** (`VERIFIED`: `ipo-mcl-editorial` / Mahanadi Coalfields Limited, `verificationStatus: 'proposed'`) | `id`, `slug`, `segment`, `status`, `verificationStatus`, `company`, `issueSize`, `priceBand`, `openDate`, `closeDate`, `offerType`, `sellingShareholder`, `officialDocuments`, `relatedArticleSlug` | **Not reached** (`AdminIpoManager.tsx` ignores `IPO_ALL_RECORDS` and does not call `buildUnifiedIpoManagementRecords`) | `SakarBazaarContext.tsx:357-363` appends if `slug` not in `remoteVerifiedIpos` -> `/ipo`, `/ipo/:slug`, `Header.tsx` search, `SupportingPage.tsx` sitemap. Excluded from `/calendar` (`CalendarPage.tsx:49` requires `verified`). |
| Built-in Static SEBI Filings | `src/data/sebiIpoData.ts` (`SEBI_IPO_FILINGS`, L36–161) | **7** (`VERIFIED`: NTPC Green, Enviro Infra, Zinka Logistics, C2C Advanced, Rajesh Power, Avanse Financial, One Mobikwik) | `id`, `companyName`, `filingDate`, `category`, `documentType`, `scheduleStatus`, `openDate`, `closeDate`, `priceBand`, `issueSize`, `leadManagers`, `sebiDocumentUrl`, `exchangeNoticeUrl`, `lastCheckedDate` | **Not reached** (`AdminIpoManager.tsx` ignores `SEBI_IPO_FILINGS` and does not call `buildUnifiedIpoManagementRecords`) | `CalendarPage.tsx:46,74` (`deduplicateSebiFilings(SEBI_IPO_FILINGS)`) -> `/calendar` only. Does **not** reach `/ipo` or `/ipo/:slug`. |
| Firestore Managed IPOs | Firestore `/ipos` (`src/lib/firebase.ts`) | **UNKNOWN** (cannot read live Firestore without authenticated Owner session) | `ManagedIpoRecord`: `id`, `companyName`, `slug`, `segment`, `status`, `verificationStatus`, dates, `issueSize`, `priceBand`, `lotSize`, `sourceName`, `sourceUrl`, lifecycle/deletion fields | `AdminPage.tsx:100` calls `fetchAllManagedIpos()` (`orderBy('updatedAt', 'desc'), limit(100)`) -> `data.ipos` -> `AdminIpoManager.tsx:263` (`data.ipos.map`) | `SakarBazaarContext.tsx:305` calls `fetchPublicVerifiedIpos()` (`where('verificationStatus', '==', 'verified'), limit(60)`) -> `ipoRecords` -> `/ipo`, `/ipo/:slug`, `/calendar` (dropped on `/calendar` if `companyName` in `seenNames`). |
| SEBI Source Review Queue | Firestore `/ipoSourceReviews` + `server/ipo-sources/collector.ts` | **UNKNOWN** in live Firestore (`server` checks only SEBI Public Issues URL) | `id`, `companyName`, `targetIpoId`, `segment`, `reviewStatus`, `sourceName`, `sourceUrl`, `checkedAt`, `diffs`, `detectedSummary` | `AdminPage.tsx:101` calls `fetchIpoSourceReviews()` -> shown in `AdminIpoReviews.tsx` (Section 10); **not** shown in `AdminIpoManager.tsx` (Section 9) | Only after approval in `AdminIpoReviews.tsx` -> `resolveIpoSourceReview` writes a `verified` doc into `/ipos`. |

---

## 4. Phase 1 One-Line Evidence Answers
1. **Is the unified table present in the code?** No (`VERIFIED`) — `src/utils/ipoLifecycle.ts:340` defines `buildUnifiedIpoManagementRecords`, while `src/components/admin/AdminIpoManager.tsx:259-294` does not import it and only renders `data.ipos.map(...)` cards.
2. **Is it mounted and reachable from the sidebar section "IPO Calendar Manager"?** Only the manual form + `data.ipos` card list is mounted (`VERIFIED`) via `src/pages/AdminPage.tsx:201,339-344` (`section === 'ipo-manager'`).
3. **Does it render when `data.ipos` is empty (built-in rows still shown)?** No (`VERIFIED`) — `src/components/admin/AdminIpoManager.tsx:289-293` renders `"No custom Firestore IPO records yet..."` when `data.ipos.length === 0`.
4. **Does any query, filter, default category or permission hide rows?** No table filter exists in `AdminIpoManager.tsx` (`VERIFIED`), though `fetchAllManagedIpos()` (`src/lib/firebase.ts:1289`) uses `orderBy('updatedAt', 'desc'), limit(100)` (which excludes `/ipos` docs missing `updatedAt` and caps at 100), and built-in `1 + 7` records are never passed to `AdminIpoManager.tsx`.
5. **Is any record dropped because it lacks new schema fields (`isArchived`, `deletionStatus`, `verificationStatus`)?** In Admin, `AdminIpoManager.tsx` does not filter by `isArchived`/`deletionStatus`, and `resolveEffectiveIpoStatus()` (`src/utils/ipoLifecycle.ts:242-272`) tolerates missing `deletionStatus` (`VERIFIED`); publicly, `fetchPublicVerifiedIpos()` requires `verificationStatus == 'verified'` (`src/lib/firebase.ts:1271`), and `firestore.rules:531-533` enforces `verificationStatus == 'verified' && status in ['Upcoming', 'Open', 'Closed', 'Listed']` plus missing-or-`'none'` `deletionStatus` (without checking `isArchived`).
6. **Cause of Owner's "only a form" experience:** Workspace behind `53785de` + UI not wired (`VERIFIED`) — `AdminIpoManager.tsx` (298 lines) is the older form-only component with default `verificationStatus: 'verified'` and zero built-in/unified table rendering.

---

## 5. Files Changed
- `IPO_MANAGER_LEDGER.md` (created; Phase 1 ledger only — zero application source files modified)

---

## 6. Tests Executed
- None run in this turn yet (no app code changes made; prior baseline reported `npm test` 40/40 passing, `lint_applet` 0 errors, `compile_applet` 0 errors).

---

## 7. Unverified Items
- GitHub `zapservea-ops/SakarBazaar` `main` (`53785de`) sync/pull: **NOT VERIFIED / BLOCKED** (no `.git` directory in container; no agent access to AI Studio GitHub Sync panel).
- Live Firestore `/ipos` and `/ipoSourceReviews` contents: **NOT VERIFIED** (requires authenticated Owner session).
- Firestore rules emulator: **NOT VERIFIED** (not yet run).
