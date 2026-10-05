import { CommunityOrderCatalogCard } from "@/components/communities/CommunityOrderCatalogCard";
import { CommunityOrdersInboxCard } from "@/components/communities/CommunityOrdersInboxCard";
import type { CommunityLocationRow } from "@/hooks/useProperties";

type Props = {
  communityId: string;
  buildings: CommunityLocationRow[];
};

export function CommunityOrdersTab({ communityId, buildings }: Props) {
  return (
    <div className="space-y-6">
      <CommunityOrderCatalogCard communityId={communityId} buildings={buildings} />
      <CommunityOrdersInboxCard communityId={communityId} />
    </div>
  );
}
