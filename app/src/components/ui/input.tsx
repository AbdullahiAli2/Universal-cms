import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Shared look for every text-like control: inputs, selects and text areas. */
export const controlClass =
  "w-full rounded-lg border border-border bg-surface text-sm text-foreground shadow-xs transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 hover:border-muted-foreground/40 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/15 aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15 disabled:cursor-not-allowed disabled:bg-surface-muted/60 disabled:opacity-70";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional icon shown inside the field, before the text. */
  icon?: LucideIcon;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", icon: Icon, ...props }, ref) => {
    const input = (
      <input ref={ref} type={type} className={cn(controlClass, "h-10 px-3", Icon && "pl-10", className)} {...props} />
    );
    if (!Icon) return input;
    return (
      <div className="relative">
        <Icon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        {input}
      </div>
    );
  },
);
Input.displayName = "Input";
