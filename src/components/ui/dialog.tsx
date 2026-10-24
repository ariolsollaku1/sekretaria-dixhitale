"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

type ContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  closeLabel: string;
  /** "drawer" slides in from the left (mobile navigation); "center" is a modal dialog. */
  placement?: "center" | "drawer";
};

export function DialogContent({
  className,
  children,
  closeLabel,
  placement = "center",
  ...props
}: ContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="bg-foreground/40 fixed inset-0 z-40 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          "bg-popover text-popover-foreground fixed z-50 shadow-lg",
          placement === "center" &&
            "rounded-card border-border top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border p-6",
          placement === "drawer" &&
            "bg-sidebar-gradient text-sidebar-foreground inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="rounded-control hover:bg-accent absolute top-2 right-2 inline-flex size-11 items-center justify-center"
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
