import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users, Shield, Activity, Radio, Cpu, Clock,
  Crown, ChevronDown, ChevronUp, RefreshCw
} from "lucide-react";
import { useState } from "react";
import type { UserProfile } from "@shared/schema";
import { getTierFeatures, TIER_FEATURES, FEATURE_LABELS, type TierFeatures } from "@shared/tier-features";

interface AdminUser extends UserProfile {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  createdAt: string | null;
  deviceCount: number;
  sensorCount: number;
  lastActive: string | null;
}

interface ActivityEntry {
  id: number;
  userId: string;
  action: string;
  details: string | null;
  ipAddress: string | null;
  timestamp: string;
}

const tierColors: Record<string, string> = {
  free: "hsl(185, 100%, 50%)",
  basic: "hsl(120, 60%, 50%)",
  professional: "hsl(210, 80%, 60%)",
  enterprise: "hsl(45, 90%, 55%)",
  admin: "hsl(0, 72%, 55%)",
};

const tierOrder = ["free", "basic", "professional", "enterprise", "admin"];

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleString();
}

export default function AdminPage() {
  const { toast } = useToast();
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [activityUserId, setActivityUserId] = useState<string | null>(null);

  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/profile"] });
  const isAdmin = profile?.tier === "admin";

  const { data: adminUsers = [], isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const activityQueryKey = activityUserId
    ? `/api/admin/activity?userId=${activityUserId}&limit=100`
    : `/api/admin/activity?limit=100`;

  const { data: activityLog = [], isLoading: activityLoading } = useQuery<ActivityEntry[]>({
    queryKey: ["/api/admin/activity", activityUserId],
    queryFn: async () => {
      const res = await fetch(activityQueryKey, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
    enabled: isAdmin,
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ targetUserId, tier }: { targetUserId: string; tier: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${targetUserId}`, { tier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"], exact: false });
      toast({ title: "User Updated", description: "User tier has been changed successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update user.", variant: "destructive" });
    },
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="admin-access-denied">
        <Card className="max-w-sm">
          <CardContent className="p-6 text-center">
            <Shield className="w-10 h-10 mx-auto mb-3 text-destructive" />
            <h3 className="text-sm font-semibold mb-1">Access Denied</h3>
            <p className="text-xs text-muted-foreground">
              Admin privileges are required to access user management.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sortedUsers = [...adminUsers].sort((a, b) => {
    return tierOrder.indexOf(b.tier) - tierOrder.indexOf(a.tier);
  });

  const tierStats = tierOrder.map(t => ({
    tier: t,
    count: adminUsers.filter(u => u.tier === t).length,
  }));

  const totalDevices = adminUsers.reduce((sum, u) => sum + u.deviceCount, 0);
  const totalSensors = adminUsers.reduce((sum, u) => sum + u.sensorCount, 0);

  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-auto" data-testid="admin-page">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-destructive" />
        <h2 className="text-sm font-semibold uppercase tracking-wider" data-testid="text-admin-title">
          Admin - User Management
        </h2>
        <Badge variant="outline" className="text-[9px] ml-auto" data-testid="badge-total-users">
          {adminUsers.length} Users
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <div>
              <p className="text-[9px] text-muted-foreground uppercase">Total Users</p>
              <p className="text-sm font-mono font-bold" data-testid="text-stat-users">{adminUsers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Radio className="w-4 h-4 text-chart-3" />
            <div>
              <p className="text-[9px] text-muted-foreground uppercase">Total Nodes</p>
              <p className="text-sm font-mono font-bold" data-testid="text-stat-devices">{totalDevices}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-chart-4" />
            <div>
              <p className="text-[9px] text-muted-foreground uppercase">Total Sensors</p>
              <p className="text-sm font-mono font-bold" data-testid="text-stat-sensors">{totalSensors}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-chart-5" />
            <div>
              <p className="text-[9px] text-muted-foreground uppercase">Tier Breakdown</p>
              <div className="flex items-center gap-1 flex-wrap">
                {tierStats.filter(t => t.count > 0).map(t => (
                  <Badge
                    key={t.tier}
                    variant="outline"
                    className="text-[8px] uppercase px-1 py-0"
                    style={{ color: tierColors[t.tier], borderColor: tierColors[t.tier] }}
                    data-testid={`badge-tier-count-${t.tier}`}
                  >
                    {t.tier}: {t.count}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0">
        <div className="lg:col-span-2 flex flex-col gap-2">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-xs uppercase tracking-wider">Registered Users</CardTitle>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] })}
                data-testid="button-refresh-users"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="p-3 pt-0 flex-1 overflow-auto">
              {usersLoading ? (
                <p className="text-xs text-muted-foreground italic">Loading users...</p>
              ) : sortedUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No users found.</p>
              ) : (
                <div className="space-y-1.5">
                  {sortedUsers.map(user => {
                    const isExpanded = expandedUser === user.userId;
                    const displayName = user.firstName
                      ? `${user.firstName} ${user.lastName || ""}`.trim()
                      : user.email || user.userId;
                    const initials = (user.firstName?.[0] || user.email?.[0] || "U").toUpperCase();
                    const userTierConfig = getTierFeatures(user.tier);
                    const isSelf = user.userId === profile?.userId;

                    return (
                      <div
                        key={user.userId}
                        className="rounded-md border border-border/40 bg-muted/5"
                        data-testid={`card-user-${user.userId}`}
                      >
                        <div className="flex items-center gap-2 p-2">
                          <Avatar className="w-7 h-7 shrink-0">
                            <AvatarImage src={user.profileImageUrl || undefined} />
                            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-medium truncate" data-testid={`text-user-name-${user.userId}`}>
                                {displayName}
                              </span>
                              {isSelf && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0">You</Badge>
                              )}
                            </div>
                            <p className="text-[9px] text-muted-foreground truncate" data-testid={`text-user-email-${user.userId}`}>
                              {user.email || "No email"}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 text-[9px] text-muted-foreground">
                            <div className="text-center hidden sm:block">
                              <p className="font-mono font-bold text-foreground" data-testid={`text-user-devices-${user.userId}`}>{user.deviceCount}</p>
                              <p>Nodes</p>
                            </div>
                            <div className="text-center hidden sm:block">
                              <p className="font-mono font-bold text-foreground" data-testid={`text-user-sensors-${user.userId}`}>{user.sensorCount}</p>
                              <p>Sensors</p>
                            </div>
                            <div className="text-center hidden md:block">
                              <p className="font-mono text-foreground" data-testid={`text-user-active-${user.userId}`}>{formatTimeAgo(user.lastActive)}</p>
                              <p>Last Active</p>
                            </div>
                          </div>

                          <Select
                            value={user.tier}
                            onValueChange={(newTier) => {
                              if (newTier !== user.tier) {
                                updateUserMutation.mutate({ targetUserId: user.userId, tier: newTier });
                              }
                            }}
                            disabled={updateUserMutation.isPending}
                          >
                            <SelectTrigger
                              className="w-[120px] text-[10px] shrink-0"
                              style={{ color: tierColors[user.tier], borderColor: tierColors[user.tier] + "40" }}
                              data-testid={`select-tier-${user.userId}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {tierOrder.map(t => (
                                <SelectItem key={t} value={t} data-testid={`option-tier-${t}`}>
                                  <span className="flex items-center gap-1">
                                    {t === "admin" && <Crown className="w-3 h-3" />}
                                    <span className="capitalize">{t}</span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setExpandedUser(isExpanded ? null : user.userId);
                              if (!isExpanded) setActivityUserId(user.userId);
                            }}
                            data-testid={`button-expand-${user.userId}`}
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </Button>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-border/30 p-3 space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
                              <div>
                                <p className="text-muted-foreground uppercase mb-0.5">User ID</p>
                                <p className="font-mono text-[9px] break-all" data-testid={`text-user-id-${user.userId}`}>{user.userId}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground uppercase mb-0.5">Joined</p>
                                <p className="font-mono" data-testid={`text-user-joined-${user.userId}`}>{formatDate(user.createdAt)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground uppercase mb-0.5">Data Mode</p>
                                <Badge variant="outline" className="text-[8px] uppercase" data-testid={`badge-user-mode-${user.userId}`}>
                                  {user.dataMode}
                                </Badge>
                              </div>
                              <div>
                                <p className="text-muted-foreground uppercase mb-0.5">Storage</p>
                                <p className="font-mono" data-testid={`text-user-storage-${user.userId}`}>
                                  {((user.storageUsedBytes || 0) / 1048576).toFixed(1)} MB / {((user.storageLimitBytes || 0) / 1073741824).toFixed(1)} GB
                                </p>
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase mb-1">Tier Limits</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[9px]">
                                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/10">
                                  <span className="text-muted-foreground">Max Nodes</span>
                                  <span className="font-mono">{userTierConfig.maxDevices < 0 ? "Unlimited" : userTierConfig.maxDevices}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/10">
                                  <span className="text-muted-foreground">Max Sensors</span>
                                  <span className="font-mono">{userTierConfig.maxSensors < 0 ? "Unlimited" : userTierConfig.maxSensors}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/10">
                                  <span className="text-muted-foreground">Trusted Users</span>
                                  <span className="font-mono">{userTierConfig.maxTrustedUsers < 0 ? "Unlimited" : userTierConfig.maxTrustedUsers}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/10">
                                  <span className="text-muted-foreground">Analysis Timeout</span>
                                  <span className="font-mono">{userTierConfig.analysisTimeoutSeconds < 0 ? "Unlimited" : `${userTierConfig.analysisTimeoutSeconds}s`}</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase mb-1">Features</p>
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(userTierConfig.features).map(([key, enabled]) => (
                                  <Badge
                                    key={key}
                                    variant={enabled ? "default" : "outline"}
                                    className={`text-[8px] ${!enabled ? "opacity-40" : ""}`}
                                    data-testid={`badge-feature-${key}-${user.userId}`}
                                  >
                                    {FEATURE_LABELS[key as keyof typeof FEATURE_LABELS]?.label || key}
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            {activityUserId === user.userId && (
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase mb-1">Recent Activity</p>
                                {activityLoading ? (
                                  <p className="text-[9px] text-muted-foreground italic">Loading...</p>
                                ) : activityLog.length === 0 ? (
                                  <p className="text-[9px] text-muted-foreground italic">No recent activity</p>
                                ) : (
                                  <div className="max-h-40 overflow-auto space-y-0.5">
                                    {activityLog.slice(0, 20).map(entry => (
                                      <div key={entry.id} className="flex items-start gap-2 text-[9px] p-1 rounded bg-muted/5">
                                        <Clock className="w-2.5 h-2.5 mt-0.5 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0 flex-1">
                                          <span className="font-mono text-primary">{entry.action}</span>
                                          {entry.details && (
                                            <span className="text-muted-foreground ml-1 break-all">{entry.details}</span>
                                          )}
                                        </div>
                                        <span className="text-muted-foreground shrink-0">{formatTimeAgo(entry.timestamp)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-2">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-xs uppercase tracking-wider">System Activity</CardTitle>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setActivityUserId(null);
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"], exact: false });
                }}
                data-testid="button-show-all-activity"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="p-3 pt-0 flex-1 overflow-auto">
              {activityLoading ? (
                <p className="text-[9px] text-muted-foreground italic">Loading activity...</p>
              ) : activityLog.length === 0 ? (
                <p className="text-[9px] text-muted-foreground italic">No activity recorded yet.</p>
              ) : (
                <div className="space-y-1">
                  {activityLog.slice(0, 50).map(entry => {
                    const entryUser = adminUsers.find(u => u.userId === entry.userId);
                    const entryName = entryUser?.firstName || entryUser?.email || entry.userId.slice(0, 8);
                    return (
                      <div
                        key={entry.id}
                        className="text-[9px] p-1.5 rounded bg-muted/5 border border-border/20"
                        data-testid={`activity-entry-${entry.id}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="font-medium truncate">{entryName}</span>
                          <span className="text-muted-foreground shrink-0">{formatTimeAgo(entry.timestamp)}</span>
                        </div>
                        <div className="flex items-start gap-1">
                          <Badge variant="outline" className="text-[7px] shrink-0 px-1 py-0">{entry.action}</Badge>
                          {entry.details && (
                            <span className="text-muted-foreground break-all">{entry.details}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
