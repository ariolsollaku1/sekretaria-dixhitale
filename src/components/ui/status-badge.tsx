import { AlertTriangle, CheckCircle2, Circle, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

// design-system.md: status is never color alone, so every tone carries an icon and a label.
const TONES: Record<StatusTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle2, className: "bg-success-bg text-success" },
  warning: { icon: AlertTriangle, className: "bg-warning-bg text-warning" },
  danger: { icon: XCircle, className: "bg-danger-bg text-danger" },
  info: { icon: Info, className: "bg-info-bg text-info" },
  neutral: { icon: Circle, className: "bg-muted text-muted-foreground" },
};

export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold",
        toneClass,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
