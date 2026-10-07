export const AI_ANALYSIS_PACK_SIZE = 100;

export type InboundAiAccessQuota = {
  has_ai_auto?: boolean;
  ai_parses_remaining?: number;
};

/** Automatic forward is available when analyses remain or the plan already includes AI. */
export function canEnableInboundAiAuto(quota: InboundAiAccessQuota | null | undefined): boolean {
  if (!quota) return false;
  if (quota.has_ai_auto === true) return true;
  return (quota.ai_parses_remaining ?? 0) > 0;
}
