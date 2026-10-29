import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />

      <div className="relative mb-8 flex items-center gap-2.5 text-lg font-semibold">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-base font-bold text-accent-foreground shadow-sm">
          U
        </span>
        Universal CMS
      </div>

      <div className="relative flex w-full justify-center">{children}</div>

      <p className="relative mt-8 text-center text-xs text-muted-foreground">Self-hosted · Open source</p>
    </div>
  );
}
