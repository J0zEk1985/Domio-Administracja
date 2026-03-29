import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function DashboardLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header
            className={cn(
              "sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/50",
              "bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70",
            )}
          >
            <SidebarTrigger
              className={cn(
                "h-9 w-9 shrink-0 rounded-lg border border-border/50 text-muted-foreground",
                "hover:bg-accent hover:text-accent-foreground transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            />
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
