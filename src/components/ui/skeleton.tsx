import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Loading placeholder; decorative, so hidden from assistive tech. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("rounded-control bg-muted animate-pulse", className)}
      {...props}
    />
  );
}
