"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "dialog-content fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/10",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("pr-8 text-lg font-semibold tracking-tight", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("-mt-2 text-sm text-muted-foreground", className)} {...props} />;
}
