import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Native select: keyboard and screen-reader support for free; styled like Input. */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "rounded-control border-input bg-card aria-invalid:border-danger min-h-11 w-full border px-2 text-sm disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
