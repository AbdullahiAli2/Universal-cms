"use client";

import { Check, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { MediaThumb } from "@/components/media/media-thumb";
import { UploadButton } from "@/components/media/upload-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMedia, useMediaByIds } from "@/lib/queries";
import type { MediaAsset } from "@/lib/types";
import { cn } from "@/lib/utils";

type PickKind = "image" | "document";

/** Choose files from the website's library, or upload new ones on the spot. */
export function MediaPickerDialog({
  slug,
  kind,
  multiple,
  selected,
  open,
  onOpenChange,
  onConfirm,
  canUpload,
}: {
  slug: string;
  kind: PickKind;
  multiple: boolean;
  selected: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (ids: number[]) => void;
  canUpload: boolean;
}) {
  const [picked, setPicked] = useState<number[]>(selected);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useMedia(slug, { kind, search });

  useEffect(() => {
    if (open) setPicked(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function toggle(asset: MediaAsset) {
    if (!multiple) {
      setPicked([asset.id]);
      return;
    }
    setPicked((current) => (current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id]));
  }

  const noun = kind === "image" ? "image" : "PDF";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>{multiple ? `Choose ${noun}s` : `Choose ${noun === "image" ? "an image" : "a PDF"}`}</DialogTitle>
        <DialogDescription>From this website&apos;s media library.</DialogDescription>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            icon={Search}
            type="search"
            placeholder="Search by name, alt text or caption"
            aria-label="Search media"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          {canUpload ? (
            <UploadButton
              slug={slug}
              kind={kind}
              multiple={multiple}
              variant="outline"
              onUploaded={(asset) => setPicked((current) => (multiple ? [...current, asset.id] : [asset.id]))}
            />
          ) : null}
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {data && data.results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search ? "Nothing matches." : `No ${noun}s yet.${canUpload ? " Upload one above." : ""}`}
            </p>
          ) : null}
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {data?.results.map((asset) => {
              const active = picked.includes(asset.id);
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => toggle(asset)}
                    aria-pressed={active}
                    className={cn(
                      "group relative block w-full overflow-hidden rounded-md border-2 text-left",
                      active ? "border-accent" : "border-transparent hover:border-border",
                    )}
                  >
                    <div className="aspect-square bg-surface-muted">
                      <MediaThumb asset={asset} />
                    </div>
                    <p className="truncate px-1 py-1 text-xs">{asset.title}</p>
                    {active ? (
                      <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
                        <Check className="size-3.5" />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{multiple ? `${picked.length} selected` : null}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onConfirm(picked);
                onOpenChange(false);
              }}
            >
              Use {multiple ? "selected" : noun}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A form control holding one file id (image/document) or a list of image ids (gallery). */
export function MediaField({
  slug,
  kind,
  multiple = false,
  value,
  onChange,
  disabled = false,
  canUpload,
}: {
  slug: string;
  kind: PickKind;
  multiple?: boolean;
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  canUpload: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: assets } = useMediaByIds(slug, value);
  const noun = kind === "image" ? (multiple ? "images" : "image") : "PDF";

  return (
    <div className="grid gap-2">
      {value.length > 0 ? (
        <ul className={cn("grid gap-2", multiple ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-1")}>
          {value.map((id) => {
            const asset = assets?.get(id);
            return (
              <li key={id} className="relative">
                {kind === "document" || !multiple ? (
                  <div className="flex items-center gap-3 rounded-md border border-border p-2">
                    <div className="size-14 shrink-0 overflow-hidden rounded bg-surface-muted">{asset ? <MediaThumb asset={asset} /> : null}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{asset?.title ?? "Loading…"}</p>
                      {asset?.kind === "image" && !asset.alt_text ? <p className="text-xs text-warning">No alt text yet</p> : null}
                    </div>
                    {!disabled ? (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${asset?.title ?? "file"}`} onClick={() => onChange([])}>
                        <X />
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="aspect-square overflow-hidden rounded-md border border-border bg-surface-muted">
                    {asset ? <MediaThumb asset={asset} /> : null}
                    {!disabled ? (
                      <button
                        type="button"
                        aria-label={`Remove ${asset?.title ?? "image"}`}
                        onClick={() => onChange(value.filter((item) => item !== id))}
                        className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {!disabled ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            {value.length > 0 ? (multiple ? `Add or remove ${noun}` : `Change ${noun}`) : `Choose ${noun}`}
          </Button>
        </div>
      ) : value.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : null}
      <MediaPickerDialog
        slug={slug}
        kind={kind}
        multiple={multiple}
        selected={value}
        open={open}
        onOpenChange={setOpen}
        onConfirm={onChange}
        canUpload={canUpload}
      />
    </div>
  );
}
