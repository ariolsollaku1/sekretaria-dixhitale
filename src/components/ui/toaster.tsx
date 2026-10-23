"use client";
import { Toaster as Sonner, toast } from "sonner";

// Toast = confirmation of a finished action; anything the user must act on is an inline alert.
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{ classNames: { toast: "!rounded-card !border-border !text-foreground" } }}
    />
  );
}

export { toast };
