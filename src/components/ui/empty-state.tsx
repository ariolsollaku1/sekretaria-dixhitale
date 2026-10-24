import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  as: Heading = "h2",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Heading level of the title; standalone pages (404, no access) use h1. */
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className="rounded-card border-border bg-card flex flex-col items-center gap-2 border border-dashed p-8 text-center">
      {Icon && (
        <span className="bg-accent text-brand grid size-12 place-items-center rounded-2xl">
          <Icon className="size-6" aria-hidden />
        </span>
      )}
      <Heading className="text-lg font-semibold">{title}</Heading>
      {description && <p className="text-muted-foreground max-w-prose text-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
