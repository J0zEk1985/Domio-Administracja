/**
 * Zakładka Zasobów Wspólnych (Panel Zarządcy)
 * Zarządzanie zasobami i rezerwacjami wspólnoty
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Settings, Calendar, BarChart3, Clock } from "lucide-react";
import { ResourcesManagementView } from "@/components/shared-resources/admin/ResourcesManagementView";
import { 
  PendingBookingsView,
  UsageReportsView,
  AvailabilityCalendarView,
  CreateResourceDialog
} from "@/components/shared-resources/admin/PanelComponents";
// import { CreateResourceDialog } from "@/components/shared-resources/admin/CreateResourceDialog"; // Fixed import
import type { CommunityLocationRow } from "@/hooks/useProperties";

interface CommunitySharedResourcesTabProps {
  communityId: string;
  buildings: CommunityLocationRow[];
}

export function CommunitySharedResourcesTab({
  communityId,
  buildings,
}: CommunitySharedResourcesTabProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("resources");

  const primaryLocationId = buildings[0]?.id || null;

  if (!primaryLocationId) {
    return (
      <div className="rounded-lg border-2 border-dashed p-8 text-center">
        <Settings className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">
          Dodaj budynek do wspólnoty
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Aby zarządzać zasobami wspólnymi, najpierw dodaj budynki do tej
          wspólnoty.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Zasoby Wspólne</h2>
          <p className="text-sm text-muted-foreground">
            Zarządzaj zasobami wspólnoty i rezerwacjami mieszkańców
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Dodaj zasób
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="resources" className="gap-2">
            <Settings className="h-4 w-4" />
            Zasoby
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Oczekujące
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <Calendar className="h-4 w-4" />
            Kalendarz
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Raporty
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resources" className="mt-6">
          <ResourcesManagementView
            communityId={communityId}
            locationId={primaryLocationId}
          />
        </TabsContent>

        <TabsContent value="pending" className="mt-6">
          <PendingBookingsView communityId={communityId} />
        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
          <AvailabilityCalendarView communityId={communityId} />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <UsageReportsView communityId={communityId} />
        </TabsContent>
      </Tabs>

      {/* Dialog tworzenia zasobu */}
      <CreateResourceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        communityId={communityId}
        locationId={primaryLocationId}
      />
    </div>
  );
}
