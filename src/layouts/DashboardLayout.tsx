import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, MoreHorizontal, Siren, User, Zap } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { setPreferredAppView } from "@/lib/sessionKeys";
import { CookieConsentSettingsButton } from "@/components/cookie-consent/CookieConsentRoot";
import { openCookiePreferences } from "@/lib/cookieConsent";

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isFieldPanel = pathname === "/quick-actions";
  const isEmergency = pathname === "/emergency";
  const isMyProfile = pathname === "/profile";

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

  function handleViewToggle() {
    if (isFieldPanel) {
      setPreferredAppView("office");
      navigate("/dashboard");
    } else {
      setPreferredAppView("field");
      navigate("/quick-actions");
    }
  }

  const headerActions = (
    <div className="ml-auto flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-2">
      <div className="hidden items-center gap-2 lg:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-2 text-xs"
              onClick={handleViewToggle}
            >
              {isFieldPanel ? (
                <>
                  <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
                  Panel administracyjny
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" aria-hidden />
                  Panel terenowy
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isFieldPanel ? "Wróć do panelu administracyjnego" : "Przejdź do panelu terenowego"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isEmergency ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-9 gap-2 text-xs",
                isEmergency && "bg-orange-600 text-white hover:bg-orange-700",
              )}
              onClick={() => navigate("/emergency")}
            >
              <Siren className="h-3.5 w-3.5" aria-hidden />
              Zgłoszenie awaryjne
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Zgłoś usterkę do pogotowia 24h</TooltipContent>
        </Tooltip>
        <CookieConsentSettingsButton variant="icon" />
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isMyProfile ? "default" : "outline"}
              size="sm"
              className="h-9 gap-2 text-xs"
              onClick={() => navigate("/profile")}
            >
              <User className="h-3.5 w-3.5" aria-hidden />
              Mój profil
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Imię, nazwisko i telefon</TooltipContent>
        </Tooltip>
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

      <div className="flex items-center gap-0.5 lg:hidden">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isEmergency ? "default" : "ghost"}
              size="icon"
              className={cn(
                "h-9 w-9 shrink-0",
                isEmergency && "bg-orange-600 text-white hover:bg-orange-700",
              )}
              onClick={() => navigate("/emergency")}
              aria-label="Zgłoszenie awaryjne"
            >
              <Siren className="h-4 w-4" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Zgłoś usterkę do pogotowia 24h</TooltipContent>
        </Tooltip>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Więcej funkcji">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={handleViewToggle}>
              {isFieldPanel ? (
                <>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Panel administracyjny
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Panel terenowy
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/profile")}>
              <User className="mr-2 h-4 w-4" />
              Mój profil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openCookiePreferences()}>
              Zarządzaj zgodami cookies
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleSignOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Wyloguj
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  if (isFieldPanel) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-background">
        <header
          className={cn(
            "sticky top-0 z-30 flex h-16 w-full min-w-0 shrink-0 items-center gap-2 border-b border-border/50",
            "bg-background/80 px-3 sm:px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70",
          )}
        >
          <span className="min-w-0 truncate font-display text-sm font-bold tracking-tight gradient-brand-text">
            Administracja
          </span>
          {headerActions}
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header
            className={cn(
              "sticky top-0 z-30 flex h-16 w-full min-w-0 shrink-0 items-center gap-2 border-b border-border/50",
              "bg-background/80 px-3 sm:px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70",
            )}
          >
            <SidebarTrigger
              className={cn(
                "h-9 w-9 shrink-0 rounded-lg border border-border/50 text-muted-foreground",
                "hover:bg-accent hover:text-accent-foreground transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            />
            {headerActions}
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
