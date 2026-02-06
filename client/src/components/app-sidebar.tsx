import { useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Map, List, Search, Bell, Shield,
  BookOpen, Settings, LogOut, Radar, Activity, Globe, Radio
} from "lucide-react";
import type { User } from "@shared/models/auth";
import type { UserProfile } from "@shared/schema";

interface AppSidebarProps {
  user: User | null;
  alertCount: number;
  deviceCount: number;
  profile?: UserProfile | null;
}

const navItems = [
  { title: "Dashboard", path: "/", icon: LayoutDashboard },
  { title: "World Map", path: "/map", icon: Map },
  { title: "Node List", path: "/devices", icon: List },
  { title: "Search & Query", path: "/search", icon: Search },
  { title: "Monitoring", path: "/monitoring", icon: Bell },
  { title: "Counter Intel", path: "/counter-intel", icon: Shield },
  { title: "Device Catalog", path: "/catalog", icon: BookOpen },
  { title: "Settings", path: "/settings", icon: Settings },
];

export function AppSidebar({ user, alertCount, deviceCount, profile }: AppSidebarProps) {
  const [location, setLocation] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Radar className="w-8 h-8 text-primary" />
            {deviceCount > 0 && (
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-chart-3 animate-pulse" />
            )}
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase text-primary">
              SIGINT Hub
            </h1>
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest">
              Signal Intelligence Platform
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[9px] uppercase tracking-widest">
            Operations
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(item => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.path}
                    className="data-[active=true]:bg-sidebar-accent"
                  >
                    <button
                      onClick={() => setLocation(item.path)}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                      {item.title === "Monitoring" && alertCount > 0 && (
                        <Badge variant="destructive" className="ml-auto text-[9px]">
                          {alertCount}
                        </Badge>
                      )}
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[9px] uppercase tracking-widest">
            Status
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-3 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Nodes</span>
                <span className="text-[10px] font-mono">{deviceCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Data Mode</span>
                <Badge variant="outline" className="text-[9px]">Local</Badge>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {user && (
          <div className="flex items-center gap-2">
            <Avatar className="w-7 h-7">
              <AvatarImage src={user.profileImageUrl || undefined} />
              <AvatarFallback className="text-[10px]">
                {(user.firstName?.[0] || user.email?.[0] || "U").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-xs font-medium truncate">
                  {user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user.email || "User"}
                </p>
                {profile?.tier && (
                  <Badge
                    variant="outline"
                    className="text-[8px] uppercase px-1 py-0"
                    style={{
                      color: profile.tier === "admin" ? "hsl(0, 72%, 55%)" : profile.tier === "enterprise" ? "hsl(45, 90%, 55%)" : "hsl(185, 100%, 50%)",
                      borderColor: profile.tier === "admin" ? "hsl(0, 72%, 55%)" : profile.tier === "enterprise" ? "hsl(45, 90%, 55%)" : "hsl(185, 100%, 50%)",
                    }}
                    data-testid="badge-sidebar-tier"
                  >
                    {profile.tier}
                  </Badge>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground truncate">{user.email}</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => window.location.href = "/api/logout"}
              data-testid="button-logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
