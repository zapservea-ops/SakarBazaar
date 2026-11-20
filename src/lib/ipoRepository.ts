import type {
  AuditLogRecord,
  IpoRevisionRecord,
  IpoSourceReviewRecord,
  LegacyOverridesRecord,
  ManagedIpoRecord,
  StoredArticleDoc,
} from '../types/sakarbazaar';
import {
  applyIpoSuppressionDelta,
  buildStableIpoMigrationKey,
  calculateIpoStatusFromDates,
  classifyIpoDeletionEligibility,
  inspectIpoLinkedReferences,
  isIpoPubliclyVisible,
  isOfficialSebiUrl,
} from '../utils/ipoLifecycle';

export interface IpoStoreActor {
  uid: string;
  email: string;
}

export interface InMemoryIpoStoreState {
  ipos: Record<string, ManagedIpoRecord & { updatedAtMs?: number }>;
  reviews: Record<string, IpoSourceReviewRecord>;
  articles: Record<string, StoredArticleDoc>;
  publicCatalog: {
    legacyOverrides?: LegacyOverridesRecord;
  };
  ipoRevisions: Record<string, IpoRevisionRecord>;
  auditLogs: AuditLogRecord[];
}

export interface IpoStoreAdapter extends InMemoryIpoStoreState {
  nowMs: () => number;
  getIpo: (ipoId: string) => Promise<(ManagedIpoRecord & { updatedAtMs?: number }) | null>;
  setIpo: (ipoId: string, data: ManagedIpoRecord & { updatedAtMs?: number }) => Promise<void>;
  deleteIpo: (ipoId: string) => Promise<void>;
  getRevision: (ipoId: string) => Promise<IpoRevisionRecord | null>;
  setRevision: (ipoId: string, data: IpoRevisionRecord) => Promise<void>;
  deleteRevision: (ipoId: string) => Promise<void>;
  getLegacyOverrides: () => Promise<LegacyOverridesRecord | null>;
  setLegacyOverrides: (data: LegacyOverridesRecord) => Promise<void>;
  listArticles: () => Promise<StoredArticleDoc[]>;
  listReviews: () => Promise<IpoSourceReviewRecord[]>;
  appendAuditLog: (log: Omit<AuditLogRecord, 'id'>) => Promise<void>;
  runAtomic: <T>(fn: () => Promise<T>) => Promise<T>;
}

function extractMillis(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof val === 'object') {
    const obj = val as { toMillis?: () => number; seconds?: number };
    if (typeof obj.toMillis === 'function') {
      try {
        return obj.toMillis();
      } catch {
        return 0;
      }
    }
    if (typeof obj.seconds === 'number' && Number.isFinite(obj.seconds)) {
      return obj.seconds * 1000;
    }
  }
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function resolveIpoUpdatedAtMs(ipo: (Partial<ManagedIpoRecord> & { updatedAtMs?: number }) | null | undefined): number {
  if (!ipo) return 0;
  if (typeof ipo.updatedAtMs === 'number' && Number.isFinite(ipo.updatedAtMs)) {
    return ipo.updatedAtMs;
  }
  return extractMillis(ipo.updatedAt) || extractMillis(ipo.updatedAtIso);
}

export function createInMemoryIpoStore(
  initial?: Partial<InMemoryIpoStoreState> & { nowMs?: () => number },
): IpoStoreAdapter {
  let clockCounter = 2000;
  const store: IpoStoreAdapter = {
    ipos: { ...(initial?.ipos ?? {}) },
    reviews: { ...(initial?.reviews ?? {}) },
    articles: { ...(initial?.articles ?? {}) },
    publicCatalog: {
      ...(initial?.publicCatalog ?? {}),
    },
    ipoRevisions: { ...(initial?.ipoRevisions ?? {}) },
    auditLogs: [...(initial?.auditLogs ?? [])],
    nowMs: initial?.nowMs ?? (() => ++clockCounter),
    async getIpo(ipoId) {
      return store.ipos[ipoId] ? { ...store.ipos[ipoId] } : null;
    },
    async setIpo(ipoId, data) {
      store.ipos[ipoId] = { ...data };
    },
    async deleteIpo(ipoId) {
      delete store.ipos[ipoId];
    },
    async getRevision(ipoId) {
      return store.ipoRevisions[ipoId] ? { ...store.ipoRevisions[ipoId] } : null;
    },
    async setRevision(ipoId, data) {
      store.ipoRevisions[ipoId] = { ...data };
    },
    async deleteRevision(ipoId) {
      delete store.ipoRevisions[ipoId];
    },
    async getLegacyOverrides() {
      return store.publicCatalog.legacyOverrides
        ? { ...store.publicCatalog.legacyOverrides }
        : null;
    },
    async setLegacyOverrides(data) {
      store.publicCatalog.legacyOverrides = { ...data };
    },
    async listArticles() {
      return Object.values(store.articles);
    },
    async listReviews() {
      return Object.values(store.reviews);
    },
    async appendAuditLog(log) {
      store.auditLogs.push({
        ...log,
        id: `audit_${store.auditLogs.length + 1}`,
      });
    },
    async runAtomic<T>(fn: () => Promise<T>) {
      return fn();
    },
  };
  return store;
}

export async function saveIpoDraftRevisionTx(
  store: IpoStoreAdapter,
  actor: IpoStoreActor,
  params: {
    baseIpo: ManagedIpoRecord & { updatedAtMs?: number };
    proposedUpdates: Partial<ManagedIpoRecord>;
    baseUpdatedAtMs?: number;
    submitForReview?: boolean;
  },
): Promise<IpoRevisionRecord> {
  if (!actor.uid) {
    throw new Error('Authentication required to save IPO draft revisions.');
  }
  const ipoId = (params.baseIpo.id ?? '').trim();
  if (!ipoId) {
    throw new Error('Missing IPO identifier for draft revision.');
  }

  return store.runAtomic(async () => {
    const existingRev = await store.getRevision(ipoId);
    const now = store.nowMs();
    const baseMs =
      typeof params.baseUpdatedAtMs === 'number' && Number.isFinite(params.baseUpdatedAtMs)
        ? params.baseUpdatedAtMs
        : resolveIpoUpdatedAtMs(params.baseIpo);

    const revision: IpoRevisionRecord = {
      id: ipoId,
      ipoId,
      companyName: (params.proposedUpdates.companyName ?? params.baseIpo.companyName).trim(),
      segment: params.proposedUpdates.segment ?? params.baseIpo.segment,
      revisionStatus: params.submitForReview ? 'pending_review' : 'draft',
      baseUpdatedAtMs: baseMs,
      proposedUpdates: {
        ...params.proposedUpdates,
      },
      createdByUid: existingRev?.createdByUid ?? actor.uid,
      createdByEmail: existingRev?.createdByEmail ?? actor.email,
      updatedByUid: actor.uid,
      updatedByEmail: actor.email,
      createdAtMs: existingRev?.createdAtMs ?? now,
      updatedAtMs: now,
    };

    await store.setRevision(ipoId, revision);
    await store.appendAuditLog({
      action: 'update',
      entityType: 'ipo',
      entityId: ipoId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      previousStatus: params.baseIpo.status,
      nextStatus: revision.revisionStatus,
      summary: `Saved ${revision.revisionStatus === 'pending_review' ? 'pending review' : 'draft'} IPO revision for "${revision.companyName}" without altering live dossier.`,
      createdAtMs: now,
    });

    return revision;
  });
}

export async function rejectIpoDraftRevisionTx(
  store: IpoStoreAdapter,
  actor: IpoStoreActor,
  ipoId: string,
  reason?: string,
): Promise<IpoRevisionRecord> {
  if (!actor.uid) {
    throw new Error('Authentication required to reject IPO draft revisions.');
  }
  return store.runAtomic(async () => {
    const rev = await store.getRevision(ipoId);
    if (!rev) {
      throw new Error('Draft IPO revision not found.');
    }
    const now = store.nowMs();
    const updated: IpoRevisionRecord = {
      ...rev,
      revisionStatus: 'rejected',
      rejectionReason: reason?.trim() || 'Rejected pending official SEBI filing confirmation.',
      reviewedByUid: actor.uid,
      reviewedByEmail: actor.email,
      updatedByUid: actor.uid,
      updatedByEmail: actor.email,
      updatedAtMs: now,
    };
    await store.setRevision(ipoId, updated);
    await store.appendAuditLog({
      action: 'ipo_review_reject',
      entityType: 'ipo',
      entityId: ipoId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      previousStatus: rev.revisionStatus,
      nextStatus: 'rejected',
      summary: `Rejected draft IPO revision for "${rev.companyName}"${reason?.trim() ? `: ${reason.trim()}` : ''}. Live record preserved unchanged.`,
      createdAtMs: now,
    });
    return updated;
  });
}

export async function approveAndPublishIpoRevisionTx(
  store: IpoStoreAdapter,
  actor: IpoStoreActor,
  ipoId: string,
  todayIst?: string,
): Promise<ManagedIpoRecord> {
  if (!actor.uid) {
    throw new Error('Authentication required to approve and publish IPO revisions.');
  }

  return store.runAtomic(async () => {
    const rev = await store.getRevision(ipoId);
    if (!rev) {
      throw new Error('Draft IPO revision not found.');
    }
    if (rev.revisionStatus === 'approved') {
      throw new Error('This IPO draft revision has already been approved and published.');
    }

    const liveIpo = await store.getIpo(ipoId);
    if (!liveIpo) {
      throw new Error('Live IPO dossier not found. Create or initialize the record before merging a revision.');
    }

    const liveUpdatedAtMs = resolveIpoUpdatedAtMs(liveIpo);
    if (rev.baseUpdatedAtMs !== liveUpdatedAtMs) {
      throw new Error(
        'This live IPO was updated by another change after this draft revision was created. Refresh Data and re-check the draft before publishing.',
      );
    }

    const merged: ManagedIpoRecord & { updatedAtMs?: number } = {
      ...liveIpo,
      ...rev.proposedUpdates,
      id: liveIpo.id,
      migrationKey:
        rev.proposedUpdates.migrationKey ||
        liveIpo.migrationKey ||
        buildStableIpoMigrationKey({
          id: liveIpo.id,
          companyName: rev.proposedUpdates.companyName ?? liveIpo.companyName,
          segment: rev.proposedUpdates.segment ?? liveIpo.segment,
          filingDate: rev.proposedUpdates.filingDate ?? liveIpo.filingDate,
          openingDate: rev.proposedUpdates.openingDate ?? liveIpo.openingDate,
          listingDate: rev.proposedUpdates.listingDate ?? liveIpo.listingDate,
          offerType: rev.proposedUpdates.offerType ?? liveIpo.offerType,
          sourceUrl: rev.proposedUpdates.sourceUrl ?? liveIpo.sourceUrl,
          officialDocuments: rev.proposedUpdates.officialDocuments ?? liveIpo.officialDocuments,
        }),
    };

    const hasOfficialUrl =
      isOfficialSebiUrl(merged.sourceUrl) ||
      (merged.officialDocuments ?? []).some((u) => isOfficialSebiUrl(u)) ||
      Boolean(liveIpo.lastVerifiedAt);

    if (merged.verificationStatus === 'verified' && !hasOfficialUrl) {
      throw new Error(
        'Publishing a verified IPO revision requires an official sebi.gov.in document URL or prior official verification timestamp.',
      );
    }

    const nextStatus = calculateIpoStatusFromDates({
      openingDate: merged.openingDate,
      closingDate: merged.closingDate,
      listingDate: merged.listingDate,
      verificationStatus: merged.verificationStatus,
      currentStatus: merged.status,
      isArchived: merged.isArchived,
      deletionStatus: merged.deletionStatus ?? 'none',
      todayIst,
    });

    const now = store.nowMs();
    const updatedLive: ManagedIpoRecord & { updatedAtMs?: number } = {
      ...merged,
      status: nextStatus,
      isArchived: merged.isArchived ?? nextStatus === 'Archived',
      deletionStatus: merged.deletionStatus ?? 'none',
      updatedByUid: actor.uid,
      updatedAtMs: now,
      updatedAtIso: new Date(now).toISOString(),
    };

    await store.setIpo(ipoId, updatedLive);
    await store.setRevision(ipoId, {
      ...rev,
      revisionStatus: 'approved',
      reviewedByUid: actor.uid,
      reviewedByEmail: actor.email,
      updatedByUid: actor.uid,
      updatedByEmail: actor.email,
      updatedAtMs: now,
    });

    if (isIpoPubliclyVisible(updatedLive)) {
      const currentOverrides = await store.getLegacyOverrides();
      const nextOverrides = applyIpoSuppressionDelta(
        currentOverrides,
        {
          id: updatedLive.id,
          slug: updatedLive.slug,
          migrationKey: updatedLive.migrationKey,
        },
        'unsuppress',
        actor.uid,
      );
      await store.setLegacyOverrides(nextOverrides);
    }

    await store.appendAuditLog({
      action: 'ipo_review_approve',
      entityType: 'ipo',
      entityId: ipoId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      previousStatus: liveIpo.status,
      nextStatus: updatedLive.status,
      summary: `Approved and published draft IPO revision for "${updatedLive.companyName}".`,
      createdAtMs: now,
    });

    return updatedLive;
  });
}

export async function requestIpoDeletionTx(
  store: IpoStoreAdapter,
  actor: IpoStoreActor,
  ipoId: string,
  reason?: string,
): Promise<ManagedIpoRecord> {
  if (!actor.uid) {
    throw new Error('Authentication required to request IPO deletion.');
  }

  return store.runAtomic(async () => {
    const existing = await store.getIpo(ipoId);
    if (!existing) {
      throw new Error('IPO dossier not found.');
    }
    if (existing.status === 'Deleted' || existing.deletionStatus === 'deleted') {
      throw new Error('IPO record is already deleted.');
    }
    if (isIpoPubliclyVisible(existing)) {
      throw new Error(
        'Public live IPO cannot move directly to Pending Deletion. Archive or Unpublish it first.',
      );
    }
    if (existing.status === 'Pending Deletion') {
      return existing;
    }

    const now = store.nowMs();
    const updated: ManagedIpoRecord & { updatedAtMs?: number } = {
      ...existing,
      previousStatusBeforeDeletion: existing.status,
      status: 'Pending Deletion',
      deletionStatus: 'pending_approval',
      deletionError: '',
      updatedByUid: actor.uid,
      updatedAtMs: now,
      updatedAtIso: new Date(now).toISOString(),
    };

    await store.setIpo(ipoId, updated);

    const overrides = await store.getLegacyOverrides();
    await store.setLegacyOverrides(
      applyIpoSuppressionDelta(
        overrides,
        { id: updated.id, slug: updated.slug, migrationKey: updated.migrationKey },
        'suppress',
        actor.uid,
      ),
    );

    await store.appendAuditLog({
      action: 'request_delete',
      entityType: 'ipo',
      entityId: ipoId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      previousStatus: existing.status,
      nextStatus: 'Pending Deletion',
      summary: `Moved IPO "${existing.companyName}" to Pending Deletion (Step 1 of 2)${reason?.trim() ? `: ${reason.trim()}` : ''}.`,
      createdAtMs: now,
    });

    return updated;
  });
}

export async function approveIpoDeletionTx(
  store: IpoStoreAdapter,
  actor: IpoStoreActor,
  ipoId: string,
  reason?: string,
): Promise<ManagedIpoRecord> {
  if (!actor.uid) {
    throw new Error('Authentication required to approve IPO deletion.');
  }

  return store.runAtomic(async () => {
    const existing = await store.getIpo(ipoId);
    if (!existing) {
      throw new Error('IPO dossier not found.');
    }
    if (existing.status !== 'Pending Deletion' || existing.deletionStatus !== 'pending_approval') {
      throw new Error(
        `IPO "${existing.companyName}" is not awaiting deletion approval (current status: ${existing.status}, deletionStatus: ${existing.deletionStatus ?? 'none'}).`,
      );
    }

    const now = store.nowMs();
    const updated: ManagedIpoRecord & { updatedAtMs?: number } = {
      ...existing,
      status: 'Pending Deletion',
      deletionStatus: 'approved',
      deletionApprovedByUid: actor.uid,
      deletionApprovedByEmail: actor.email,
      deletionApprovedAtMs: now,
      deletionError: '',
      updatedByUid: actor.uid,
      updatedAtMs: now,
      updatedAtIso: new Date(now).toISOString(),
    };

    await store.setIpo(ipoId, updated);
    await store.appendAuditLog({
      action: 'approve_delete',
      entityType: 'ipo',
      entityId: ipoId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      previousStatus: 'pending_approval',
      nextStatus: 'approved',
      summary: `Approved permanent deletion for IPO "${existing.companyName}"${reason?.trim() ? `: ${reason.trim()}` : ''}.`,
      createdAtMs: now,
    });

    return updated;
  });
}

export async function cancelIpoDeletionTx(
  store: IpoStoreAdapter,
  actor: IpoStoreActor,
  ipoId: string,
  reason?: string,
): Promise<ManagedIpoRecord> {
  if (!actor.uid) {
    throw new Error('Authentication required to cancel IPO deletion.');
  }

  return store.runAtomic(async () => {
    const existing = await store.getIpo(ipoId);
    if (!existing) {
      throw new Error('IPO dossier not found.');
    }
    if (existing.status === 'Deletion In Progress' || existing.deletionStatus === 'in_progress') {
      throw new Error('Cannot cancel deletion while permanent deletion execution is in progress.');
    }
    if (existing.status === 'Deleted' || existing.deletionStatus === 'deleted') {
      throw new Error('IPO has already been permanently deleted.');
    }

    const fallbackStatus: ManagedIpoRecord['status'] =
      existing.previousStatusBeforeDeletion &&
      existing.previousStatusBeforeDeletion !== 'Pending Deletion' &&
      existing.previousStatusBeforeDeletion !== 'Deletion In Progress' &&
      existing.previousStatusBeforeDeletion !== 'Deleted'
        ? existing.previousStatusBeforeDeletion
        : existing.isArchived
          ? 'Archived'
          : 'Awaiting Verification';

    const safeRestoredStatus: ManagedIpoRecord['status'] =
      fallbackStatus === 'Upcoming' ||
      fallbackStatus === 'Open' ||
      fallbackStatus === 'Closed' ||
      fallbackStatus === 'Listed'
        ? 'Archived'
        : fallbackStatus;

    const now = store.nowMs();
    const updated: ManagedIpoRecord & { updatedAtMs?: number } = {
      ...existing,
      status: safeRestoredStatus,
      isArchived: safeRestoredStatus === 'Archived' ? true : existing.isArchived ?? false,
      deletionStatus: 'none',
      deletionApprovedByUid: '',
      deletionApprovedByEmail: '',
      deletionApprovedAtMs: null,
      deletionError: '',
      updatedByUid: actor.uid,
      updatedAtMs: now,
      updatedAtIso: new Date(now).toISOString(),
    };

    await store.setIpo(ipoId, updated);
    await store.appendAuditLog({
      action: 'cancel_delete',
      entityType: 'ipo',
      entityId: ipoId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      previousStatus: existing.status,
      nextStatus: updated.status,
      summary: `Cancelled deletion request for IPO "${existing.companyName}" (restored to ${updated.status})${reason?.trim() ? `: ${reason.trim()}` : ''}.`,
      createdAtMs: now,
    });

    return updated;
  });
}

export async function executeIpoPermanentDeletionTx(
  store: IpoStoreAdapter,
  actor: IpoStoreActor,
  ipoId: string,
  reason?: string,
): Promise<{
  deletedId: string;
  suppressedKeys: string[];
  linkedSummary: string;
}> {
  if (!actor.uid) {
    throw new Error('Authentication required to execute permanent IPO deletion.');
  }

  const existing = await store.getIpo(ipoId);
  if (!existing) {
    throw new Error('IPO dossier not found or already permanently deleted.');
  }

  const eligibility = classifyIpoDeletionEligibility(existing);
  if (!eligibility.canDeletePermanently) {
    throw new Error(eligibility.reason);
  }

  const [articles, reviews] = await Promise.all([store.listArticles(), store.listReviews()]);
  const refs = inspectIpoLinkedReferences({ ipo: existing, articles, reviews });
  if (refs.hasBlockingPendingReviews) {
    throw new Error(
      `Cannot permanently delete "${existing.companyName}" while ${refs.pendingReviewIds.length} active SEBI review(s) remain "Needs Review". Resolve those reviews in Section 10 first.`,
    );
  }

  const now = store.nowMs();
  const migKey =
    existing.migrationKey ||
    buildStableIpoMigrationKey({
      id: existing.id,
      companyName: existing.companyName,
      segment: existing.segment,
      filingDate: existing.filingDate,
      openingDate: existing.openingDate,
      listingDate: existing.listingDate,
      offerType: existing.offerType,
      sourceUrl: existing.sourceUrl,
      officialDocuments: existing.officialDocuments,
    });

  // Step 1: Mark Deletion In Progress first for crash/partial-failure visibility
  await store.setIpo(ipoId, {
    ...existing,
    status: 'Deletion In Progress',
    deletionStatus: 'in_progress',
    deletionAttempts: (existing.deletionAttempts ?? 0) + 1,
    deletionError: '',
    updatedByUid: actor.uid,
    updatedAtMs: now,
    updatedAtIso: new Date(now).toISOString(),
  });

  try {
    return await store.runAtomic(async () => {
      const currentOverrides = await store.getLegacyOverrides();
      const nextOverrides = applyIpoSuppressionDelta(
        currentOverrides,
        { id: existing.id, slug: existing.slug, migrationKey: migKey },
        'suppress',
        actor.uid,
      );
      await store.setLegacyOverrides(nextOverrides);
      await store.deleteRevision(ipoId);
      await store.deleteIpo(ipoId);

      await store.appendAuditLog({
        action: 'complete_delete',
        entityType: 'ipo',
        entityId: existing.id,
        actorUid: actor.uid,
        actorEmail: actor.email,
        previousStatus: existing.previousStatusBeforeDeletion || existing.status,
        nextStatus: 'Deleted',
        summary: `Permanently deleted IPO "${existing.companyName}" (${existing.segment}). ${refs.summary}${reason?.trim() ? ` Note: ${reason.trim()}` : ''}`,
        createdAtMs: now,
      });

      return {
        deletedId: existing.id,
        suppressedKeys: nextOverrides.suppressedIpoIds ?? [],
        linkedSummary: refs.summary,
      };
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Partial permanent deletion failure';
    const current = await store.getIpo(ipoId);
    if (current) {
      await store
        .setIpo(ipoId, {
          ...current,
          status: 'Pending Deletion',
          deletionStatus: 'partial_failure',
          deletionError: errMsg,
          updatedByUid: actor.uid,
          updatedAtMs: store.nowMs(),
        })
        .catch(() => {});
    }
    await store
      .appendAuditLog({
        action: 'partial_delete_failure',
        entityType: 'ipo',
        entityId: ipoId,
        actorUid: actor.uid,
        actorEmail: actor.email,
        previousStatus: 'Deletion In Progress',
        nextStatus: 'partial_failure',
        summary: `Partial failure while deleting IPO "${existing.companyName}": ${errMsg}`,
        createdAtMs: store.nowMs(),
      })
      .catch(() => {});
    throw err;
  }
}

export async function updateIpoLifecycleWithSuppressionTx(
  store: IpoStoreAdapter,
  actor: IpoStoreActor,
  params: {
    targetIpo: ManagedIpoRecord & { updatedAtMs?: number };
    action: 'submit_review' | 'verify' | 'reject' | 'return_review' | 'unpublish' | 'archive' | 'restore';
    reason?: string;
    todayIst?: string;
  },
): Promise<ManagedIpoRecord> {
  if (!actor.uid) {
    throw new Error('Authentication required to update IPO lifecycle status.');
  }
  const { targetIpo, action, reason, todayIst } = params;

  return store.runAtomic(async () => {
    const existing = await store.getIpo(targetIpo.id);
    const base: ManagedIpoRecord & { updatedAtMs?: number } = existing ?? {
      ...targetIpo,
      deletionStatus: targetIpo.deletionStatus ?? 'none',
      isArchived: Boolean(targetIpo.isArchived),
    };

    const next: ManagedIpoRecord & { updatedAtMs?: number } = { ...base };
    let auditAction = 'update';

    if (action === 'submit_review' || action === 'return_review') {
      next.verificationStatus = 'awaiting_verification';
      next.isArchived = false;
      next.deletionStatus = 'none';
      next.status = 'Awaiting Verification';
      auditAction = 'mark_awaiting_verification';
    } else if (action === 'verify' || action === 'restore') {
      const hasSebiDoc =
        isOfficialSebiUrl(next.sourceUrl) ||
        (next.officialDocuments ?? []).some((u) => isOfficialSebiUrl(u)) ||
        Boolean(next.lastVerifiedAt);
      if (action === 'verify' && !hasSebiDoc) {
        throw new Error(
          'Verifying an IPO to public visibility requires an official sebi.gov.in document URL.',
        );
      }
      if (action === 'verify' || next.previousVerificationStatus === 'verified' || hasSebiDoc) {
        next.verificationStatus = 'verified';
        next.lastVerifiedAt = next.lastVerifiedAt ?? new Date(store.nowMs()).toISOString();
      } else {
        next.verificationStatus = 'awaiting_verification';
      }
      next.isArchived = false;
      next.deletionStatus = 'none';
      next.needsReview = false;
      next.status = calculateIpoStatusFromDates({
        openingDate: next.openingDate,
        closingDate: next.closingDate,
        listingDate: next.listingDate,
        verificationStatus: next.verificationStatus,
        currentStatus: next.verificationStatus === 'verified' ? 'Upcoming' : 'Awaiting Verification',
        isArchived: false,
        deletionStatus: 'none',
        todayIst,
      });
      auditAction = action === 'verify' ? 'verify' : 'publish';
    } else if (action === 'reject') {
      next.previousVerificationStatus =
        base.verificationStatus === 'verified' ? 'verified' : 'awaiting_verification';
      next.verificationStatus = 'rejected';
      next.isArchived = false;
      next.deletionStatus = 'none';
      next.status = 'Rejected';
      next.rejectionReason = reason?.trim() || 'Rejected pending official source review.';
      auditAction = 'ipo_review_reject';
    } else if (action === 'unpublish') {
      next.previousVerificationStatus =
        base.verificationStatus === 'verified' ? 'verified' : 'awaiting_verification';
      next.verificationStatus = 'unpublished';
      next.isArchived = false;
      next.deletionStatus = 'none';
      next.status = 'Unpublished';
      auditAction = 'update';
    } else if (action === 'archive') {
      next.previousVerificationStatus =
        base.verificationStatus === 'verified' ? 'verified' : 'awaiting_verification';
      next.verificationStatus = 'archived';
      next.isArchived = true;
      next.deletionStatus = 'none';
      next.status = 'Archived';
      auditAction = 'archive';
    }

    const now = store.nowMs();
    next.updatedByUid = actor.uid;
    next.updatedAtMs = now;
    next.updatedAtIso = new Date(now).toISOString();
    next.migrationKey =
      next.migrationKey ||
      buildStableIpoMigrationKey({
        id: next.id,
        companyName: next.companyName,
        segment: next.segment,
        filingDate: next.filingDate,
        openingDate: next.openingDate,
        listingDate: next.listingDate,
        offerType: next.offerType,
        sourceUrl: next.sourceUrl,
        officialDocuments: next.officialDocuments,
      });

    await store.setIpo(next.id, next);

    const isPublicNow = isIpoPubliclyVisible(next);
    const currentOverrides = await store.getLegacyOverrides();
    await store.setLegacyOverrides(
      applyIpoSuppressionDelta(
        currentOverrides,
        { id: next.id, slug: next.slug, migrationKey: next.migrationKey },
        isPublicNow ? 'unsuppress' : 'suppress',
        actor.uid,
      ),
    );

    await store.appendAuditLog({
      action: auditAction,
      entityType: 'ipo',
      entityId: next.id,
      actorUid: actor.uid,
      actorEmail: actor.email,
      previousStatus: base.status,
      nextStatus: next.status,
      summary: `${action} IPO "${next.companyName}" (${next.segment})${reason?.trim() ? `: ${reason.trim()}` : ''}`,
      createdAtMs: now,
    });

    return next;
  });
}
