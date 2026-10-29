"use client";

import { useEffect, useState } from "react";

import { initials } from "@/lib/user-agent";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
  xl: "size-24 text-3xl",
} as const;

/** Profile photo when there is one, otherwise (or if it fails to load) initials on the accent colour. */
export function UserAvatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const showPhoto = src && !broken;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-semibold text-accent-foreground",
        SIZES[size],
        className,
      )}
      aria-hidden
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by the CMS, already 256×256
        <img src={src} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
