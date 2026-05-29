import { BarChart3, Inbox, Send, Users } from "lucide-react";

import { DashboardDialog } from "@/components/dashboard-dialog";
import { KpiCard, type KpiCardProps } from "@/components/kpi-card";

const KPIS: KpiCardProps[] = [
  { title: "Scheduled posts", value: "—", hint: "Awaiting data", icon: Send },
  { title: "Unread inbox", value: "—", hint: "Awaiting data", icon: Inbox },
  { title: "Engagement", value: "—", hint: "Awaiting data", icon: BarChart3 },
  { title: "Contacts", value: "—", hint: "Awaiting data", icon: Users }
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your local-first social command center.</p>
        </div>
        <DashboardDialog />
      </div>
      <section
        aria-label="Key performance indicators"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {KPIS.map((kpi) => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </section>
    </div>
  );
}
