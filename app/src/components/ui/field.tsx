import { CircleAlert } from "lucide-react";
import * as React from "react";

import { Label } from "./label";

/** Label, control and message in one block. Errors are announced to screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {React.Children.map(children, (child) =>
        React.isValidElement<Record<string, unknown>>(child)
          ? React.cloneElement(child, {
              id,
              "aria-invalid": error ? true : undefined,
              "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
            })
          : child,
      )}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-1 text-xs font-medium text-danger">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
