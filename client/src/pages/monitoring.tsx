import { useQuery } from "@tanstack/react-query";
import { MonitoringPanel } from "@/components/monitoring-panel";
import type { Alert, Device } from "@shared/schema";

interface AlertHit {
  alert: Alert;
  matchedDevices: Device[];
}

interface AlertHitsResponse {
  hits: AlertHit[];
  totalHits: number;
}

export default function MonitoringPage() {
  const { data: alerts = [] } = useQuery<Alert[]>({ queryKey: ["/api/alerts"] });
  const { data: alertHits } = useQuery<AlertHitsResponse>({
    queryKey: ["/api/alerts", "hits"],
    refetchInterval: 10000,
  });

  return (
    <div className="flex flex-col h-full p-3">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Monitoring & Alerts</h2>
      </div>
      <div className="flex-1 min-h-0">
        <MonitoringPanel alerts={alerts} alertHits={alertHits} />
      </div>
    </div>
  );
}
