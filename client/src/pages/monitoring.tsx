import { useQuery } from "@tanstack/react-query";
import { MonitoringPanel } from "@/components/monitoring-panel";
import type { Alert } from "@shared/schema";

export default function MonitoringPage() {
  const { data: alerts = [] } = useQuery<Alert[]>({ queryKey: ["/api/alerts"] });

  return (
    <div className="flex flex-col h-full p-3">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Monitoring & Alerts</h2>
      </div>
      <div className="flex-1 min-h-0">
        <MonitoringPanel alerts={alerts} />
      </div>
    </div>
  );
}
