"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Menus open in a portal above the page, so a scrolling table or card can never clip them,
 * and Radix handles keyboard use, focus and closing on outside click.
 */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({ className, align = "end", sideOffset = 6, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "dialog-content z-50 min-w-48 overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-sm shadow-xl shadow-black/10",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, danger = false, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Item> & { danger?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        danger ? "text-danger data-[highlighted]:bg-danger-soft" : "data-[highlighted]:bg-surface-muted [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <Menu.Separator className={cn("-mx-1.5 my-1.5 h-px bg-border", className)} />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-3 py-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />;
}
