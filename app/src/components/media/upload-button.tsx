"use client";

import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useUploadMedia } from "@/lib/queries";
import type { MediaAsset, MediaKind } from "@/lib/types";

const ACCEPT: Record<"image" | "document" | "any", string> = {
  image: "image/jpeg,image/png,image/webp,image/gif",
  document: "application/pdf",
  any: "image/jpeg,image/png,image/webp,image/gif,application/pdf",
};

/** Uploads one or more files in turn and reports each result. */
export function UploadButton({
  slug,
  kind = "any",
  multiple = true,
  onUploaded,
  variant = "default",
  inputId,
  hideButton = false,
}: {
  slug: string;
  kind?: Exclude<MediaKind, "video"> | "any";
  multiple?: boolean;
  onUploaded?: (asset: MediaAsset) => void;
  variant?: "default" | "outline";
  /** Lets another control (such as a menu item) open the file picker. */
  inputId?: string;
  hideButton?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadMedia(slug);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function send(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setProgress({ done: 0, total: list.length });
    let ok = 0;
    for (const [index, file] of list.entries()) {
      try {
        const asset = await upload.mutateAsync({ file });
        ok += 1;
        onUploaded?.(asset);
      } catch (error) {
        toast.error(`${file.name}: ${error instanceof Error ? error.message : "upload failed."}`);
      }
      setProgress({ done: index + 1, total: list.length });
    }
    setProgress(null);
    if (input.current) input.current.value = "";
    if (ok > 0) toast.success(ok === 1 ? "File uploaded." : `${ok} files uploaded.`);
  }

  return (
    <>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={ACCEPT[kind]}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => send(event.target.files)}
      />
      {hideButton && progress === null ? null : (
        <Button type="button" variant={variant} disabled={progress !== null} onClick={() => input.current?.click()}>
          {progress ? <Loader2 className="animate-spin" /> : <Upload />}
          {progress ? `Uploading ${progress.done + 1 > progress.total ? progress.total : progress.done + 1} of ${progress.total}…` : kind === "document" ? "Upload PDF" : kind === "image" ? "Upload image" : "Upload files"}
        </Button>
      )}
    </>
  );
}
