import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import PropertyHeader from "@/components/property/PropertyHeader";
import MetricCards from "@/components/property/MetricCards";
import InspectionsTab from "@/components/property/InspectionsTab";
import IssuesTab from "@/components/property/IssuesTab";
import ContractsTab from "@/components/property/ContractsTab";
import {
  mockLocation,
  mockInspections,
  mockContracts,
  mockIssues,
} from "@/data/mock-data";

const LoadingSkeleton = () => (
  <div className="mx-auto max-w-5xl space-y-6 p-6">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-md" />
      ))}
    </div>
    <Skeleton className="h-10 w-full" />
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  </div>
);

const Index = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PropertyHeader location={mockLocation} />
      <MetricCards
        issues={mockIssues}
        inspections={mockInspections}
        contracts={mockContracts}
      />
      <Tabs defaultValue="inspections" className="space-y-4">
        <TabsList className="h-9 bg-secondary">
          <TabsTrigger value="inspections" className="text-xs">
            Przeglądy (c-KOB)
          </TabsTrigger>
          <TabsTrigger value="issues" className="text-xs">
            Awarie & Zlecenia
          </TabsTrigger>
          <TabsTrigger value="contracts" className="text-xs">
            Umowy & Firmy
          </TabsTrigger>
        </TabsList>
        <TabsContent value="inspections">
          <InspectionsTab inspections={mockInspections} />
        </TabsContent>
        <TabsContent value="issues">
          <IssuesTab issues={mockIssues} />
        </TabsContent>
        <TabsContent value="contracts">
          <ContractsTab contracts={mockContracts} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
