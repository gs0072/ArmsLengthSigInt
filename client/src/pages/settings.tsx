import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SettingsPanel } from "@/components/settings-panel";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Key, Copy, Trash2, Plus, Loader2, AlertTriangle } from "lucide-react";

interface CollectorKey {
  id: number;
  name: string;
  maskedKey: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/profile"] });
  const { toast } = useToast();

  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<{ id: number; name: string; apiKey: string } | null>(null);

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

  const { data: collectorKeys = [], isLoading: keysLoading } = useQuery<CollectorKey[]>({
    queryKey: ["/api/collector/keys"],
  });

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/collector/keys", { name });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/collector/keys"] });
      setNewKeyName("");
      setRevealedKey({ id: data.id, name: data.name, apiKey: data.apiKey });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate API key.", variant: "destructive" });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collector/keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collector/keys"] });
      toast({ title: "API Key Deleted", description: "The collector API key has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete API key.", variant: "destructive" });
    },
  });

  const handleCopyKey = () => {
    if (revealedKey) {
      navigator.clipboard.writeText(revealedKey.apiKey);
      toast({ title: "Copied", description: "API key copied to clipboard." });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
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

        <Card className="overflow-visible">
          <CardHeader className="flex flex-row items-center gap-2 pb-2 px-3 pt-3">
            <Key className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Collector API Keys</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Generate API keys to connect external collector scripts that scan real hardware.
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-3 pb-3 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Key name (e.g. 'Office Scanner')"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="text-xs"
                data-testid="input-key-name"
              />
              <Button
                size="sm"
                disabled={!newKeyName.trim() || createKeyMutation.isPending}
                onClick={() => createKeyMutation.mutate(newKeyName.trim())}
                data-testid="button-generate-key"
              >
                {createKeyMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Plus className="w-3 h-3 mr-1" />
                )}
                Generate Key
              </Button>
            </div>

            {revealedKey && (
              <div className="p-3 rounded-md border border-primary/40 bg-primary/5 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0" />
                  <p className="text-[10px] text-primary font-medium">
                    Save this key now — you won't be able to see it again.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-muted/20 px-2 py-1.5 rounded-md break-all select-all" data-testid="text-revealed-key">
                    {revealedKey.apiKey}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopyKey}
                    data-testid="button-copy-key"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[10px]"
                  onClick={() => setRevealedKey(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}

            {keysLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : collectorKeys.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-[10px] text-muted-foreground">No API keys generated yet.</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">Create a key to connect your collector scripts.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {collectorKeys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-md border border-border/50 bg-muted/10"
                    data-testid={`text-api-key-${k.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Key className="w-3 h-3 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium truncate">{k.name}</span>
                          <Badge variant="outline" className="text-[8px] font-mono shrink-0">
                            ...{k.maskedKey}
                          </Badge>
                          {k.isActive && (
                            <Badge variant="outline" className="text-[7px] text-green-500 border-green-500/30 shrink-0">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[9px] text-muted-foreground">
                            Created: {formatDate(k.createdAt)}
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            Last used: {formatDate(k.lastUsedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteKeyMutation.mutate(k.id)}
                      disabled={deleteKeyMutation.isPending}
                      data-testid={`button-delete-key-${k.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-border/30">
              <div className="flex items-center gap-2">
                <Key className="w-3 h-3 text-muted-foreground" />
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Quick Start</h4>
              </div>
              <div className="rounded-md bg-muted/20 p-2.5 font-mono text-[10px] text-muted-foreground leading-relaxed select-all">
                <div>pip install requests</div>
                <div className="mt-1">python sigint_collector.py --key YOUR_KEY --url https://your-app.replit.app</div>
              </div>
              <p className="text-[9px] text-muted-foreground/60">
                Replace YOUR_KEY with the generated API key and update the URL to match your deployment.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
