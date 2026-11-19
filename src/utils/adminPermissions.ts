import type { AdminRole } from '../types/sakarbazaar';

export const BOOTSTRAPPED_OWNER_EMAIL = 'jeetsheetalpuri@gmail.com';

export interface AdminPermissionMatrix {
  canAccessAdmin: boolean;
  canDraftAndEditNews: boolean;
  canPublishNews: boolean;
  canExtendDuration: boolean;
  canManageMedia: boolean;
  canManageFeatured: boolean;
  canManagePaidPublications: boolean;
  canRetainOrRestoreExpired: boolean;
  canApprovePermanentDeletion: boolean;
  canExecutePermanentDeletion: boolean;
  canManageIposAndReviews: boolean;
  canExportBackup: boolean;
  canRestoreBackup: boolean;
  canManagePermissionsAndSecurity: boolean;
}

export function normalizeAdminRole(
  rawRole: string | undefined | null,
  email?: string | null,
): AdminRole {
  if (email && email.trim().toLowerCase() === BOOTSTRAPPED_OWNER_EMAIL.toLowerCase()) {
    return 'owner';
  }
  const normalized = (rawRole ?? '').trim().toLowerCase();
  if (normalized === 'owner' || normalized === 'admin') {
    return 'owner';
  }
  if (normalized === 'publisher' || normalized === 'editor') {
    return 'publisher';
  }
  return 'none';
}

export function getPermissionsForRole(role: AdminRole): AdminPermissionMatrix {
  const isOperator = role === 'owner' || role === 'publisher';
  const isOwner = role === 'owner';

  return {
    canAccessAdmin: isOperator,
    canDraftAndEditNews: isOperator,
    canPublishNews: isOperator,
    canExtendDuration: isOperator,
    canManageMedia: isOperator,
    canManageFeatured: isOperator,
    canManagePaidPublications: isOperator,
    canRetainOrRestoreExpired: isOperator,
    canApprovePermanentDeletion: isOperator,
    canExecutePermanentDeletion: isOperator,
    canManageIposAndReviews: isOperator,
    canExportBackup: isOperator,
    canRestoreBackup: isOwner,
    canManagePermissionsAndSecurity: isOwner,
  };
}

export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidOperatorEmail(email: string): boolean {
  const clean = normalizeEmailKey(email);
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(clean) && clean.length <= 200;
}
