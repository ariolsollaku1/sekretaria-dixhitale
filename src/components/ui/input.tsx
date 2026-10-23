import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "rounded-control border-input bg-card placeholder:text-muted-foreground aria-invalid:border-danger min-h-11 w-full border px-3 text-sm disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
