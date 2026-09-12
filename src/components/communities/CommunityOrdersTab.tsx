import { CommunityOrderCatalogCard } from "@/components/communities/CommunityOrderCatalogCard";
import { CommunityOrderSettingsCard } from "@/components/communities/CommunityOrderSettingsCard";
import { CommunityOrdersInboxCard } from "@/components/communities/CommunityOrdersInboxCard";
import type { CommunityLocationRow } from "@/hooks/useProperties";
import { useResidentOrderSettings } from "@/hooks/useResidentOrders";

type Props = {
  orgId: string;
  communityId: string;
  buildings: CommunityLocationRow[];
};

export function CommunityOrdersTab({ orgId, communityId, buildings }: Props) {
  const settingsQuery = useResidentOrderSettings(communityId);
  const defaultCompanyId = settingsQuery.data?.defaultCompanyId ?? "";

  return (
    <div className="space-y-6">
      <CommunityOrderCatalogCard communityId={communityId} orgId={orgId} buildings={buildings} />
      <CommunityOrderSettingsCard communityId={communityId} />
      <CommunityOrdersInboxCard communityId={communityId} defaultCompanyId={defaultCompanyId} />
    </div>
  );
}
