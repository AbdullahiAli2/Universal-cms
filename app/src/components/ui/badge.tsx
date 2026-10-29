import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", {
  variants: {
    variant: {
      default: "bg-surface-muted text-muted-foreground ring-border",
      accent: "bg-accent-soft text-accent ring-accent/15",
      success: "bg-success-soft text-success ring-success/15",
      warning: "bg-warning-soft text-warning ring-warning/20",
      danger: "bg-danger-soft text-danger ring-danger/15",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
