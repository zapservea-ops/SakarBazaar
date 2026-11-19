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

export type AdminRefreshScope = 'all' | 'non_realtime' | 'media' | 'paid' | 'settings' | 'none';

export interface AdminRefreshOptions {
  manual?: boolean;
  scope?: AdminRefreshScope;
}

export interface AdminSectionBaseProps {
  data: AdminWorkspaceData;
  adminRole: AdminRole;
  permissions: AdminPermissionMatrix;
  userUid: string;
  userEmail: string;
  onRefresh: (opts?: AdminRefreshOptions) => Promise<void>;
  onNavigate: (section: AdminSectionKey) => void;
  onNotify: (msg: { text: string; tone: 'ok' | 'err' }) => void;
}
