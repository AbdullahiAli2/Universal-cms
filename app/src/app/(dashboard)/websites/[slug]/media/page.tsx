"use client";

import { ChevronDown, Copy, ExternalLink, LayoutGrid, Link2, List, Loader2, MoreHorizontal, Search, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { MediaThumb } from "@/components/media/media-thumb";
import { UploadButton } from "@/components/media/upload-button";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useAddVideo, useDeleteMedia, useMedia, useMediaItem, useUpdateMedia, useUploadMedia, useWebsite, type MediaSort } from "@/lib/queries";
import { can, type MediaAsset, type MediaKind } from "@/lib/types";
import { cn, formatBytes, timeAgo } from "@/lib/utils";

const TABS: { value: MediaKind | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "image", label: "Images" },
  { value: "document", label: "Documents" },
  { value: "video", label: "Videos" },
];
const PAGE_SIZE = 48;
const SORTS: { value: MediaSort; label: string }[] = [
  { value: "recent", label: "Most recent updates" },
  { value: "newest", label: "Newest uploads" },
  { value: "oldest", label: "Oldest uploads" },
  { value: "name", label: "Name A–Z" },
  { value: "-name", label: "Name Z–A" },
  { value: "size", label: "Largest first" },
];
const VIEW_KEY = "cms.media.view";
const KIND_LABELS: Record<MediaKind, string> = { image: "Image", document: "PDF", video: "Video link" };

function shortDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
}

export default function MediaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: website } = useWebsite(slug);
  const canUpload = can(website, "media.upload");

  const [kind, setKind] = useState<MediaKind | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sort, setSort] = useState<MediaSort>("recent");
  const [view, setView] = useState<"table" | "grid">("table");
  const upload = useUploadMedia(slug);

  // Remember the chosen view in this browser.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "grid" || saved === "table") setView(saved);
    } catch {}
  }, []);
  function chooseView(next: "table" | "grid") {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {}
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, error, isFetching } = useMedia(slug, { kind, search, page, sort });

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!canUpload) return;
    const files = Array.from(event.dataTransfer.files);
    let ok = 0;
    for (const file of files) {
      try {
        await upload.mutateAsync({ file });
        ok += 1;
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "upload failed."}`);
      }
    }
    if (ok) toast.success(ok === 1 ? "File uploaded." : `${ok} files uploaded.`);
  }

  return (
    <div
      onDragOver={(event) => {
        if (!canUpload) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={onDrop}
      className="relative"
    >
      <PageHeader
        title={`Media library${data?.totals ? ` (${data.totals.all} items)` : ""}`}
        description={`Images, PDFs and video links for this website${data?.totals ? ` · ${formatBytes(data.totals.bytes)} stored` : ""}. Drag files anywhere on this page to upload.`}
        actions={canUpload ? <NewMenu slug={slug} onVideo={() => setVideoOpen(true)} /> : null}
      />

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent-soft/80">
          <p className="flex items-center gap-2 font-medium text-accent">
            <Upload className="size-5" /> Drop to upload
          </p>
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div role="tablist" aria-label="Filter by type" className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => {
            const count = data?.totals ? (tab.value ? data.totals[tab.value] : data.totals.all) : undefined;
            const active = kind === tab.value;
            return (
              <button
                key={tab.label}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setKind(tab.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-accent-soft font-medium text-accent" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                )}
              >
                {tab.label}
                {count !== undefined ? <span className="ml-1.5 text-xs tabular-nums opacity-70">{count}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-56">
            <Input
              icon={Search}
              type="search"
              placeholder="Search by name, alt text or caption"
              aria-label="Search media"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <Select aria-label="Sort" value={sort} onChange={(event) => { setSort(event.target.value as MediaSort); setPage(1); }} className="w-48">
            {SORTS.map((item) => (
              <option key={item.value} value={item.value}>
                Sort: {item.label}
              </option>
            ))}
          </Select>
          <div role="radiogroup" aria-label="View" className="flex rounded-lg border border-border bg-surface p-0.5 shadow-xs">
            {([
              ["table", List, "Table view"],
              ["grid", LayoutGrid, "Grid view"],
            ] as const).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={view === value}
                onClick={() => chooseView(value)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
                  view === value ? "bg-accent-soft font-medium text-accent" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {error.message}
        </p>
      ) : null}
      {isLoading ? <div className="h-48 animate-pulse rounded-lg border border-border bg-surface" aria-busy="true" /> : null}

      {data && data.results.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 border-dashed py-14 text-center">
          <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Upload className="size-5" aria-hidden />
          </span>
          <CardTitle className="text-base">{search || kind ? "Nothing matches" : "No media yet"}</CardTitle>
          <CardDescription className="max-w-sm">
            {search || kind
              ? "Try another type or search."
              : canUpload
                ? "Drag files here, or upload logos, photos and PDFs to use in articles, events and publications."
                : "Nothing has been uploaded yet."}
          </CardDescription>
          {!search && !kind && canUpload ? (
            <div className="mt-3">
              <UploadButton slug={slug} />
            </div>
          ) : null}
        </Card>
      ) : null}

      {data && data.results.length > 0 ? (
        <>
          {view === "grid" ? (
            <ul className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6", isFetching && "opacity-70")}>
              {data.results.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(asset.id)}
                    className="group block w-full overflow-hidden rounded-xl border border-border bg-surface text-left transition-[border-color,box-shadow] hover:border-accent/50 hover:shadow-md"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-surface-muted">
                      <MediaThumb asset={asset} className="transition-transform duration-300 group-hover:scale-[1.03]" />
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-sm font-medium">{asset.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {asset.kind === "video" ? "Video link" : formatBytes(asset.size)}
                        {asset.width ? ` · ${asset.width}×${asset.height}` : ""}
                      </p>
                      {asset.kind === "image" && !asset.alt_text ? <p className="text-xs text-warning">No alt text</p> : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Card className={cn("overflow-hidden", isFetching && "opacity-70")}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-surface-muted/50 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th scope="col" className="w-[45%] px-4 py-3">Name</th>
                      <th scope="col" className="px-4 py-3">Type</th>
                      <th scope="col" className="hidden px-4 py-3 md:table-cell">Creation date</th>
                      <th scope="col" className="hidden px-4 py-3 md:table-cell">Last modified</th>
                      <th scope="col" className="px-4 py-3">Size</th>
                      <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.results.map((asset) => (
                      <tr key={asset.id} className="cursor-pointer transition-colors hover:bg-surface-muted/40" onClick={() => setOpenId(asset.id)}>
                        <td className="max-w-0 px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="size-10 shrink-0 overflow-hidden rounded-md border border-border bg-surface-muted">
                              <MediaThumb asset={asset} />
                            </div>
                            <div className="min-w-0">
                              <button type="button" className="block max-w-full truncate text-left font-medium hover:text-accent" onClick={(event) => { event.stopPropagation(); setOpenId(asset.id); }}>
                                {asset.title}
                              </button>
                              <p className="truncate text-xs text-muted-foreground">
                                {asset.original_name || asset.embed_url}
                                {asset.kind === "image" && !asset.alt_text ? <span className="ml-2 text-warning">No alt text</span> : null}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                          {KIND_LABELS[asset.kind]}
                          {asset.width ? <span className="block text-xs">{asset.width}×{asset.height}</span> : null}
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-2.5 text-muted-foreground md:table-cell">{shortDate(asset.created_at)}</td>
                        <td className="hidden whitespace-nowrap px-4 py-2.5 text-muted-foreground md:table-cell">{shortDate(asset.updated_at)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{asset.kind === "video" ? "—" : formatBytes(asset.size)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button variant="ghost" size="icon" aria-label={`Open ${asset.title}`} onClick={(event) => { event.stopPropagation(); setOpenId(asset.id); }}>
                            <MoreHorizontal />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={setPage} noun="items" />
            </Card>
          )}
          {view === "grid" && data.count > PAGE_SIZE ? (
            <Card className="mt-4 overflow-hidden">
              <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={setPage} noun="items" />
            </Card>
          ) : null}
        </>
      ) : null}

      <MediaDetails slug={slug} id={openId} onClose={() => setOpenId(null)} />
      <AddVideoDialog slug={slug} open={videoOpen} onOpenChange={setVideoOpen} />
    </div>
  );
}

/** "New" menu, as in the reference: upload files, or add a YouTube/Vimeo link. */
function NewMenu({ slug, onVideo }: { slug: string; onVideo: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inputId = `media-upload-${slug}`;

  useEffect(() => {
    if (!open) return;
    const close = (event: globalThis.MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <UploadButton slug={slug} inputId={inputId} hideButton />
      <Button onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
        New <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      {open ? (
        <div role="menu" className="dialog-content absolute right-0 top-12 z-30 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-xl shadow-black/10">
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"
            onClick={() => {
              setOpen(false);
              document.getElementById(inputId)?.click();
            }}
          >
            <Upload className="size-4 text-muted-foreground" /> File upload
          </button>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"
            onClick={() => {
              setOpen(false);
              onVideo();
            }}
          >
            <Link2 className="size-4 text-muted-foreground" /> Video link (YouTube or Vimeo)
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface DetailValues {
  title: string;
  alt_text: string;
  caption: string;
  credit: string;
  focal_point: string;
}

function MediaDetails({ slug, id, onClose }: { slug: string; id: number | null; onClose: () => void }) {
  const { data: asset } = useMediaItem(slug, id);
  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        {asset ? (
          <DetailBody key={`${asset.id}-${asset.updated_at}`} slug={slug} asset={asset} onClose={onClose} />
        ) : (
          <>
            <DialogTitle>Loading…</DialogTitle>
            <DialogDescription className="sr-only">Loading file details</DialogDescription>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({
  slug,
  asset,
  onClose,
}: {
  slug: string;
  asset: MediaAsset & { used_in: { kind: string; id: number | null; type: string; title: string }[] };
  onClose: () => void;
}) {
  const update = useUpdateMedia(slug, asset.id);
  const remove = useDeleteMedia(slug, asset.id);
  const [confirming, setConfirming] = useState(false);
  const form = useForm<DetailValues>({
    defaultValues: { title: asset.title, alt_text: asset.alt_text, caption: asset.caption, credit: asset.credit, focal_point: asset.focal_point },
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const focal = form.watch("focal_point");
  const shareUrl = asset.kind === "video" ? asset.embed_url : asset.public_url;

  async function save(values: DetailValues) {
    try {
      await update.mutateAsync(values);
      toast.success("Saved.");
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [key, messages] of Object.entries(error.fields)) form.setError(key as keyof DetailValues, { message: messages[0] });
        if (!Object.keys(error.fields).length) toast.error(error.message);
      }
    }
  }

  async function destroy() {
    try {
      await remove.mutateAsync();
      toast.success(`Deleted “${asset.title}”.`);
      onClose();
    } catch (error) {
      setConfirming(false);
      toast.error(error instanceof Error ? error.message : "Could not delete it.");
    }
  }

  function pickFocus(event: MouseEvent<HTMLDivElement>) {
    if (!asset.can_change) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - box.left) / box.width) * 100);
    const y = Math.round(((event.clientY - box.top) / box.height) * 100);
    form.setValue("focal_point", `${x}% ${y}%`, { shouldDirty: true });
  }

  return (
    <>
      <DialogTitle className="pr-8">{asset.title}</DialogTitle>
      <DialogDescription>
        {asset.kind === "video" ? "Video link" : `${asset.mime_type} · ${formatBytes(asset.size)}`}
        {asset.width ? ` · ${asset.width}×${asset.height}px` : ""} · uploaded {timeAgo(asset.created_at)}
        {asset.uploaded_by_email ? ` by ${asset.uploaded_by_email}` : ""}
      </DialogDescription>

      <div className="grid max-h-[70vh] gap-6 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          {asset.kind === "image" ? (
            <div
              className={cn("relative overflow-hidden rounded-md border border-border bg-surface-muted", asset.can_change && "cursor-crosshair")}
              onClick={pickFocus}
              title={asset.can_change ? "Click the subject to set the focal point" : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.url} alt={asset.alt_text} className="block w-full" />
              {focal ? (
                <span
                  className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent/70 shadow"
                  style={{ left: focal.split(" ")[0], top: focal.split(" ")[1] }}
                  aria-hidden
                />
              ) : null}
            </div>
          ) : asset.kind === "video" ? (
            <iframe
              src={asset.embed_url}
              title={asset.title}
              className="aspect-video w-full rounded-md border border-border"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="aspect-[4/3] overflow-hidden rounded-md border border-border">
              <MediaThumb asset={asset} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {asset.kind !== "video" ? (
              <Button variant="outline" size="sm" asChild>
                <a href={asset.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Open
                </a>
              </Button>
            ) : null}
            {shareUrl ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    toast.success("Link copied.");
                  } catch {
                    toast.error("Could not copy.");
                  }
                }}
              >
                <Copy /> Copy link
              </Button>
            ) : null}
          </div>
          {asset.kind !== "video" && !asset.public_url ? (
            <p className="text-xs text-muted-foreground">A public link appears once your administrator sets CMS_PUBLIC_API_URL.</p>
          ) : null}
          <div>
            <p className="text-sm font-medium">Used in</p>
            {asset.used_in.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not used anywhere yet.</p>
            ) : (
              <ul className="mt-1 grid gap-1 text-sm">
                {asset.used_in.map((use, index) => (
                  <li key={index}>
                    {use.kind === "entry" ? (
                      <Link href={`/websites/${slug}/content/${use.type}/${use.id}`} className="text-accent hover:underline" onClick={onClose}>
                        {use.title}
                      </Link>
                    ) : (
                      <Link href={`/websites/${slug}/branding`} className="text-accent hover:underline" onClick={onClose}>
                        Branding: {use.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <form onSubmit={form.handleSubmit(save)} className="grid content-start gap-4">
          <fieldset disabled={!asset.can_change || isSubmitting} className="contents">
            <Field id="media-title" label="Name" error={errors.title?.message}>
              <Input placeholder="File name shown in the library" {...form.register("title")} />
            </Field>
            {asset.kind === "image" ? (
              <Field id="media-alt" label="Alt text" error={errors.alt_text?.message} hint="Describe the image for people who cannot see it. Also helps search.">
                <Textarea placeholder="e.g. Delegates at the security forum in Mogadishu" rows={2} {...form.register("alt_text")} />
              </Field>
            ) : null}
            <Field id="media-caption" label="Caption" error={errors.caption?.message}>
              <Textarea placeholder="Shown under the image on your website" rows={2} {...form.register("caption")} />
            </Field>
            <Field id="media-credit" label="Credit" error={errors.credit?.message} hint="Photographer or source.">
              <Input placeholder="e.g. Photo: Kaadir Institute" {...form.register("credit")} />
            </Field>
            {asset.kind === "image" ? (
              <Field id="media-focal" label="Focal point" error={errors.focal_point?.message} hint="Click the image to set it. Websites crop around this point.">
                <Input placeholder="50% 50%" {...form.register("focal_point")} />
              </Field>
            ) : null}
            {asset.can_change ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {confirming ? (
                  <span className="flex items-center gap-2">
                    <Button type="button" variant="destructive" size="sm" disabled={remove.isPending} onClick={destroy}>
                      {remove.isPending ? <Loader2 className="animate-spin" /> : null}
                      Delete for good
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={() => setConfirming(true)}>
                    <Trash2 /> Delete
                  </Button>
                )}
                <Button type="submit" disabled={!isDirty || isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                  Save
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Only the uploader or an editor can change this file.</p>
            )}
          </fieldset>
        </form>
      </div>
    </>
  );
}

function AddVideoDialog({ slug, open, onOpenChange }: { slug: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const add = useAddVideo(slug);
  const form = useForm<{ embed_url: string; title: string }>({ defaultValues: { embed_url: "", title: "" } });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: { embed_url: string; title: string }) {
    try {
      await add.mutateAsync(values);
      toast.success("Video added.");
      form.reset();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [key, messages] of Object.entries(error.fields)) form.setError(key as "embed_url" | "title", { message: messages[0] });
        if (!Object.keys(error.fields).length) toast.error(error.message);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Add a video link</DialogTitle>
        <DialogDescription>Paste a YouTube or Vimeo link. Videos stay on those services; only the link is stored.</DialogDescription>
        <form onSubmit={form.handleSubmit(submit)} className="grid gap-4">
          <Field id="video-url" label="Video link" error={errors.embed_url?.message}>
            <Input type="url" placeholder="https://www.youtube.com/watch?v=…" {...form.register("embed_url", { required: "Paste a link." })} />
          </Field>
          <Field id="video-title" label="Name" error={errors.title?.message}>
            <Input placeholder="e.g. Forum highlights 2026" {...form.register("title", { required: "Give the video a name." })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Add video
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
