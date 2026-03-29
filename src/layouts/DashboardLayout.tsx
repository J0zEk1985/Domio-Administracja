import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export default function DashboardLayout() {
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("[DashboardLayout] signOut:", error);
      }
    } catch (e) {
      console.error("[DashboardLayout] signOut unexpected:", e);
    } finally {
      navigate("/login", { replace: true });
    }
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header
            className={cn(
              "sticky top-0 z-30 flex h-16 w-full shrink-0 items-center gap-3 border-b border-border/50",
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
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-2 text-xs"
                onClick={() => void handleSignOut()}
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Wyloguj
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
