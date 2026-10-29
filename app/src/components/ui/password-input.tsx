"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { controlClass } from "./input";

/** Password input with a lock icon, a show/hide toggle and a Caps Lock warning. */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(
  ({ className, id, onKeyDown, onKeyUp, onBlur, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const [capsLock, setCapsLock] = React.useState(false);

    function checkCapsLock(event: React.KeyboardEvent<HTMLInputElement>) {
      setCapsLock(event.getModifierState("CapsLock"));
    }

    return (
      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <Lock aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={ref}
            id={id}
            type={visible ? "text" : "password"}
            className={cn(
              controlClass,
              "h-10 pr-11 pl-10",
              className,
            )}
            onKeyDown={(event) => {
              checkCapsLock(event);
              onKeyDown?.(event);
            }}
            onKeyUp={(event) => {
              checkCapsLock(event);
              onKeyUp?.(event);
            }}
            onBlur={(event) => {
              setCapsLock(false);
              onBlur?.(event);
            }}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            aria-controls={id}
            className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {capsLock ? (
          <p className="text-xs font-medium text-warning" aria-live="polite">
            Caps Lock is on.
          </p>
        ) : null}
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
