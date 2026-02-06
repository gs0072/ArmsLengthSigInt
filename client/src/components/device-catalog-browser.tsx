import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, ChevronDown, ChevronRight, BookOpen, Bell, Radio, Info } from "lucide-react";
import { DEVICE_CATEGORIES, DEVICE_BROADCAST_SIGNATURES, type BroadcastSignature } from "@/lib/signal-utils";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DeviceCatalogBrowserProps {
  onSearchDevice?: (term: string, signature?: BroadcastSignature) => void;
}

export function DeviceCatalogBrowser({ onSearchDevice }: DeviceCatalogBrowserProps) {
  const [search, setSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertItem, setAlertItem] = useState<string | null>(null);
  const { toast } = useToast();

  const toggleCategory = (cat: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const filteredCategories = DEVICE_CATEGORIES.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      !search || item.toLowerCase().includes(search.toLowerCase()) ||
      cat.category.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat => cat.items.length > 0);

  const handleItemClick = (item: string) => {
    const sig = DEVICE_BROADCAST_SIGNATURES[item];
    setSelectedItem(item);
    onSearchDevice?.(item, sig);
  };

  const createAlertMutation = useMutation({
    mutationFn: async (data: { name: string; terms: string[]; signalTypes: string[] }) => {
      const res = await apiRequest("POST", "/api/alerts", {
        name: `${data.name} Detection Alert`,
        description: `Alert when ${data.name} devices are detected. Monitors for known broadcast signatures.`,
        alertType: "device_detected",
        criteria: {
          type: "catalog_broadcast_match",
          catalogItem: data.name,
          terms: data.terms,
          signalTypes: data.signalTypes,
          matchMode: "any",
        },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alert Created", description: `You'll be notified when matching devices are detected.` });
      setAlertDialogOpen(false);
      setAlertItem(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create alert.", variant: "destructive" });
    },
  });

  const handleCreateAlert = (item: string) => {
    setAlertItem(item);
    setAlertDialogOpen(true);
  };

  const confirmCreateAlert = () => {
    if (!alertItem) return;
    const sig = DEVICE_BROADCAST_SIGNATURES[alertItem];
    createAlertMutation.mutate({
      name: alertItem,
      terms: sig?.terms || [alertItem],
      signalTypes: sig?.signalTypes || ["bluetooth"],
    });
  };

  const alertSig = alertItem ? DEVICE_BROADCAST_SIGNATURES[alertItem] : null;

  return (
    <>
      <Card className="flex flex-col h-full overflow-visible">
        <CardHeader className="flex flex-row items-center gap-2 pb-2 px-3 pt-3">
          <BookOpen className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Device Catalog</h3>
        </CardHeader>

        <CardContent className="flex-1 px-3 pb-3 overflow-hidden">
          <div className="relative mb-3">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search devices..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 text-xs"
              data-testid="input-catalog-search"
            />
          </div>

          <ScrollArea className="h-full">
            <div className="space-y-1">
              {filteredCategories.map(cat => (
                <Collapsible
                  key={cat.category}
                  open={openCategories.has(cat.category) || !!search}
                  onOpenChange={() => toggleCategory(cat.category)}
                >
                  <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 p-2 rounded-md hover-elevate text-xs">
                    <div className="flex items-center gap-2">
                      {openCategories.has(cat.category) || search ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      <span className="font-medium">{cat.category}</span>
                    </div>
                    <Badge variant="secondary" className="text-[9px]">{cat.items.length}</Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-6 space-y-0.5 mb-1">
                      {cat.items.map(item => {
                        const sig = DEVICE_BROADCAST_SIGNATURES[item];
                        const isSelected = selectedItem === item;
                        return (
                          <div key={item} className="space-y-0">
                            <div
                              className={`w-full text-left p-1.5 rounded-md text-xs hover-elevate flex items-center justify-between gap-2 cursor-pointer ${isSelected ? "bg-primary/10 border border-primary/30" : ""}`}
                              onClick={() => handleItemClick(item)}
                              data-testid={`button-catalog-${item.toLowerCase().replace(/\s/g, "-")}`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <span className={isSelected ? "text-foreground font-medium" : "text-muted-foreground"}>{item}</span>
                                {sig && (
                                  <Badge variant="outline" className="text-[8px] shrink-0">
                                    {sig.terms.length} sigs
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}
                                  data-testid={`button-search-${item.toLowerCase().replace(/\s/g, "-")}`}
                                >
                                  <Search className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={(e) => { e.stopPropagation(); handleCreateAlert(item); }}
                                  data-testid={`button-alert-${item.toLowerCase().replace(/\s/g, "-")}`}
                                >
                                  <Bell className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            {isSelected && sig && (
                              <div className="ml-2 p-2 rounded-md bg-muted/30 border border-border/30 mb-1">
                                <p className="text-[10px] text-muted-foreground mb-1.5">{sig.description}</p>
                                <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                                  {sig.signalTypes.map(st => (
                                    <Badge key={st} variant="secondary" className="text-[8px]">
                                      <Radio className="w-2 h-2 mr-0.5" />{st}
                                    </Badge>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {sig.terms.slice(0, 12).map(t => (
                                    <Badge key={t} variant="outline" className="text-[8px] font-mono">{t}</Badge>
                                  ))}
                                  {sig.terms.length > 12 && (
                                    <Badge variant="outline" className="text-[8px]">+{sig.terms.length - 12} more</Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              Create Detection Alert
            </DialogTitle>
            <DialogDescription>
              Set up an alert to be notified when matching devices are detected.
            </DialogDescription>
          </DialogHeader>
          {alertItem && (
            <div className="space-y-3">
              <div className="p-3 rounded-md bg-muted/30 border border-border/50">
                <div className="text-sm font-medium mb-1">{alertItem}</div>
                {alertSig && (
                  <>
                    <p className="text-[10px] text-muted-foreground mb-2">{alertSig.description}</p>
                    <div className="flex items-center gap-1 mb-2 flex-wrap">
                      {alertSig.signalTypes.map(st => (
                        <Badge key={st} variant="secondary" className="text-[8px]">{st}</Badge>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Monitoring {alertSig.terms.length} known broadcast signatures
                    </div>
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                This alert will match detected nodes against {alertSig?.terms.length || 1} known broadcast name{(alertSig?.terms.length || 1) > 1 ? "s" : ""} for {alertItem} devices.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertDialogOpen(false)} data-testid="button-cancel-alert">
              Cancel
            </Button>
            <Button
              onClick={confirmCreateAlert}
              disabled={createAlertMutation.isPending}
              data-testid="button-confirm-alert"
            >
              {createAlertMutation.isPending ? "Creating..." : "Create Alert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
