import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canGetMediaRecord,
  canListMediaMetadata,
  canListMediaPayloads,
  canMutateOrDeleteAuditLog,
  canPublicOrUserGetArticle,
  canPublicOrUserListArticle,
  canReadPaidCampaign,
  canWriteAuthorizedEmailOrSettings,
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

test('Firestore Rules Policy — RBAC Dirty Dozen & privilege boundaries', () => {
  assert.equal(isPolicyAuthorizedUser(ANON), false);
  assert.equal(isPolicyAuthorizedUser(UNVERIFIED_OWNER), false);
  assert.equal(isPolicyAuthorizedUser(RANDOM_VERIFIED_USER), false);
  assert.equal(isPolicyAuthorizedUser(REVOKED_ADMIN), false);
  assert.equal(isPolicyAuthorizedUser(PUBLISHER), true);
  assert.equal(isPolicyAuthorizedUser(OWNER), true);

  assert.equal(isPolicyOwner(PUBLISHER), false);
  assert.equal(isPolicyOwner(REVOKED_ADMIN), false);
  assert.equal(isPolicyOwner(OWNER), true);

  // Only Owner can write authorizedEmails or systemSettings
  assert.equal(canWriteAuthorizedEmailOrSettings(ANON), false);
  assert.equal(canWriteAuthorizedEmailOrSettings(PUBLISHER), false);
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
