import {
  LayoutDashboard,
  Landmark,
  MapPin,
  MessageSquareWarning,
  ShieldCheck,
  FileText,
  ListTodo,
  Users,
  Settings,
  Zap,
  Megaphone,
  User,
  LogOut,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Link, useNavigate } from "react-router-dom";
import domioLogo from "@/assets/domio-logo.jpg";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsOrgOwner } from "@/hooks/useIsOrgOwner";
import { usePendingIssuesCount } from "@/hooks/usePendingIssuesCount";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  /** If true, link is rendered only when `condition` passes */
  ownerOnly?: boolean;
};

const navItems: NavItem[] = [
  { title: "Pulpit", url: "/dashboard", icon: LayoutDashboard },
  { title: "Wspólnoty", url: "/communities", icon: Landmark },
  { title: "Budynki", url: "/properties", icon: MapPin },
  { title: "Zgłoszenia", url: "/issues", icon: MessageSquareWarning },
  { title: "Panel terenowy", url: "/quick-actions", icon: Zap },
  { title: "Tablica ogłoszeń", url: "/e-board", icon: Megaphone },
  { title: "Umowy & Firmy", url: "/contracts", icon: FileText },
  { title: "Przeglądy (c-KOB)", url: "/inspections", icon: ShieldCheck },
  { title: "Zadania", url: "/tasks", icon: ListTodo },
  { title: "Zespół", url: "/team", icon: Users, ownerOnly: true },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { data: ownerAccess, isLoading: ownerLoading } = useIsOrgOwner();
  const { data: pendingIssuesCount = 0 } = usePendingIssuesCount();
  const showTeam = !ownerLoading && ownerAccess?.isOwner === true;

  const visibleItems = navItems.filter((item) => !item.ownerOnly || showTeam);

  // TODO: Replace with dynamic user session data (e.g. Supabase useUser / profile)
  const userDisplayName = "Jan Kowalski";
  // TODO: Replace with dynamic user session data
  const userEmail = "jan.kowalski@example.com";
  // TODO: Replace with dynamic user session data (derived from name or image)
  const userInitials = "JK";
  // TODO: Replace with dynamic user session data (role / org title)
  const userSubtitle = "Administrator";

  async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("[AppSidebar] signOut:", error);
      }
    } catch (e) {
      console.error("[AppSidebar] signOut unexpected:", e);
    } finally {
      navigate("/login", { replace: true });
    }
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="p-4">
        <Link
          to="/dashboard"
          className={`flex items-center gap-2 outline-none ring-sidebar-ring rounded-lg focus-visible:ring-2 ${collapsed ? "justify-center" : ""}`}
          title="DOMIO Administracja"
        >
          <img
            src={domioLogo}
            alt="DOMIO"
            className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-border/40"
          />
          {!collapsed && (
            <span className="font-display text-base font-bold leading-tight gradient-brand-text">
              Administracja
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="flex-1">{item.title}</span>}
                      {!collapsed && item.url === "/issues" && pendingIssuesCount > 0 ? (
                        <Badge
                          variant="secondary"
                          className="h-5 min-w-5 justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground"
                        >
                          {pendingIssuesCount > 99 ? "99+" : pendingIssuesCount}
                        </Badge>
                      ) : null}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Separator className="mb-3" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full items-center rounded-lg text-left outline-none ring-sidebar-ring transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2",
                collapsed ? "justify-center p-1" : "gap-3 px-2 py-2",
              )}
              aria-label="Menu konta użytkownika"
            >
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{userDisplayName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{userSubtitle}</p>
                  </div>
                  <Settings
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            align="end"
            side={collapsed ? "right" : "top"}
            sideOffset={8}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold leading-tight">{userDisplayName}</span>
                <span className="text-xs text-muted-foreground">{userEmail}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                // TODO: Replace with dynamic user session data — navigate to profile route when available
              }}
            >
              <User className="h-4 w-4" aria-hidden />
              Mój profil
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                // TODO: Replace with navigation to account settings when route exists
              }}
            >
              <Settings className="h-4 w-4" aria-hidden />
              Ustawienia konta
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={() => {
                void handleSignOut();
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Wyloguj się
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
