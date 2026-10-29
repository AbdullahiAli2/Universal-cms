import { FileText, PlayCircle } from "lucide-react";

import type { MediaAsset } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Square preview: the image itself, or an icon for documents and videos. */
export function MediaThumb({ asset, className }: { asset: MediaAsset; className?: string }) {
  if (asset.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- files come from the CMS, not the Next image optimiser
      <img
        src={asset.url}
        alt={asset.alt_text}
        loading="lazy"
        className={cn("size-full object-cover", className)}
        style={asset.focal_point ? { objectPosition: asset.focal_point } : undefined}
      />
    );
  }
  const Icon = asset.kind === "video" ? PlayCircle : FileText;
  return (
    <div className={cn("flex size-full flex-col items-center justify-center gap-1 bg-surface-muted p-2 text-muted-foreground", className)}>
      <Icon className="size-7" aria-hidden />
      <span className="text-[11px] font-medium uppercase tracking-wide">{asset.kind === "video" ? "Video" : "PDF"}</span>
    </div>
  );
}
