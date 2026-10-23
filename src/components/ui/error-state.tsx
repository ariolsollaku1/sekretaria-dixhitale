import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-card border-danger/40 bg-danger-bg flex flex-col items-center gap-2 border p-8 text-center"
    >
      <AlertTriangle className="text-danger size-8" aria-hidden />
      <p className="text-danger text-lg font-semibold">{title}</p>
      {description && <p className="max-w-prose text-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
