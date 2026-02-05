import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, ChevronDown, ChevronRight, BookOpen, Plus } from "lucide-react";
import { DEVICE_CATEGORIES } from "@/lib/signal-utils";

interface DeviceCatalogBrowserProps {
  onSearchDevice?: (term: string) => void;
}

export function DeviceCatalogBrowser({ onSearchDevice }: DeviceCatalogBrowserProps) {
  const [search, setSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

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

  return (
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
                <CollapsibleTrigger className="w-full flex items-center justify-between p-2 rounded-md hover-elevate text-xs">
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
                    {cat.items.map(item => (
                      <button
                        key={item}
                        className="w-full text-left p-1.5 rounded-md text-xs text-muted-foreground hover-elevate flex items-center justify-between gap-2"
                        onClick={() => onSearchDevice?.(item)}
                        data-testid={`button-catalog-${item.toLowerCase().replace(/\s/g, "-")}`}
                      >
                        <span>{item}</span>
                        <Search className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
