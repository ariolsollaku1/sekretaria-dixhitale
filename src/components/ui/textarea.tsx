import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "rounded-control border-input bg-card placeholder:text-muted-foreground aria-invalid:border-danger min-h-24 w-full border px-3 py-2 text-sm disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
