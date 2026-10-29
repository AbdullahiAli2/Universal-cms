"use client";

import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAvatar } from "@/lib/queries";
import type { CurrentUser } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/** Opens the file picker and uploads the chosen photo. */
export function useAvatarPicker() {
  const input = useRef<HTMLInputElement>(null);
  const { upload, remove } = useAvatar();

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success("Profile photo updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the photo.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const field = (
    <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => onPick(event.target.files)} />
  );
  return { field, open: () => input.current?.click(), upload, remove };
}

/** Avatar with a camera button on hover, for the profile header. */
export function AvatarWithCamera({ me, className }: { me: CurrentUser; className?: string }) {
  const picker = useAvatarPicker();
  const busy = picker.upload.isPending;
  return (
    <div className={cn("group relative", className)}>
      {picker.field}
      <UserAvatar name={me.full_name || me.email} src={me.avatar_url} size="xl" className="ring-4 ring-surface shadow-md" />
      <button
        type="button"
        onClick={picker.open}
        disabled={busy}
        aria-label="Change profile photo"
        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-100"
      >
        {busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
      </button>
    </div>
  );
}

/** The profile photo panel: preview, upload and remove. */
export function AvatarEditor({ me }: { me: CurrentUser }) {
  const picker = useAvatarPicker();
  const { upload, remove } = picker;

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface-muted/30 px-5 py-6 text-center">
      {picker.field}
      <button type="button" onClick={picker.open} className="rounded-full focus-visible:outline-offset-4" aria-label="Choose a new profile photo">
        <UserAvatar name={me.full_name || me.email} src={me.avatar_url} size="xl" className="ring-4 ring-surface shadow-md" />
      </button>
      <div>
        <p className="text-sm font-semibold">Profile photo</p>
        <p className="mt-0.5 text-xs text-muted-foreground">JPG, PNG, WebP or GIF, up to 5 MB. Cropped to a square.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" size="sm" onClick={picker.open} disabled={upload.isPending}>
          {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
          {me.avatar_url ? "Change photo" : "Upload photo"}
        </Button>
        {me.avatar_url ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-danger hover:bg-danger-soft"
            disabled={remove.isPending}
            onClick={async () => {
              try {
                await remove.mutateAsync();
                toast.success("Profile photo removed.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not remove it.");
              }
            }}
          >
            <Trash2 /> Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
