import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import WorldMapPage from "@/pages/world-map";
import DevicesPage from "@/pages/devices";
import SearchPage from "@/pages/search";
import MonitoringPage from "@/pages/monitoring";
import CounterIntelPage from "@/pages/counter-intel";
import CatalogPage from "@/pages/catalog";
import SettingsPage from "@/pages/settings";
import NodeReportPage from "@/pages/node-report";
import ToolsPage from "@/pages/tools";
import type { Alert, UserProfile, Device } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/map" component={WorldMapPage} />
      <Route path="/devices" component={DevicesPage} />
      <Route path="/search" component={SearchPage} />
      <Route path="/monitoring" component={MonitoringPage} />
      <Route path="/counter-intel" component={CounterIntelPage} />
      <Route path="/catalog" component={CatalogPage} />
      <Route path="/tools" component={ToolsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/node-report/:id" component={NodeReportPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();
  const { data: alerts = [] } = useQuery<Alert[]>({ queryKey: ["/api/alerts"] });
  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/profile"] });
  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const activeAlerts = alerts.filter(a => a.status === "active" || a.status === "triggered");

  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          user={user ?? null}
          alertCount={activeAlerts.length}
          deviceCount={devices.length}
          profile={profile ?? null}
        />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-2 border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1" />
            <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-mono">
              SIGINT Hub v1.0
            </div>
          </header>
          <main className="flex-1 overflow-hidden">
            <AuthenticatedRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="w-12 h-12 rounded-full" />
          <Skeleton className="w-32 h-4" />
          <p className="text-xs text-muted-foreground">Initializing secure connection...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
