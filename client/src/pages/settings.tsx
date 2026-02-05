import { useQuery } from "@tanstack/react-query";
import { SettingsPanel } from "@/components/settings-panel";
import type { UserProfile } from "@shared/schema";
import { useState } from "react";

export default function SettingsPage() {
  const [dataMode, setDataMode] = useState("local");
  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/profile"] });

  return (
    <div className="flex flex-col h-full p-3">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Settings</h2>
      </div>
      <div className="flex-1 min-h-0 max-w-2xl">
        <SettingsPanel
          dataMode={dataMode}
          onDataModeChange={setDataMode}
          storageUsed={profile?.storageUsedBytes ?? 0}
          storageLimit={profile?.storageLimitBytes ?? 2147483648}
          userTier={profile?.tier ?? "free"}
        />
      </div>
    </div>
  );
}
