import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-border-strong bg-surface-raised">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div className="panel relative overflow-hidden p-5">
      {accent ? <div className="glow-top pointer-events-none absolute inset-0" /> : null}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-raised">
          <Icon className={accent ? "size-4 text-primary" : "size-4 text-muted-foreground"} />
        </div>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "border-border-strong bg-muted text-muted-foreground",
    processing: "border-info/40 bg-info/10 text-info",
    rendering: "border-info/40 bg-info/10 text-info",
    encoding: "border-info/40 bg-info/10 text-info",
    uploading: "border-info/40 bg-info/10 text-info",
    completed: "border-success/40 bg-success/10 text-success",
    failed: "border-destructive/40 bg-destructive/10 text-destructive",
    active: "border-primary/40 bg-primary/10 text-primary",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${
        map[status.toLowerCase()] ?? "border-border bg-muted text-muted-foreground"
      }`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
