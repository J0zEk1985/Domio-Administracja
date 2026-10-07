/**
 * React Query hooks for Developer Warranty Module
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  DeveloperAccess,
  DeveloperWarrantyIssue,
  DeveloperWarrantyIssueComment,
  DeveloperWarrantyIssueEvent,
  DeveloperWarrantyIssueWithComments,
  CommunityWarrantySettings,
  CreateDeveloperAccessDto,
  CreateWarrantyIssueDto,
  UpdateWarrantyIssueDto,
  UpdateWarrantyIssueStatusDto,
  AddWarrantyIssueCommentDto,
  UpdateCommunityWarrantySettingsDto,
  CreateDeveloperAccessResponse,
  DeleteDeveloperAccessResponse,
  WarrantyIssueFilters,
} from "@/types/developer-warranty";

// =============================================================================
// QUERY KEYS
// =============================================================================

export const developerWarrantyKeys = {
  all: ["developer-warranty"] as const,
  accesses: () => [...developerWarrantyKeys.all, "accesses"] as const,
  access: (communityId: string) => [...developerWarrantyKeys.accesses(), communityId] as const,
  issues: () => [...developerWarrantyKeys.all, "issues"] as const,
  issuesList: (filters?: WarrantyIssueFilters) => [...developerWarrantyKeys.issues(), filters] as const,
  issue: (id: string) => [...developerWarrantyKeys.issues(), id] as const,
  issueComments: (issueId: string) => [...developerWarrantyKeys.all, "comments", issueId] as const,
  issueEvents: (issueId: string) => [...developerWarrantyKeys.all, "events", issueId] as const,
  settings: (communityId: string) => [...developerWarrantyKeys.all, "settings", communityId] as const,
};

// =============================================================================
// DEVELOPER ACCESS HOOKS
// =============================================================================

/**
 * Get developer access for a community
 */
export function useDeveloperAccess(communityId: string | undefined) {
  return useQuery({
    queryKey: developerWarrantyKeys.access(communityId!),
    queryFn: async () => {
      if (!communityId) return null;
      
      const { data, error } = await supabase
        .from("developer_accesses")
        .select("*")
        .eq("community_id", communityId)
        .maybeSingle();
      
      if (error) throw error;
      return data as DeveloperAccess | null;
    },
    enabled: !!communityId,
  });
}

/**
 * Create developer access and send invitation email
 */
export function useCreateDeveloperAccess() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (dto: CreateDeveloperAccessDto) => {
      const { data, error } = await supabase.rpc("create_developer_access_and_send_invite", {
        p_community_id: dto.community_id,
        p_developer_email: dto.developer_email,
        p_developer_name: dto.developer_name,
      });
      
      if (error) throw error;
      
      const response = data as CreateDeveloperAccessResponse;
      if (!response.ok) {
        throw new Error(response.error || "Failed to create developer access");
      }
      
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.access(variables.community_id),
      });
    },
  });
}

/**
 * Deactivate developer access
 */
export function useDeactivateDeveloperAccess() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ accessId, communityId }: { accessId: string; communityId: string }) => {
      const { error } = await supabase
        .from("developer_accesses")
        .update({
          deactivated_at: new Date().toISOString(),
        })
        .eq("id", accessId);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.access(variables.communityId),
      });
    },
  });
}

/**
 * Restore a deactivated developer. PIN and portal link stay unchanged.
 * Warranty issues are not modified.
 */
export function useRestoreDeveloperAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accessId, communityId }: { accessId: string; communityId: string }) => {
      const { error } = await supabase
        .from("developer_accesses")
        .update({
          deactivated_at: null,
          deactivated_by: null,
        })
        .eq("id", accessId);

      if (error) throw error;
      return { communityId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.access(variables.communityId),
      });
    },
  });
}

/**
 * Permanently remove developer portal access.
 * The RPC deletes only developer_accesses and leaves warranty issues in place.
 */
export function useDeleteDeveloperAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accessId, communityId }: { accessId: string; communityId: string }) => {
      const { data, error } = await supabase.rpc("delete_developer_access", {
        p_access_id: accessId,
      });

      if (error) throw error;

      const response = data as DeleteDeveloperAccessResponse;
      if (!response?.ok) {
        throw new Error(response?.error || "Failed to delete developer access");
      }

      return {
        communityId,
        preservedIssueCount: response.preserved_issue_count ?? 0,
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.access(variables.communityId),
      });
    },
  });
}

// =============================================================================
// WARRANTY ISSUES HOOKS
// =============================================================================

/**
 * Get all warranty issues with optional filters
 */
export function useWarrantyIssues(filters?: WarrantyIssueFilters) {
  return useQuery({
    queryKey: developerWarrantyKeys.issuesList(filters),
    queryFn: async () => {
      let query = supabase
        .from("developer_warranty_issues")
        .select(`
          *,
          location:locations(id, full_address)
        `)
        .order("created_at", { ascending: false });
      
      // Apply filters
      if (filters?.community_id) {
        query = query.eq("community_id", filters.community_id);
      }
      
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in("status", filters.status);
        } else {
          query = query.eq("status", filters.status);
        }
      }
      
      if (filters?.priority) {
        if (Array.isArray(filters.priority)) {
          query = query.in("priority", filters.priority);
        } else {
          query = query.eq("priority", filters.priority);
        }
      }
      
      if (filters?.category) {
        query = query.eq("category", filters.category);
      }
      
      if (filters?.location_master_id) {
        query = query.eq("location_master_id", filters.location_master_id);
      }
      
      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,location_detail.ilike.%${filters.search}%`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as DeveloperWarrantyIssue[];
    },
  });
}

/**
 * Get single warranty issue with comments
 */
export function useWarrantyIssue(issueId: string | undefined) {
  return useQuery({
    queryKey: developerWarrantyKeys.issue(issueId!),
    queryFn: async () => {
      if (!issueId) return null;
      
      const { data, error } = await supabase
        .from("developer_warranty_issues")
        .select(`
          *,
          location:locations(id, full_address)
        `)
        .eq("id", issueId)
        .single();
      
      if (error) throw error;
      return data as DeveloperWarrantyIssueWithComments;
    },
    enabled: !!issueId,
  });
}

/**
 * Get issue comments
 */
export function useWarrantyIssueComments(issueId: string | undefined) {
  return useQuery({
    queryKey: developerWarrantyKeys.issueComments(issueId!),
    queryFn: async () => {
      if (!issueId) return [];
      
      const { data, error } = await supabase
        .from("developer_warranty_issue_comments")
        .select("*")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data as DeveloperWarrantyIssueComment[];
    },
    enabled: !!issueId,
  });
}

/**
 * Get issue events (audit trail)
 */
export function useWarrantyIssueEvents(issueId: string | undefined) {
  return useQuery({
    queryKey: developerWarrantyKeys.issueEvents(issueId!),
    queryFn: async () => {
      if (!issueId) return [];
      
      const { data, error } = await supabase
        .from("developer_warranty_issue_events")
        .select("*")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as DeveloperWarrantyIssueEvent[];
    },
    enabled: !!issueId,
  });
}

/**
 * Create warranty issue
 */
export function useCreateWarrantyIssue() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (dto: CreateWarrantyIssueDto) => {
      const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
      if (orgErr) {
        console.error("[useCreateWarrantyIssue] get_my_org_id_safe:", orgErr);
        throw orgErr;
      }
      if (!orgId) {
        throw new Error("Brak kontekstu organizacji.");
      }

      const { data, error } = await supabase
        .from("developer_warranty_issues")
        .insert({
          community_id: dto.community_id,
          org_id: orgId,
          location_master_id: dto.location_master_id ?? null,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          location_detail: dto.location_detail,
          priority: dto.priority || "normal",
          photos_reported: dto.photos_reported || [],
          status: "draft",
          source_type: "manual",
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as DeveloperWarrantyIssue;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.issuesList({ community_id: data.community_id }),
      });
    },
  });
}

/**
 * Update warranty issue
 */
export function useUpdateWarrantyIssue() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateWarrantyIssueDto }) => {
      const { data, error } = await supabase
        .from("developer_warranty_issues")
        .update(dto)
        .eq("id", id)
        .eq("status", "draft")
        .select()
        .single();

      if (error) {
        console.error("[useUpdateWarrantyIssue]", error);
        if (error.code === "PGRST116") {
          throw new Error("Można edytować tylko usterkę w statusie szkicu.");
        }
        throw error;
      }
      return data as DeveloperWarrantyIssue;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.issues(),
      });
    },
  });
}

/**
 * Update warranty issue status (includes publish, acknowledge, complete, reject, appeal)
 */
export function useUpdateWarrantyIssueStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ issueId, dto }: { issueId: string; dto: UpdateWarrantyIssueStatusDto }) => {
      const updates: Partial<DeveloperWarrantyIssue> = {
        status: dto.new_status,
      };
      
      // Set timestamp based on status
      const now = new Date().toISOString();
      switch (dto.new_status) {
        case "reported":
          updates.reported_at = now;
          break;
        case "acknowledged":
          updates.acknowledged_at = now;
          break;
        case "completed":
          updates.completed_at = now;
          if (dto.photos_completion) {
            updates.photos_completion = dto.photos_completion;
          }
          break;
        case "rejected":
          updates.rejected_at = now;
          updates.rejection_reason = dto.rejection_reason;
          break;
        case "appealed":
          updates.appealed_at = now;
          updates.appeal_notes = dto.appeal_notes;
          break;
      }
      
      const { data, error } = await supabase
        .from("developer_warranty_issues")
        .update(updates)
        .eq("id", issueId)
        .select()
        .single();
      
      if (error) throw error;
      return data as DeveloperWarrantyIssue;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.issue(data.id),
      });
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.issuesList({ community_id: data.community_id }),
      });
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.issueEvents(data.id),
      });
    },
  });
}

/**
 * Delete warranty issue
 */
export function useDeleteWarrantyIssue() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ issueId, communityId }: { issueId: string; communityId: string }) => {
      const { error } = await supabase
        .from("developer_warranty_issues")
        .delete()
        .eq("id", issueId);
      
      if (error) throw error;
      return { issueId, communityId };
    },
    onSuccess: (variables) => {
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.issuesList({ community_id: variables.communityId }),
      });
    },
  });
}

/**
 * Add comment to warranty issue
 */
export function useAddWarrantyIssueComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (dto: AddWarrantyIssueCommentDto) => {
      const { data: session } = await supabase.auth.getSession();
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", session.session?.user.id)
        .single();
      
      const { data, error } = await supabase
        .from("developer_warranty_issue_comments")
        .insert({
          issue_id: dto.issue_id,
          author_type: "admin",
          author_user_id: session.session?.user.id,
          author_name: profile?.display_name || profile?.email || "Admin",
          comment_text: dto.comment_text,
          attachments: dto.attachments || [],
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as DeveloperWarrantyIssueComment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.issueComments(data.issue_id),
      });
    },
  });
}

// =============================================================================
// COMMUNITY WARRANTY SETTINGS HOOKS
// =============================================================================

/**
 * Get community warranty settings
 */
export function useCommunityWarrantySettings(communityId: string | undefined) {
  return useQuery({
    queryKey: developerWarrantyKeys.settings(communityId!),
    queryFn: async () => {
      if (!communityId) return null;
      
      const { data, error } = await supabase
        .from("community_warranty_settings")
        .select("*")
        .eq("community_id", communityId)
        .maybeSingle();
      
      if (error) throw error;
      return data as CommunityWarrantySettings | null;
    },
    enabled: !!communityId,
  });
}

/**
 * Update community warranty settings
 */
export function useUpdateCommunityWarrantySettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      communityId, 
      orgId,
      dto 
    }: { 
      communityId: string;
      orgId: string;
      dto: UpdateCommunityWarrantySettingsDto;
    }) => {
      // Upsert settings
      const { data, error } = await supabase
        .from("community_warranty_settings")
        .upsert({
          community_id: communityId,
          org_id: orgId,
          ...dto,
        }, {
          onConflict: "community_id",
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as CommunityWarrantySettings;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: developerWarrantyKeys.settings(data.community_id),
      });
    },
  });
}
