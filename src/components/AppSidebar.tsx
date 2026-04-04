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
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Link } from "react-router-dom";
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
import { useIsOrgOwner } from "@/hooks/useIsOrgOwner";
import { usePendingIssuesCount } from "@/hooks/usePendingIssuesCount";

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
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { data: ownerAccess, isLoading: ownerLoading } = useIsOrgOwner();
  const { data: pendingIssuesCount = 0 } = usePendingIssuesCount();
  const showTeam = !ownerLoading && ownerAccess?.isOwner === true;

  const visibleItems = navItems.filter((item) => !item.ownerOnly || showTeam);

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
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3 px-1"}`}>
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
              JK
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">Jan Kowalski</p>
              <p className="text-[11px] text-muted-foreground truncate">Administrator</p>
            </div>
          )}
          {!collapsed && (
            <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
