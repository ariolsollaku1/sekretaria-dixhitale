import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Aurora card (ADR-0013): white surface, soft ring, no heavy border. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-card bg-card ring-border p-5 shadow-sm ring-1", className)}
      {...props}
    />
  );
}

/** Card title with an accent icon tile; `id` ties it to the card via aria-labelledby. */
export function CardTitle({
  id,
  icon: Icon,
  className,
  children,
}: {
  id?: string;
  className?: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className={cn("mb-4 flex items-center gap-3 text-lg font-semibold", className)}>
      {Icon && (
        <span className="bg-accent text-brand grid size-9 place-items-center rounded-xl">
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      {children}
    </h2>
  );
}

/** Label/value pairs; entries without a value are left out (hidden or not applicable). */
export function InfoList({
  items,
  className,
}: {
  items: { label: string; value: ReactNode; icon?: LucideIcon }[];
  className?: string;
}) {
  const shown = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== "");
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {shown.map(({ label, value, icon: Icon }) => (
        // <dl> may only contain <div>s that directly hold <dt>/<dd> (axe: definition-list).
        <div key={label} className="min-w-0">
          <dt className="text-muted-foreground flex items-center gap-1.5 text-[13px]">
            {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
            {label}
          </dt>
          <dd className="font-semibold break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
