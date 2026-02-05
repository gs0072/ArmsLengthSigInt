import { useState } from "react";
import { DeviceCatalogBrowser } from "@/components/device-catalog-browser";
import { useLocation } from "wouter";

export default function CatalogPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="flex flex-col h-full p-3">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Device Catalog</h2>
      </div>
      <div className="flex-1 min-h-0">
        <DeviceCatalogBrowser
          onSearchDevice={(term) => {
            setLocation(`/search?q=${encodeURIComponent(term)}`);
          }}
        />
      </div>
    </div>
  );
}
