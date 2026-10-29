import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { controlClass } from "./input";

/** Native select (keyboard and screen-reader friendly) with the shared field look and a custom arrow. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    // A width given by the caller (e.g. "w-32") sizes the control; otherwise it fills its column.
    <div className={/(^|\s)w-/.test(className ?? "") ? "relative inline-block" : "relative w-full"}>
      <select ref={ref} className={cn(controlClass, "h-10 cursor-pointer appearance-none pr-9 pl-3", className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);
Select.displayName = "Select";
