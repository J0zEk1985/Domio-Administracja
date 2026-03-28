import {
  LayoutDashboard,
  Building2,
  MessageSquareWarning,
  ClipboardCheck,
  FileText,
  MessageCircle,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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

const navItems = [
  { title: "Pulpit", url: "/dashboard", icon: LayoutDashboard },
  { title: "Nieruchomości", url: "/properties", icon: Building2 },
  { title: "Zgłoszenia", url: "/issues", icon: MessageSquareWarning, badge: "3" },
  { title: "Przeglądy (c-KOB)", url: "/inspections", icon: ClipboardCheck },
  { title: "Umowy & Firmy", url: "/contracts", icon: FileText },
  { title: "Komunikacja", url: "/communication", icon: MessageCircle },
  { title: "Zespół", url: "/team", icon: Users },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
              D
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground">
              DOMIO Admin
            </span>
          </div>
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold mx-auto">
            D
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      activeClassName="bg-accent text-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && (
                        <span className="flex-1">{item.title}</span>
                      )}
                      {!collapsed && item.badge && (
                        <Badge
                          variant="secondary"
                          className="h-5 min-w-5 justify-center rounded-full bg-destructive/10 px-1.5 text-[10px] font-medium text-destructive"
                        >
                          {item.badge}
                        </Badge>
                      )}
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
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
