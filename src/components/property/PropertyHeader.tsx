import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Mic, UserCheck } from "lucide-react";
import type { Location } from "@/data/mock-data";

interface PropertyHeaderProps {
  location: Location;
}

const PropertyHeader = ({ location }: PropertyHeaderProps) => {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {location.name}
          </h1>
          <Badge
            variant="outline"
            className="border-success/30 bg-success/10 text-success font-medium text-xs"
          >
            {location.admin_compliance_score}% Zgodność
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {location.address}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8 text-xs gap-1.5">
          <UserCheck className="h-3.5 w-3.5" />
          Obecność
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Mic className="h-3.5 w-3.5" />
          AI Voice Ticket
        </Button>
      </div>
    </div>
  );
};

export default PropertyHeader;
