// =============================================================================
// DEVELOPER WARRANTY MODULE - TypeScript Types & Interfaces
// =============================================================================

// -----------------------------------------------------------------------------
// Database Enums & Constants
// -----------------------------------------------------------------------------

export type DeveloperWarrantyIssueStatus = 
  | 'draft'
  | 'reported'
  | 'acknowledged'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'appealed';

export type DeveloperWarrantyIssuePriority = 'low' | 'normal' | 'high' | 'urgent';
export type DeveloperWarrantyIssueSourceType = 'manual' | 'ai_protocol';
export type CommentAuthorType = 'admin' | 'developer';
export type EventActorType = 'admin' | 'developer' | 'system';

export const DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS: Record<DeveloperWarrantyIssueStatus, string> = {
  draft: 'Szkic',
  reported: 'Zgłoszone',
  acknowledged: 'Potwierdzone',
  in_progress: 'W trakcie',
  completed: 'Usunięte',
  rejected: 'Odrzucone',
  appealed: 'W odwołaniu',
};

export const DEVELOPER_WARRANTY_ISSUE_PRIORITY_LABELS: Record<DeveloperWarrantyIssuePriority, string> = {
  low: 'Niski',
  normal: 'Normalny',
  high: 'Wysoki',
  urgent: 'Pilny',
};

// -----------------------------------------------------------------------------
// Database Table Interfaces
// -----------------------------------------------------------------------------

export interface DeveloperAccess {
  id: string;
  community_id: string;
  org_id: string;
  developer_email: string;
  developer_name: string;
  
  activation_token: string;
  activation_token_expires_at: string | null;
  activated_at: string | null;
  pin_hash: string | null;
  
  access_token: string;
  
  created_at: string;
  created_by: string | null;
  deactivated_at: string | null;
  deactivated_by: string | null;
  last_login_at: string | null;
}

export interface DeveloperWarrantyIssue {
  id: string;
  community_id: string;
  org_id: string;
  location_master_id: string | null;
  
  title: string;
  description: string | null;
  category: string | null;
  location_detail: string | null;
  priority: DeveloperWarrantyIssuePriority;
  
  photos_reported: string[];
  photos_completion: string[];
  
  status: DeveloperWarrantyIssueStatus;
  reported_at: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  appealed_at: string | null;
  
  rejection_reason: string | null;
  appeal_notes: string | null;
  
  source_type: DeveloperWarrantyIssueSourceType;
  source_metadata: Record<string, unknown>;
  
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface DeveloperWarrantyIssueComment {
  id: string;
  issue_id: string;
  
  author_type: CommentAuthorType;
  author_user_id: string | null;
  author_name: string | null;
  
  comment_text: string;
  attachments: string[];
  
  created_at: string;
}

export interface DeveloperWarrantyIssueEvent {
  id: string;
  issue_id: string;
  
  event_type: string;
  old_status: DeveloperWarrantyIssueStatus | null;
  new_status: DeveloperWarrantyIssueStatus | null;
  
  actor_type: EventActorType;
  actor_user_id: string | null;
  actor_name: string | null;
  
  event_metadata: Record<string, unknown>;
  created_at: string;
}

export interface CommunityWarrantySettings {
  community_id: string;
  org_id: string;
  resident_visibility_enabled: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

// -----------------------------------------------------------------------------
// Extended Interfaces with Relations
// -----------------------------------------------------------------------------

export interface DeveloperWarrantyIssueWithComments extends DeveloperWarrantyIssue {
  comments?: DeveloperWarrantyIssueComment[];
  location?: {
    id: string;
    full_address: string;
  };
}

export interface DeveloperWarrantyIssueWithHistory extends DeveloperWarrantyIssue {
  comments?: DeveloperWarrantyIssueComment[];
  events?: DeveloperWarrantyIssueEvent[];
  location?: {
    id: string;
    full_address: string;
  };
}

// -----------------------------------------------------------------------------
// DTOs for Forms and API Calls
// -----------------------------------------------------------------------------

export interface CreateDeveloperAccessDto {
  community_id: string;
  developer_email: string;
  developer_name: string;
}

export interface ActivateDeveloperAccessDto {
  activation_token: string;
  pin: string; // 4-6 digits
}

export interface DeveloperLoginDto {
  access_token: string;
  pin: string;
}

export interface CreateWarrantyIssueDto {
  community_id: string;
  location_master_id?: string;
  title: string;
  description?: string;
  category?: string;
  location_detail?: string;
  priority?: DeveloperWarrantyIssuePriority;
  photos_reported?: string[];
}

export interface UpdateWarrantyIssueDto {
  title?: string;
  description?: string;
  category?: string;
  location_detail?: string;
  priority?: DeveloperWarrantyIssuePriority;
  photos_reported?: string[];
}

export interface UpdateWarrantyIssueStatusDto {
  new_status: DeveloperWarrantyIssueStatus;
  rejection_reason?: string; // Required when new_status = 'rejected'
  appeal_notes?: string; // Required when new_status = 'appealed'
  photos_completion?: string[]; // For 'completed' status
}

export interface AddWarrantyIssueCommentDto {
  issue_id: string;
  comment_text: string;
  attachments?: string[];
}

export interface UpdateCommunityWarrantySettingsDto {
  resident_visibility_enabled: boolean;
}

// -----------------------------------------------------------------------------
// RPC Response Types
// -----------------------------------------------------------------------------

export interface RpcResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface CreateDeveloperAccessResponse extends RpcResponse {
  access_id?: string;
  activation_token?: string;
  activation_url?: string;
  existing_email?: string;
}

export interface DeveloperActivationInfoResponse extends RpcResponse {
  developer_name?: string;
  developer_email?: string;
  community_name?: string;
  community_legal_name?: string;
}

export interface ActivateDeveloperResponse extends RpcResponse {
  message?: string;
}

export interface DeveloperLoginResponse extends RpcResponse {
  access_id?: string;
  community_id?: string;
  developer_name?: string;
  developer_email?: string;
}

export interface DeveloperPortalDataResponse extends RpcResponse {
  community?: {
    id: string;
    name: string;
    legal_name: string | null;
  };
  issues?: DeveloperWarrantyIssueWithComments[];
}

// -----------------------------------------------------------------------------
// Filter & Sort Types
// -----------------------------------------------------------------------------

export interface WarrantyIssueFilters {
  community_id?: string;
  status?: DeveloperWarrantyIssueStatus | DeveloperWarrantyIssueStatus[];
  priority?: DeveloperWarrantyIssuePriority | DeveloperWarrantyIssuePriority[];
  category?: string;
  location_master_id?: string;
  search?: string; // Search in title, description, location_detail
}

export type WarrantyIssueSortField = 
  | 'created_at'
  | 'updated_at'
  | 'reported_at'
  | 'status'
  | 'priority'
  | 'title';

export interface WarrantyIssueSortOptions {
  field: WarrantyIssueSortField;
  direction: 'asc' | 'desc';
}

// -----------------------------------------------------------------------------
// UI State Types
// -----------------------------------------------------------------------------

export interface WarrantyIssueFormState {
  mode: 'create' | 'edit' | 'view';
  issue?: DeveloperWarrantyIssue;
  isSubmitting: boolean;
  errors: Record<string, string>;
}

export interface DeveloperPortalSession {
  isAuthenticated: boolean;
  accessToken: string | null;
  communityId: string | null;
  developerName: string | null;
  developerEmail: string | null;
}

// -----------------------------------------------------------------------------
// Statistics & Dashboard Types
// -----------------------------------------------------------------------------

export interface WarrantyIssueStats {
  total: number;
  by_status: Record<DeveloperWarrantyIssueStatus, number>;
  by_priority: Record<DeveloperWarrantyIssuePriority, number>;
  avg_resolution_time_days: number | null;
  pending_count: number; // draft + reported + acknowledged + in_progress
  completed_count: number;
  rejected_count: number;
}

export interface CommunityWarrantyDashboard {
  community: {
    id: string;
    name: string;
    legal_name: string | null;
  };
  developer_access: DeveloperAccess | null;
  stats: WarrantyIssueStats;
  recent_issues: DeveloperWarrantyIssue[];
  settings: CommunityWarrantySettings | null;
}
