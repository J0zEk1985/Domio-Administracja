import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/sonner";
import {
  createAgentCommunityRule,
  deleteAgentCommunityRule,
  fetchCanManageAgentRules,
  listAgentCommunityRules,
  updateAgentCommunityRule,
  type AiRuleCategory,
} from "@/lib/agentCommunityRules";

export function agentRulesQueryKey(communityId: string) {
  return ["agent-community-rules", communityId] as const;
}

export function useAgentCommunityRules(communityId: string) {
  const queryClient = useQueryClient();
  const accessQuery = useQuery({
    queryKey: ["agent-community-rules-access", communityId],
    queryFn: () => fetchCanManageAgentRules(communityId),
    enabled: Boolean(communityId),
  });
  const rulesQuery = useQuery({
    queryKey: agentRulesQueryKey(communityId),
    queryFn: () => listAgentCommunityRules(communityId),
    enabled: accessQuery.data === true,
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: agentRulesQueryKey(communityId) });
  }

  const createMutation = useMutation({
    mutationFn: (input: { category: AiRuleCategory; ruleContent: string }) =>
      createAgentCommunityRule({ communityId, ...input }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Dodano wytyczną AI.");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Nie udało się dodać wytycznej.");
      console.error("[useAgentCommunityRules] create", error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; category: AiRuleCategory; ruleContent: string }) =>
      updateAgentCommunityRule({ communityId, ...input }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Zapisano wytyczną AI.");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Nie udało się zapisać wytycznej.");
      console.error("[useAgentCommunityRules] update", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAgentCommunityRule(communityId, id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Usunięto wytyczną AI.");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Nie udało się usunąć wytycznej.");
      console.error("[useAgentCommunityRules] delete", error);
    },
  });

  return {
    canManage: accessQuery.data === true,
    accessLoading: accessQuery.isLoading,
    accessError: accessQuery.error,
    rules: rulesQuery.data ?? [],
    rulesLoading: rulesQuery.isLoading,
    rulesError: rulesQuery.error,
    createRule: createMutation.mutate,
    updateRule: updateMutation.mutate,
    deleteRule: deleteMutation.mutate,
    isSaving: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
