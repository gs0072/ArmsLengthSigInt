import { useState } from "react";
import { DeviceCatalogBrowser } from "@/components/device-catalog-browser";
import { useLocation } from "wouter";
import type { BroadcastSignature } from "@/lib/signal-utils";

export default function CatalogPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="flex flex-col h-full p-3">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Device Catalog</h2>
      </div>
      <div className="flex-1 min-h-0">
        <DeviceCatalogBrowser
          onSearchDevice={(term, signature) => {
            if (signature) {
              const termsParam = encodeURIComponent(signature.terms.join("|"));
              const signalParam = signature.signalTypes.length === 1 ? `&signal=${signature.signalTypes[0]}` : "";
              setLocation(`/search?catalog=${encodeURIComponent(term)}&terms=${termsParam}${signalParam}`);
            } else {
              setLocation(`/search?q=${encodeURIComponent(term)}`);
            }
          }}
        />
      </div>
    </div>
  );
}
