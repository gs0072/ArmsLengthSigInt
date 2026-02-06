import { useState, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, ChevronDown, ChevronRight, BookOpen, Bell, Radio, Info, Upload, Trash2, ExternalLink, Loader2, Radar } from "lucide-react";
import { DEVICE_CATEGORIES, DEVICE_BROADCAST_SIGNATURES, type BroadcastSignature } from "@/lib/signal-utils";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Device, CustomSignature } from "@shared/schema";

interface DeviceCatalogBrowserProps {
  onSearchDevice?: (term: string, signature?: BroadcastSignature) => void;
}

export function DeviceCatalogBrowser({ onSearchDevice }: DeviceCatalogBrowserProps) {
  const [search, setSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertItem, setAlertItem] = useState<string | null>(null);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvCategory, setCsvCategory] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: customSignatures = [] } = useQuery<CustomSignature[]>({
    queryKey: ["/api/custom-signatures"],
  });

  const { data: signatureMatches = [], isLoading: matchesLoading } = useQuery<Device[]>({
    queryKey: ["/api/devices", "search-signature", selectedItem],
    queryFn: async () => {
      if (!selectedItem) return [];
      const sig = DEVICE_BROADCAST_SIGNATURES[selectedItem] || getCustomSig(selectedItem);
      if (!sig) return [];
      const terms = sig.terms.join("|");
      const res = await fetch(`/api/devices/search-signature?terms=${encodeURIComponent(terms)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedItem,
  });

  const getCustomSig = (name: string): BroadcastSignature | undefined => {
    const cs = customSignatures.find(s => s.name === name);
    if (!cs) return undefined;
    return { terms: cs.terms || [], signalTypes: cs.signalTypes || [], description: cs.description || "" };
  };

  const customCategories = Array.from(new Set(customSignatures.map(s => s.category))).map(cat => ({
    category: `${cat} (Custom)`,
    rawCategory: cat,
    items: customSignatures.filter(s => s.category === cat).map(s => s.name),
    isCustom: true,
  }));

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
    isCustom: false,
    rawCategory: cat.category,
    items: [...cat.items].filter(item =>
      !search || item.toLowerCase().includes(search.toLowerCase()) ||
      cat.category.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat => cat.items.length > 0);

  const filteredCustomCategories = customCategories.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      !search || item.toLowerCase().includes(search.toLowerCase()) ||
      cat.category.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat => cat.items.length > 0);

  const allCategories = [...filteredCategories, ...filteredCustomCategories];

  const handleItemClick = (item: string) => {
    const sig = DEVICE_BROADCAST_SIGNATURES[item] || getCustomSig(item);
    setSelectedItem(selectedItem === item ? null : item);
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

  const importCsvMutation = useMutation({
    mutationFn: async (data: { category: string; csvData: string }) => {
      const res = await apiRequest("POST", "/api/custom-signatures/import-csv", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-signatures"] });
      toast({ title: "Signatures Imported", description: `${data.imported} signatures added to "${csvCategory}".` });
      setCsvDialogOpen(false);
      setCsvCategory("");
      setCsvContent("");
    },
    onError: () => {
      toast({ title: "Import Failed", description: "Check your CSV format and try again.", variant: "destructive" });
    },
  });

  const deleteCustomCategoryMutation = useMutation({
    mutationFn: async (category: string) => {
      const res = await apiRequest("DELETE", `/api/custom-signatures/category/${encodeURIComponent(category)}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-signatures"] });
      toast({ title: "Category Removed", description: "Custom signature category deleted." });
    },
  });

  const handleCreateAlert = (item: string) => {
    setAlertItem(item);
    setAlertDialogOpen(true);
  };

  const confirmCreateAlert = () => {
    if (!alertItem) return;
    const sig = DEVICE_BROADCAST_SIGNATURES[alertItem] || getCustomSig(alertItem);
    createAlertMutation.mutate({
      name: alertItem,
      terms: sig?.terms || [alertItem],
      signalTypes: sig?.signalTypes || ["bluetooth"],
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvContent(ev.target?.result as string || "");
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const alertSig = alertItem ? (DEVICE_BROADCAST_SIGNATURES[alertItem] || getCustomSig(alertItem)) : null;

  return (
    <>
      <Card className="flex flex-col h-full overflow-visible">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 px-3 pt-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Device Catalog</h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCsvDialogOpen(true)}
            data-testid="button-import-signatures"
          >
            <Upload className="w-3.5 h-3.5 mr-1" />
            Import CSV
          </Button>
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
              {allCategories.map(cat => (
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
                    <div className="flex items-center gap-1">
                      {cat.isCustom && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCustomCategoryMutation.mutate(cat.rawCategory);
                          }}
                          data-testid={`button-delete-category-${cat.rawCategory}`}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      )}
                      <Badge variant="secondary" className="text-[9px]">{cat.items.length}</Badge>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-6 space-y-0.5 mb-1">
                      {cat.items.map(item => {
                        const sig = DEVICE_BROADCAST_SIGNATURES[item] || getCustomSig(item);
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
                                  onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}
                                  data-testid={`button-search-${item.toLowerCase().replace(/\s/g, "-")}`}
                                >
                                  <Search className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => { e.stopPropagation(); handleCreateAlert(item); }}
                                  data-testid={`button-alert-${item.toLowerCase().replace(/\s/g, "-")}`}
                                >
                                  <Bell className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            {isSelected && sig && (
                              <div className="ml-2 p-2 rounded-md bg-muted/30 border border-border/30 mb-1 space-y-2">
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

                                <div className="border-t border-border/30 pt-2 mt-2">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <Radar className="w-3 h-3 text-primary" />
                                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                                      Node Matches
                                    </span>
                                    {matchesLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                                    {!matchesLoading && (
                                      <Badge variant={signatureMatches.length > 0 ? "default" : "secondary"} className="text-[8px]">
                                        {signatureMatches.length}
                                      </Badge>
                                    )}
                                  </div>

                                  {!matchesLoading && signatureMatches.length > 0 && (
                                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                      {signatureMatches.slice(0, 20).map(device => (
                                        <div
                                          key={device.id}
                                          className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-background/50 border border-border/20 cursor-pointer hover-elevate"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setLocation(`/node-report/${device.id}`);
                                          }}
                                          data-testid={`match-device-${device.id}`}
                                        >
                                          <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-medium truncate">{device.name || device.macAddress}</p>
                                            <p className="text-[8px] text-muted-foreground truncate">
                                              {device.manufacturer || "Unknown"} | {device.macAddress || "N/A"}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <Badge variant="outline" className="text-[7px]">{device.signalType}</Badge>
                                            <ExternalLink className="w-2.5 h-2.5 text-muted-foreground" />
                                          </div>
                                        </div>
                                      ))}
                                      {signatureMatches.length > 20 && (
                                        <p className="text-[9px] text-muted-foreground text-center">
                                          +{signatureMatches.length - 20} more matches
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {!matchesLoading && signatureMatches.length === 0 && (
                                    <p className="text-[9px] text-muted-foreground italic">
                                      No matching nodes found in collection
                                    </p>
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

      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              Import Custom Signatures
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to add custom device signatures to a new category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Category Name</label>
              <Input
                placeholder="e.g., Custom Radios, Lab Equipment..."
                value={csvCategory}
                onChange={e => setCsvCategory(e.target.value)}
                className="text-xs"
                data-testid="input-csv-category"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">CSV File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-choose-csv-file"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {csvContent ? "File loaded" : "Choose CSV file"}
              </Button>
            </div>
            {csvContent && (
              <div className="p-2 rounded-md bg-muted/30 border border-border/30 max-h-[120px] overflow-y-auto">
                <pre className="text-[9px] font-mono text-muted-foreground whitespace-pre-wrap">{csvContent.slice(0, 500)}</pre>
              </div>
            )}
            <div className="p-2 rounded-md bg-muted/20 border border-border/30">
              <p className="text-[10px] font-medium mb-1">CSV Format</p>
              <p className="text-[9px] text-muted-foreground font-mono">name,terms,signalTypes,description</p>
              <p className="text-[9px] text-muted-foreground font-mono">My Device,term1|term2|term3,bluetooth|wifi,Description text</p>
              <p className="text-[9px] text-muted-foreground mt-1">Use | to separate multiple terms and signal types.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCsvDialogOpen(false); setCsvContent(""); setCsvCategory(""); }} data-testid="button-cancel-csv">
              Cancel
            </Button>
            <Button
              onClick={() => importCsvMutation.mutate({ category: csvCategory, csvData: csvContent })}
              disabled={!csvCategory || !csvContent || importCsvMutation.isPending}
              data-testid="button-confirm-csv-import"
            >
              {importCsvMutation.isPending ? "Importing..." : "Import Signatures"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
