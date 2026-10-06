/**
 * Widok zarządzania zasobami (lista + edycja)
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, MoreVertical, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { useAvailableResources, useUpdateResource, useDeactivateResource } from "@/hooks/useSharedResources";
import { EditResourceDialog } from "./PanelComponents";
import { formatPricePerUnit } from "@/lib/sharedResourcesHelpers";
import type { SharedResource } from "@/types/sharedResources";

interface ResourcesManagementViewProps {
  communityId: string;
  locationId: string;
}

export function ResourcesManagementView({
  communityId,
  locationId,
}: ResourcesManagementViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [editingResource, setEditingResource] = useState<SharedResource | null>(null);

  const { data: resources, isLoading } = useAvailableResources({
    resourceType: "community_managed",
    category: category === "all" ? undefined : category,
  });

  const updateResource = useUpdateResource("");
  const deactivateResource = useDeactivateResource();

  const filteredResources = resources?.filter((r) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        r.name.toLowerCase().includes(query) ||
        r.description?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const handleToggleStatus = async (resource: SharedResource) => {
    const newStatus = resource.status === "active" ? "inactive" : "active";
    await updateResource.mutateAsync({
      status: newStatus,
    } as any);
  };

  const handleDeactivate = async (resourceId: string) => {
    if (confirm("Czy na pewno chcesz dezaktywować ten zasób?")) {
      await deactivateResource.mutateAsync(resourceId);
    }
  };

  const categories = [
    { value: "all", label: "Wszystkie" },
    { value: "parking", label: "Parking" },
    { value: "storage", label: "Magazyn/Komórka" },
    { value: "equipment", label: "Sprzęt" },
    { value: "recreation", label: "Rekreacja" },
    { value: "other", label: "Inne" },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Lista zasobów wspólnych</CardTitle>
          <CardDescription>
            Zarządzaj zasobami dostępnymi dla mieszkańców
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtry */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Szukaj zasobu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tabela */}
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredResources && filteredResources.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nazwa</TableHead>
                    <TableHead>Kategoria</TableHead>
                    <TableHead>Cena</TableHead>
                    <TableHead>Limity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResources.map((resource) => (
                    <TableRow key={resource.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{resource.name}</div>
                          {resource.description && (
                            <div className="text-sm text-muted-foreground line-clamp-1">
                              {resource.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {resource.category || "—"}
                      </TableCell>
                      <TableCell>
                        {resource.isFree ? (
                          <Badge variant="outline">Bezpłatny</Badge>
                        ) : (
                          <span className="text-sm">
                            {formatPricePerUnit(
                              resource.billingUnit === "hourly"
                                ? resource.pricePerHour
                                : resource.pricePerDay,
                              resource.billingUnit
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {resource.maxBookingsPerUnitMonthly && (
                          <div>{resource.maxBookingsPerUnitMonthly} rez./m-c</div>
                        )}
                        {resource.maxHoursPerUnitMonthly && (
                          <div>{resource.maxHoursPerUnitMonthly} h/m-c</div>
                        )}
                        {!resource.maxBookingsPerUnitMonthly &&
                          !resource.maxHoursPerUnitMonthly && "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            resource.status === "active"
                              ? "success"
                              : "secondary"
                          }
                        >
                          {resource.status === "active"
                            ? "Aktywny"
                            : "Nieaktywny"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditingResource(resource)}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edytuj
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleToggleStatus(resource)}
                            >
                              {resource.status === "active" ? (
                                <>
                                  <EyeOff className="mr-2 h-4 w-4" />
                                  Dezaktywuj
                                </>
                              ) : (
                                <>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Aktywuj
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeactivate(resource.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Usuń
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Brak zasobów. Kliknij "Dodaj zasób" aby utworzyć pierwszy.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog edycji */}
      {editingResource && (
        <EditResourceDialog
          open={Boolean(editingResource)}
          onOpenChange={(open) => !open && setEditingResource(null)}
          resource={editingResource}
        />
      )}
    </>
  );
}
