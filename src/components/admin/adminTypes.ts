import type {
  AdminRole,
  AuditLogRecord,
  AuthorizedEmailRecord,
  AdminUserRecord,
  IpoSourceReviewRecord,
  ManagedIpoRecord,
  PaidCampaignRecord,
  StoredArticleDoc,
  StoredMediaAssetDoc,
  StoredMediaPayloadDoc,
  SystemSettingsRecord,
} from '../../types/sakarbazaar';
import type { AdminPermissionMatrix } from '../../utils/adminPermissions';

export type AdminSectionKey =
  | 'dashboard'
  | 'news-desk'
  | 'manage-news'
  | 'media-library'
  | 'featured'
  | 'paid'
  | 'expired'
  | 'pending-deletion'
  | 'ipo-manager'
  | 'ipo-review'
  | 'audit-history'
  | 'settings';

export interface AdminNavItem {
  key: AdminSectionKey;
  label: string;
  shortLabel: string;
  badgeCount?: number;
}

export interface AdminWorkspaceData {
  articles: StoredArticleDoc[];
  media: StoredMediaAssetDoc[];
  payloadMap: Record<string, StoredMediaPayloadDoc>;
  paidCampaigns: PaidCampaignRecord[];
  ipos: ManagedIpoRecord[];
  ipoReviews: IpoSourceReviewRecord[];
  auditLogs: AuditLogRecord[];
  authorizedEmails: AuthorizedEmailRecord[];
  adminUsers: AdminUserRecord[];
  systemSettings: SystemSettingsRecord;
}

export interface AdminSectionBaseProps {
  data: AdminWorkspaceData;
  adminRole: AdminRole;
  permissions: AdminPermissionMatrix;
  userUid: string;
  userEmail: string;
  onRefresh: () => Promise<void>;
  onNavigate: (section: AdminSectionKey) => void;
  onNotify: (msg: { text: string; tone: 'ok' | 'err' }) => void;
}
