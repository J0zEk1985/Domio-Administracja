# Schemat Bazy Danych: Moduł Usterek Deweloperskich

## Przegląd
Moduł zarządza usterkam parts of buildings covered by developer warranty at the Community level (not individual building).

## Tabele

### 1. `developer_accesses`
Przechowuje dane dostępowe Deweloperów do Portalu dla danej Wspólnoty.

```sql
CREATE TABLE public.developer_accesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  developer_email text NOT NULL,
  developer_name text NOT NULL,
  
  -- Activation & Access
  activation_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  activation_token_expires_at timestamptz,
  activated_at timestamptz,
  pin_hash text, -- bcrypt hash of 4-6 digit PIN set by developer
  
  -- Access token for portal (stable link)
  access_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deactivated_at timestamptz,
  deactivated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_login_at timestamptz,
  
  CONSTRAINT developer_accesses_community_uidx UNIQUE (community_id),
  CONSTRAINT developer_accesses_email_fmt CHECK (developer_email ~ '^[^@]+@[^@]+\.[^@]+$'),
  CONSTRAINT developer_accesses_pin_hash_when_activated CHECK (
    activated_at IS NULL OR pin_hash IS NOT NULL
  )
);

CREATE INDEX idx_developer_accesses_org ON public.developer_accesses(org_id);
CREATE INDEX idx_developer_accesses_community ON public.developer_accesses(community_id);
CREATE INDEX idx_developer_accesses_activation_token ON public.developer_accesses(activation_token) 
  WHERE activation_token_expires_at IS NULL OR activation_token_expires_at > now();

COMMENT ON TABLE public.developer_accesses IS 
  'Developer portal access credentials per Community. Developer sets their own PIN after email activation.';
```

### 2. `developer_warranty_issues`
Główna tabela usterek deweloperskich.

```sql
CREATE TYPE developer_warranty_issue_status AS ENUM (
  'draft',        -- Draft created by AI or Admin (not yet published)
  'reported',     -- Published by Admin, visible to Developer
  'acknowledged', -- Developer acknowledged receipt
  'in_progress',  -- Developer is working on it
  'completed',    -- Developer marked as fixed
  'rejected',     -- Developer rejected the defect
  'appealed'      -- Admin appealed after rejection
);

CREATE TABLE public.developer_warranty_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_master_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  
  -- Issue Details
  title text NOT NULL,
  description text,
  category text, -- e.g., 'Hydraulika', 'Elektryka', 'Stolarka', etc.
  location_detail text, -- e.g., 'Klatka A, parter', 'Parking podziemny -1'
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Photos
  photos_reported text[] DEFAULT '{}', -- URLs to photos from initial report
  photos_completion text[] DEFAULT '{}', -- URLs to photos after completion by developer
  
  -- Status & Dates
  status developer_warranty_issue_status NOT NULL DEFAULT 'draft',
  reported_at timestamptz, -- When Admin published (draft -> reported)
  acknowledged_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  appealed_at timestamptz,
  
  -- Rejection & Appeal
  rejection_reason text,
  appeal_notes text,
  
  -- Source tracking (future-proofing for AI)
  source_type text DEFAULT 'manual' CHECK (source_type IN ('manual', 'ai_protocol')),
  source_metadata jsonb DEFAULT '{}',
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  CONSTRAINT warranty_issue_reported_at_when_published CHECK (
    status = 'draft' OR reported_at IS NOT NULL
  ),
  CONSTRAINT warranty_issue_rejection_reason_when_rejected CHECK (
    status != 'rejected' OR rejection_reason IS NOT NULL
  )
);

CREATE INDEX idx_warranty_issues_community ON public.developer_warranty_issues(community_id);
CREATE INDEX idx_warranty_issues_org ON public.developer_warranty_issues(org_id);
CREATE INDEX idx_warranty_issues_status ON public.developer_warranty_issues(status);
CREATE INDEX idx_warranty_issues_created ON public.developer_warranty_issues(created_at DESC);
CREATE INDEX idx_warranty_issues_location_master ON public.developer_warranty_issues(location_master_id) 
  WHERE location_master_id IS NOT NULL;

COMMENT ON TABLE public.developer_warranty_issues IS 
  'Developer warranty defects reported by Property Admin to Developer, tracked through resolution or appeal.';
```

### 3. `developer_warranty_issue_comments`
Komentarze do usterek (Admin ↔ Developer communication).

```sql
CREATE TABLE public.developer_warranty_issue_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.developer_warranty_issues(id) ON DELETE CASCADE,
  
  -- Author
  author_type text NOT NULL CHECK (author_type IN ('admin', 'developer')),
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- For admin
  author_name text, -- Display name
  
  -- Content
  comment_text text NOT NULL,
  attachments text[] DEFAULT '{}', -- URLs to attachments
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT warranty_comment_author_user_when_admin CHECK (
    author_type != 'admin' OR author_user_id IS NOT NULL
  )
);

CREATE INDEX idx_warranty_comments_issue ON public.developer_warranty_issue_comments(issue_id, created_at);

COMMENT ON TABLE public.developer_warranty_issue_comments IS 
  'Communication thread between Admin and Developer on warranty defects.';
```

### 4. `developer_warranty_issue_events`
Log zdarzeń (audit trail) dla każdej usterki.

```sql
CREATE TABLE public.developer_warranty_issue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.developer_warranty_issues(id) ON DELETE CASCADE,
  
  -- Event
  event_type text NOT NULL, -- e.g., 'created', 'published', 'status_changed', 'commented', 'photos_added'
  old_status developer_warranty_issue_status,
  new_status developer_warranty_issue_status,
  
  -- Actor
  actor_type text NOT NULL CHECK (actor_type IN ('admin', 'developer', 'system')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  
  -- Details
  event_metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_warranty_events_issue ON public.developer_warranty_issue_events(issue_id, created_at DESC);
CREATE INDEX idx_warranty_events_created ON public.developer_warranty_issue_events(created_at DESC);

COMMENT ON TABLE public.developer_warranty_issue_events IS 
  'Audit trail for all warranty issue lifecycle events.';
```

### 5. `community_warranty_settings`
Ustawienia widoczności usterek dla mieszkańców na poziomie Wspólnoty.

```sql
CREATE TABLE public.community_warranty_settings (
  community_id uuid PRIMARY KEY REFERENCES public.communities(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Visibility for residents in Home app
  resident_visibility_enabled boolean NOT NULL DEFAULT false,
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_community_warranty_settings_org ON public.community_warranty_settings(org_id);

COMMENT ON TABLE public.community_warranty_settings IS 
  'Per-community settings for developer warranty module, including resident visibility toggle.';
```

## Interfejsy TypeScript

### Types for Database Tables

```typescript
// types/developer-warranty.ts

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

// DTOs for forms and API calls

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

export interface UpdateWarrantyIssueStatusDto {
  issue_id: string;
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
```

## Relacje i Założenia Architektoniczne

1. **Jeden Deweloper per Wspólnota**: `developer_accesses.community_id` jest UNIQUE
2. **Poziom Wspólnoty, nie Budynku**: `developer_warranty_issues.community_id` (nie pojedyncze location)
3. **Bezpieczny PIN**: PIN nie jest widoczny dla admina (tylko bcrypt hash)
4. **Future-proof dla AI**: `source_type` i `source_metadata` pozwalają na przyszłą integrację AI do parsowania protokołów
5. **Widoczność dla Mieszkańców**: Kontrolowana przez `community_warranty_settings.resident_visibility_enabled`

## Migracja SQL

Pełna migracja zostanie utworzona jako:
`supabase/migrations/YYYYMMDDHHMMSS_developer_warranty_module.sql`

Po akceptacji schematu przejdę do WARSTWY 2 (RLS & Security).
