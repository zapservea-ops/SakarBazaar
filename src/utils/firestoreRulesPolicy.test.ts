import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canDeleteArticleInFirestore,
  canDeleteIpoInFirestore,
  canDeleteIpoSourceReviewInFirestore,
  canDeleteMediaInFirestore,
  canDeletePaidCampaignInFirestore,
  canGetMediaRecord,
  canGetPublicCatalog,
  canListMediaMetadata,
  canListMediaPayloads,
  canListPublicCatalog,
  canMutateOrDeleteAuditLog,
  canPublicOrUserGetArticle,
  canPublicOrUserGetIpo,
  canPublicOrUserListArticle,
  canPublicOrUserListIpo,
  canReadPaidCampaign,
  canWriteAuthorizedEmailOrSettings,
  canWritePublicLegacyOverrides,
  hasOnlyAllowedArticleKeys,
  isPolicyAuthorizedUser,
  isPolicyOwner,
  isValidFirestoreDocId,
  isValidMediaPayloadSize,
  type PolicyAuthContext,
} from './firestoreRulesPolicy.ts';

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const FUTURE = NOW + 3_600_000;
const PAST = NOW - 60_000;

const ANON: PolicyAuthContext | null = null;
const UNVERIFIED_OWNER: PolicyAuthContext = {
  uid: 'owner-unverified',
  email: 'jeetsheetalpuri@gmail.com',
  emailVerified: false,
  isBootstrappedOwner: true,
};
const RANDOM_VERIFIED_USER: PolicyAuthContext = {
  uid: 'random-user',
  email: 'reader@gmail.com',
  emailVerified: true,
};
const REVOKED_ADMIN: PolicyAuthContext = {
  uid: 'revoked-admin',
  email: 'revoked@gmail.com',
  emailVerified: true,
  isAdminPublisherDoc: true,
  allowlistActive: false,
};
const STALE_ADMIN_DOC_NO_ALLOWLIST: PolicyAuthContext = {
  uid: 'stale-admin',
  email: 'former@gmail.com',
  emailVerified: true,
  isAdminOwnerDoc: true,
  isAdminPublisherDoc: true,
  // No allowlistActive / deleted authorizedEmails doc
};
const PUBLISHER: PolicyAuthContext = {
  uid: 'pub-1',
  email: 'father@gmail.com',
  emailVerified: true,
  isAdminPublisherDoc: true,
  allowlistActive: true,
  allowlistRole: 'publisher',
};
const OWNER: PolicyAuthContext = {
  uid: 'owner-1',
  email: 'jeetsheetalpuri@gmail.com',
  emailVerified: true,
  isBootstrappedOwner: true,
  isAdminOwnerDoc: true,
};

test('Firestore Rules Policy — RBAC Dirty Dozen, privilege boundaries & removed /admins fallback', () => {
  assert.equal(isPolicyAuthorizedUser(ANON), false);
  assert.equal(isPolicyAuthorizedUser(UNVERIFIED_OWNER), false);
  assert.equal(isPolicyAuthorizedUser(RANDOM_VERIFIED_USER), false);
  assert.equal(isPolicyAuthorizedUser(REVOKED_ADMIN), false);
  assert.equal(isPolicyAuthorizedUser(STALE_ADMIN_DOC_NO_ALLOWLIST), false);
  assert.equal(isPolicyOwner(STALE_ADMIN_DOC_NO_ALLOWLIST), false);
  assert.equal(isPolicyAuthorizedUser(PUBLISHER), true);
  assert.equal(isPolicyAuthorizedUser(OWNER), true);

  assert.equal(isPolicyOwner(PUBLISHER), false);
  assert.equal(isPolicyOwner(REVOKED_ADMIN), false);
  assert.equal(isPolicyOwner(OWNER), true);

  // Only Owner can write authorizedEmails or systemSettings
  assert.equal(canWriteAuthorizedEmailOrSettings(ANON), false);
  assert.equal(canWriteAuthorizedEmailOrSettings(PUBLISHER), false);
  assert.equal(canWriteAuthorizedEmailOrSettings(STALE_ADMIN_DOC_NO_ALLOWLIST), false);
  assert.equal(canWriteAuthorizedEmailOrSettings(OWNER), true);
});

test('Firestore Rules Policy — Zero public exposure of Draft, Expired, Retained, or Pending Deletion articles (get & list)', () => {
  const activePublished = { status: 'Published', expiresAtMs: FUTURE, hasExpiresAtTimestamp: true, deletionStatus: 'none' };
  const expiredPublished = { status: 'Published', expiresAtMs: PAST, hasExpiresAtTimestamp: true, deletionStatus: 'none' };
  const pendingDeletePublished = { status: 'Published', expiresAtMs: FUTURE, hasExpiresAtTimestamp: true, deletionStatus: 'pending_approval' };
  const missingExpiryTimestamp = { status: 'Published', expiresAtMs: FUTURE, hasExpiresAtTimestamp: false, deletionStatus: 'none' };
  const draft = { status: 'Draft', expiresAtMs: null, hasExpiresAtTimestamp: false, deletionStatus: 'none' };
  const retained = { status: 'Retained', expiresAtMs: PAST, hasExpiresAtTimestamp: true, deletionStatus: 'none' };

  // Public anon & random verified reader can read ONLY active non-deleting Published articles with Timestamp
  assert.equal(canPublicOrUserGetArticle(ANON, 'art-1', activePublished, NOW), true);
  assert.equal(canPublicOrUserListArticle(ANON, activePublished, NOW), true);

  for (const blockedDoc of [expiredPublished, pendingDeletePublished, missingExpiryTimestamp, draft, retained]) {
    assert.equal(canPublicOrUserGetArticle(ANON, 'art-1', blockedDoc, NOW), false);
    assert.equal(canPublicOrUserListArticle(ANON, blockedDoc, NOW), false);
    assert.equal(canPublicOrUserGetArticle(RANDOM_VERIFIED_USER, 'art-1', blockedDoc, NOW), false);
    assert.equal(canPublicOrUserListArticle(RANDOM_VERIFIED_USER, blockedDoc, NOW), false);
    // Authorized admin CAN read them for archive / deletion / desk management
    assert.equal(canPublicOrUserGetArticle(PUBLISHER, 'art-1', blockedDoc, NOW), true);
    assert.equal(canPublicOrUserListArticle(OWNER, blockedDoc, NOW), true);
  }
});

test('Firestore Rules Policy — Media list privacy, private expiry, paidCampaign secrecy, and auditLog immutability', () => {
  // Public / random readers can NEVER list /media or /mediaPayloads or read /paidCampaigns
  assert.equal(canListMediaMetadata(ANON), false);
  assert.equal(canListMediaMetadata(RANDOM_VERIFIED_USER), false);
  assert.equal(canListMediaMetadata(PUBLISHER), true);

  assert.equal(canListMediaPayloads(ANON), false);
  assert.equal(canListMediaPayloads(OWNER), true);

  assert.equal(canReadPaidCampaign(ANON), false);
  assert.equal(canReadPaidCampaign(RANDOM_VERIFIED_USER), false);
  assert.equal(canReadPaidCampaign(PUBLISHER), true);

  // Public `get` on specific media doc works only while isPublic === true and unexpired
  assert.equal(
    canGetMediaRecord(ANON, 'med-1', { isPublic: true, expiresAtMs: FUTURE, hasExpiresAtTimestamp: true }, NOW),
    true,
  );
  assert.equal(
    canGetMediaRecord(ANON, 'med-1', { isPublic: true, expiresAtMs: PAST, hasExpiresAtTimestamp: true }, NOW),
    false,
  );
  assert.equal(
    canGetMediaRecord(ANON, 'med-1', { isPublic: false, expiresAtMs: FUTURE, hasExpiresAtTimestamp: true }, NOW),
    false,
  );

  // Audit logs are strictly append-only (update/delete forbidden for everyone)
  assert.equal(canMutateOrDeleteAuditLog(), false);
});

test('Firestore Rules Policy — Document ID validation, ghost field rejection, and media payload size caps', () => {
  assert.equal(isValidFirestoreDocId('art-2026-11-18_abc'), true);
  assert.equal(isValidFirestoreDocId('../secret/path'), false);
  assert.equal(isValidFirestoreDocId(''), false);
  assert.equal(isValidFirestoreDocId('a'.repeat(129)), false);

  assert.equal(
    hasOnlyAllowedArticleKeys({
      slug: 'rbi-policy',
      category: 'RBI',
      status: 'Published',
    }),
    true,
  );
  assert.equal(
    hasOnlyAllowedArticleKeys({
      slug: 'rbi-policy',
      ghostBackdoorField: true,
    }),
    false,
  );

  assert.equal(isValidMediaPayloadSize(120_000, 'data:image/jpeg;base64,' + 'A'.repeat(200)), true);
  assert.equal(isValidMediaPayloadSize(450_001, 'data:image/jpeg;base64,' + 'A'.repeat(200)), false);
  assert.equal(isValidMediaPayloadSize(100_000, 'data:image/jpeg;base64,' + 'A'.repeat(620_001)), false);
  assert.equal(isValidMediaPayloadSize(0, 'data:image/jpeg;base64,' + 'A'.repeat(200)), false);
});

test('Firestore Rules Policy — /publicCatalog/legacyOverrides & deletion guards (Articles, Media, IPOs, Reviews, Paid Campaigns)', () => {
  // Public anon & random readers can get legacyOverrides only (not list /publicCatalog or inspect private docs)
  assert.equal(canGetPublicCatalog(ANON, 'legacyOverrides'), true);
  assert.equal(canGetPublicCatalog(ANON, 'internalAdminState'), false);
  assert.equal(canListPublicCatalog(ANON), false);
  assert.equal(canListPublicCatalog(RANDOM_VERIFIED_USER), false);
  assert.equal(canListPublicCatalog(PUBLISHER), true);
  assert.equal(canListPublicCatalog(OWNER), true);

  const validOverridesPayload = {
    suppressedArticleIds: ['art-legacy-1'],
    suppressedSlugs: ['art-legacy-1-slug'],
    updatedByUid: 'pub-1',
    updatedAt: 'SERVER_TS',
  };

  assert.equal(canWritePublicLegacyOverrides(ANON, 'legacyOverrides', validOverridesPayload), false);
  assert.equal(canWritePublicLegacyOverrides(RANDOM_VERIFIED_USER, 'legacyOverrides', validOverridesPayload), false);
  assert.equal(canWritePublicLegacyOverrides(PUBLISHER, 'legacyOverrides', validOverridesPayload, 'pub-1'), true);
  assert.equal(
    canWritePublicLegacyOverrides(
      OWNER,
      'legacyOverrides',
      { ...validOverridesPayload, updatedByUid: 'owner-1' },
      'owner-1',
    ),
    true,
  );
  assert.equal(
    canWritePublicLegacyOverrides(
      PUBLISHER,
      'legacyOverrides',
      { ...validOverridesPayload, spoofedExtra: true },
      'pub-1',
    ),
    false,
  );
  assert.equal(canWritePublicLegacyOverrides(PUBLISHER, 'otherCatalog', validOverridesPayload, 'pub-1'), false);

  // Direct permanent article deletion MUST be blocked unless article is approved in Pending Deletion / Deletion In Progress
  const publishedArticle = { status: 'Published', deletionStatus: 'none' };
  const draftArticle = { status: 'Draft', deletionStatus: 'none' };
  const retainedArticle = { status: 'Retained', deletionStatus: 'none' };
  const expiredArticle = { status: 'Expired', deletionStatus: 'none' };
  const pendingApprovalOnly = { status: 'Pending Deletion', deletionStatus: 'pending_approval' };
  const approvedForDelete = { status: 'Pending Deletion', deletionStatus: 'approved' };
  const executingDelete = { status: 'Deletion In Progress', deletionStatus: 'in_progress' };
  const retryDelete = { status: 'Pending Deletion', deletionStatus: 'partial_failure' };

  for (const blockedState of [publishedArticle, draftArticle, retainedArticle, expiredArticle, pendingApprovalOnly]) {
    assert.equal(canDeleteArticleInFirestore(OWNER, 'art-1', blockedState), false);
    assert.equal(canDeleteArticleInFirestore(PUBLISHER, 'art-1', blockedState), false);
  }
  assert.equal(canDeleteArticleInFirestore(OWNER, 'art-1', undefined), false);

  for (const allowedState of [approvedForDelete, executingDelete, retryDelete]) {
    assert.equal(canDeleteArticleInFirestore(ANON, 'art-1', allowedState), false);
    assert.equal(canDeleteArticleInFirestore(RANDOM_VERIFIED_USER, 'art-1', allowedState), false);
    assert.equal(canDeleteArticleInFirestore(REVOKED_ADMIN, 'art-1', allowedState), false);
    assert.equal(canDeleteArticleInFirestore(STALE_ADMIN_DOC_NO_ALLOWLIST, 'art-1', allowedState), false);
    assert.equal(canDeleteArticleInFirestore(PUBLISHER, 'art-1', allowedState), true);
    assert.equal(canDeleteArticleInFirestore(OWNER, 'art-1', allowedState), true);
  }
  assert.equal(canDeleteArticleInFirestore(OWNER, '../bad', approvedForDelete), false);

  // Media deletion blocked if mediaPayload doc still exists; allowed once payload removed
  assert.equal(canDeleteMediaInFirestore(PUBLISHER, 'med-1', true), false);
  assert.equal(canDeleteMediaInFirestore(OWNER, 'med-1', true), false);
  assert.equal(canDeleteMediaInFirestore(PUBLISHER, 'med-1', false), true);
  assert.equal(canDeleteMediaInFirestore(OWNER, 'med-1', false), true);
  assert.equal(canDeleteMediaInFirestore(REVOKED_ADMIN, 'med-1', false), false);

  // IPO deletion allows BOTH Owner and Publisher for any non-public IPO (even if verificationStatus === 'verified' + archived/unpublished),
  // while blocking deletion of active public IPOs and unauthorized users.
  const publicOpenIpo = { verificationStatus: 'verified', status: 'Open', isArchived: false, deletionStatus: 'none' };
  const archivedStillVerifiedIpo = { verificationStatus: 'verified', status: 'Archived', isArchived: true, deletionStatus: 'none' };
  const unpublishedIpoDoc = { verificationStatus: 'unpublished', status: 'Unpublished', isArchived: false, deletionStatus: 'none' };
  const archivedFlaggedIpo = { verificationStatus: 'archived', status: 'Archived', isArchived: true, deletionStatus: 'none' };
  const awaitingIpoDoc = { verificationStatus: 'awaiting_verification', status: 'Awaiting Verification', isArchived: false, deletionStatus: 'none' };
  const pendingDeleteIpoDoc = { verificationStatus: 'awaiting_verification', status: 'Pending Deletion', isArchived: false, deletionStatus: 'pending_approval' };
  const approvedDeleteIpoDoc = { verificationStatus: 'awaiting_verification', status: 'Pending Deletion', isArchived: false, deletionStatus: 'approved' };

  for (const deletableIpo of [
    archivedStillVerifiedIpo,
    unpublishedIpoDoc,
    archivedFlaggedIpo,
    awaitingIpoDoc,
    pendingDeleteIpoDoc,
    approvedDeleteIpoDoc,
  ]) {
    assert.equal(canDeleteIpoInFirestore(PUBLISHER, 'ipo-1', deletableIpo), true);
    assert.equal(canDeleteIpoInFirestore(OWNER, 'ipo-1', deletableIpo), true);
    assert.equal(canDeleteIpoInFirestore(ANON, 'ipo-1', deletableIpo), false);
    assert.equal(canDeleteIpoInFirestore(RANDOM_VERIFIED_USER, 'ipo-1', deletableIpo), false);
    assert.equal(canDeleteIpoInFirestore(REVOKED_ADMIN, 'ipo-1', deletableIpo), false);
  }
  // Public IPOs MUST remain protected from direct deletion for both roles
  assert.equal(canDeleteIpoInFirestore(PUBLISHER, 'ipo-1', publicOpenIpo), false);
  assert.equal(canDeleteIpoInFirestore(OWNER, 'ipo-1', publicOpenIpo), false);

  // Security-sensitive / Owner-only delete boundaries remain strictly Owner-only
  assert.equal(canDeleteIpoSourceReviewInFirestore(PUBLISHER, 'rev-1'), false);
  assert.equal(canDeleteIpoSourceReviewInFirestore(OWNER, 'rev-1'), true);

  assert.equal(canDeletePaidCampaignInFirestore(PUBLISHER, 'camp-1', 'Cancelled'), false);
  assert.equal(canDeletePaidCampaignInFirestore(OWNER, 'camp-1', 'Active'), false);
  assert.equal(canDeletePaidCampaignInFirestore(OWNER, 'camp-1', 'Cancelled'), true);
  assert.equal(canDeletePaidCampaignInFirestore(OWNER, 'camp-1', 'Completed'), true);
});

test('Firestore Rules Policy — IPO public get & list boundaries have strict parity and fail closed for incomplete/non-public dossiers', () => {
  const publicOpenIpo = { verificationStatus: 'verified', status: 'Open', isArchived: false, deletionStatus: 'none' };
  const publicListedIpo = { verificationStatus: 'verified', status: 'Listed', isArchived: false, deletionStatus: 'none' };
  const incompleteLegacyIpo = { verificationStatus: 'verified', status: 'Listed' }; // missing required isArchived/deletionStatus -> fails closed on both get & list
  const awaitingIpo = { verificationStatus: 'awaiting_verification', status: 'Awaiting Verification', isArchived: false, deletionStatus: 'none' };
  const archivedIpo = { verificationStatus: 'archived', status: 'Archived', isArchived: true, deletionStatus: 'none' };
  const unpublishedIpo = { verificationStatus: 'unpublished', status: 'Unpublished', isArchived: false, deletionStatus: 'none' };
  const pendingDeleteIpo = { verificationStatus: 'awaiting_verification', status: 'Pending Deletion', isArchived: false, deletionStatus: 'pending_approval' };
  const inconsistentArchivedVerified = { verificationStatus: 'verified', status: 'Archived', isArchived: true, deletionStatus: 'none' };
  const inconsistentUnpublishedVerified = { verificationStatus: 'verified', status: 'Unpublished', isArchived: false, deletionStatus: 'none' };
  const inconsistentPendingDeleteVerified = { verificationStatus: 'verified', status: 'Pending Deletion', isArchived: false, deletionStatus: 'pending_approval' };
  const inconsistentDeletedVerified = { verificationStatus: 'verified', status: 'Deleted', isArchived: false, deletionStatus: 'deleted' };

  assert.equal(canPublicOrUserGetIpo(ANON, 'ipo-live-1', publicOpenIpo), true);
  assert.equal(canPublicOrUserListIpo(ANON, publicOpenIpo), true);
  assert.equal(canPublicOrUserGetIpo(ANON, 'ipo-live-2', publicListedIpo), true);
  assert.equal(canPublicOrUserListIpo(ANON, publicListedIpo), true);

  for (const hiddenIpo of [
    incompleteLegacyIpo,
    awaitingIpo,
    archivedIpo,
    unpublishedIpo,
    pendingDeleteIpo,
    inconsistentArchivedVerified,
    inconsistentUnpublishedVerified,
    inconsistentPendingDeleteVerified,
    inconsistentDeletedVerified,
  ]) {
    assert.equal(canPublicOrUserGetIpo(ANON, 'ipo-hidden-1', hiddenIpo), false);
    assert.equal(canPublicOrUserListIpo(ANON, hiddenIpo), false);
    assert.equal(canPublicOrUserGetIpo(RANDOM_VERIFIED_USER, 'ipo-hidden-1', hiddenIpo), false);
    assert.equal(canPublicOrUserListIpo(RANDOM_VERIFIED_USER, hiddenIpo), false);
    assert.equal(canPublicOrUserGetIpo(PUBLISHER, 'ipo-hidden-1', hiddenIpo), true);
    assert.equal(canPublicOrUserListIpo(OWNER, hiddenIpo), true);
  }
});



