import { useQuery, useMutation } from "@tanstack/react-query";
import { SettingsPanel } from "@/components/settings-panel";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/profile"] });
  const { toast } = useToast();

  const updateDataModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      return apiRequest("PATCH", "/api/profile", { dataMode: mode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Data Mode Updated", description: "Your data mode preference has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update data mode.", variant: "destructive" });
    },
  });

  return (
    <div className="flex flex-col h-full p-3 overflow-auto" data-testid="settings-page">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Settings</h2>
      </div>
      <div className="flex-1 min-h-0 max-w-2xl space-y-4">
        <SettingsPanel
          dataMode={profile?.dataMode ?? "local"}
          onDataModeChange={(mode) => updateDataModeMutation.mutate(mode)}
          storageUsed={profile?.storageUsedBytes ?? 0}
          storageLimit={profile?.storageLimitBytes ?? 2147483648}
          userTier={profile?.tier ?? "free"}
        />
      </div>
    </div>
  );
}
