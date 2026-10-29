"use client";

import { ArrowLeft, History, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { toast } from "sonner";

import { StatusBadge } from "@/components/content/status-badge";
import { MediaField } from "@/components/media/media-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { formatInZone, toZonedInput } from "@/lib/datetime";
import {
  queryKeys,
  useCreateEntry,
  useDeleteEntry,
  useRestoreRevision,
  useRevisions,
  useSeoSettings,
  useTransitionEntry,
  useUpdateEntry,
} from "@/lib/queries";
import { can, type ContentTypeInfo, type Entry, type EntryAction, type FieldDefinition, type Website } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

type FieldValue = string | boolean | number[];
interface SeoValues {
  title: string;
  description: string;
  image: number[];
  canonical_url: string;
  noindex: boolean;
}
interface EditorValues {
  title: string;
  slug: string;
  summary: string;
  body: string;
  data: Record<string, FieldValue>;
  seo: SeoValues;
}

const MEDIA_KINDS = { image: "image", document: "document", gallery: "image" } as const;
const isMediaField = (field: FieldDefinition): field is FieldDefinition & { type: keyof typeof MEDIA_KINDS } =>
  field.type in MEDIA_KINDS;

const ACTION_LABELS: Record<EntryAction, string> = {
  submit: "Submit for review",
  withdraw: "Move back to draft",
  publish: "Publish now",
  schedule: "Schedule…",
  unpublish: "Unpublish",
  archive: "Archive",
  restore: "Restore from archive",
};
// The main call to action first; the rest as secondary buttons.
const PRIMARY: EntryAction[] = ["publish", "submit", "restore"];

function valuesFrom(entry: Entry | undefined, fields: FieldDefinition[], timeZone: string): EditorValues {
  const data: Record<string, FieldValue> = {};
  for (const field of fields) {
    const raw = entry?.data[field.key];
    if (field.type === "boolean") data[field.key] = raw === true;
    else if (field.type === "gallery") data[field.key] = Array.isArray(raw) ? raw : [];
    else if (field.type === "image" || field.type === "document") data[field.key] = typeof raw === "number" ? [raw] : [];
    else if (field.type === "datetime") data[field.key] = typeof raw === "string" ? toZonedInput(raw, timeZone) : "";
    else data[field.key] = raw === undefined || raw === null ? "" : String(raw);
  }
  return {
    title: entry?.title ?? "",
    slug: entry?.slug ?? "",
    summary: entry?.summary ?? "",
    body: entry?.body ?? "",
    data,
    seo: {
      title: entry?.seo.title ?? "",
      description: entry?.seo.description ?? "",
      image: entry?.seo.image ? [entry.seo.image] : [],
      canonical_url: entry?.seo.canonical_url ?? "",
      noindex: entry?.seo.noindex === true,
    },
  };
}

/** Form values -> API payload. Empty values are left out; times are sent without a zone (read in the website's). */
function payloadFrom(values: EditorValues, fields: FieldDefinition[]) {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values.data[field.key];
    if (field.type === "boolean") data[field.key] = value === true;
    else if (field.type === "gallery") {
      if (Array.isArray(value) && value.length) data[field.key] = value;
    } else if (field.type === "image" || field.type === "document") {
      if (Array.isArray(value) && value.length) data[field.key] = value[0];
    } else if (field.type === "number") {
      if (value !== "" && value !== undefined) data[field.key] = Number(value);
    } else if (typeof value === "string" && value.trim() !== "") data[field.key] = value;
  }
  const seo: Record<string, unknown> = {};
  if (values.seo.title.trim()) seo.title = values.seo.title;
  if (values.seo.description.trim()) seo.description = values.seo.description;
  if (values.seo.image.length) seo.image = values.seo.image[0];
  if (values.seo.canonical_url.trim()) seo.canonical_url = values.seo.canonical_url;
  if (values.seo.noindex) seo.noindex = true;
  return { title: values.title, slug: values.slug, summary: values.summary, body: values.body, data, seo };
}

export function EntryEditor({
  website,
  contentType,
  entry,
  canCreate,
}: {
  website: Website;
  contentType: ContentTypeInfo;
  entry?: Entry;
  canCreate: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const slug = website.slug;
  const listHref = `/websites/${slug}/content/${contentType.key}`;
  const isNew = !entry;
  const editable = isNew ? canCreate : entry.can_edit;
  const fields = contentType.fields;

  const form = useForm<EditorValues>({ defaultValues: valuesFrom(entry, fields, website.timezone) });
  const { errors, isDirty, isSubmitting } = form.formState;

  const create = useCreateEntry(slug);
  const update = useUpdateEntry(slug, entry?.id ?? 0);
  const transition = useTransitionEntry(slug, entry?.id ?? 0);

  // Keep the form in step with the saved entry (after saving, a transition or a restore).
  useEffect(() => {
    form.reset(valuesFrom(entry, fields, website.timezone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.version]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  function showError(error: unknown) {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        // Reloading replaces the form with the latest saved version.
        const reload = () => entry && queryClient.invalidateQueries({ queryKey: queryKeys.entry(slug, entry.id) });
        toast.error(error.message, { action: { label: "Reload", onClick: reload }, duration: 10000 });
        return;
      }
      let placed = false;
      for (const [key, messages] of Object.entries(error.fields)) {
        if (["title", "slug", "summary", "body"].includes(key) || key.startsWith("data.") || key.startsWith("seo.")) {
          form.setError(key as keyof EditorValues, { message: messages[0] });
          placed = true;
        }
      }
      if (!placed) toast.error(error.message);
      return;
    }
    toast.error("Something went wrong. Try again.");
  }

  async function save(values: EditorValues) {
    if (!values.title.trim()) {
      form.setError("title", { message: "Give it a title." });
      return;
    }
    try {
      if (isNew) {
        const created = await create.mutateAsync({ type: contentType.key, ...payloadFrom(values, fields) });
        toast.success("Draft saved.");
        form.reset(values);
        router.replace(`${listHref}/${created.id}`);
      } else {
        await update.mutateAsync({ ...payloadFrom(values, fields), version: entry.version });
        toast.success("Changes saved.");
      }
    } catch (error) {
      showError(error);
    }
  }

  async function act(action: EntryAction, publishAt?: string) {
    if (!entry) return;
    try {
      const result = await transition.mutateAsync({ action, version: entry.version, publish_at: publishAt });
      toast.success(`${contentType.singular_name}: ${ACTION_LABELS[action].replace("…", "").toLowerCase()} done.`);
      return result;
    } catch (error) {
      showError(error);
    }
  }

  const busy = isSubmitting || transition.isPending;

  return (
    <>
      <Link href={listHref} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {contentType.name}
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isNew ? `New ${contentType.singular_name.toLowerCase()}` : entry.title}
        </h1>
        {entry ? <StatusBadge status={entry.status} /> : null}
      </div>

      <form onSubmit={form.handleSubmit(save)} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <fieldset disabled={!editable || busy} className="contents">
          <div className="grid min-w-0 content-start gap-6">
            <Card>
              <CardContent className="grid gap-5 pt-5">
                <Field id="title" label="Title" error={errors.title?.message}>
                  <Input placeholder="Give it a clear, specific title" className="h-11 text-base font-medium" {...form.register("title")} />
                </Field>
                <Field id="summary" label="Summary" error={errors.summary?.message} hint="One or two sentences. Shown in lists and previews.">
                  <Textarea placeholder="One or two sentences that sum it up" rows={2} {...form.register("summary")} />
                </Field>
                <Field id="body" label="Body" error={errors.body?.message}>
                  <Textarea placeholder="Write the full text here…" rows={10} className="min-h-56 leading-relaxed" {...form.register("body")} />
                </Field>
              </CardContent>
            </Card>

            {fields.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{contentType.singular_name} details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2">
                  {fields.map((field) => (
                    <DataField
                      key={field.key}
                      field={field}
                      error={(errors.data as Record<string, { message?: string }> | undefined)?.[field.key]?.message}
                      register={form.register}
                      control={form.control}
                      timeZone={website.timezone}
                      slug={slug}
                      disabled={!editable || busy}
                      canUpload={can(website, "media.upload")}
                    />
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <SeoCard
              website={website}
              control={form.control}
              register={form.register}
              errors={errors.seo as Record<string, { message?: string }> | undefined}
              watchTitle={form.watch("title")}
              watchSummary={form.watch("summary")}
              watchSeo={form.watch("seo")}
              entrySlug={form.watch("slug") || entry?.slug || ""}
              typeKey={contentType.key}
              disabled={!editable || busy}
              canUpload={can(website, "media.upload")}
            />
          </div>
        </fieldset>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Publishing</CardTitle>
              {!editable ? (
                <CardDescription>
                  {isNew
                    ? "Your role on this website does not allow creating content."
                    : entry.status === "draft"
                      ? "Only its author or an editor can change this entry."
                      : "Only editors can change an entry once it leaves draft."}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4">
              {entry ? <PublishingFacts entry={entry} timeZone={website.timezone} /> : null}

              {editable ? (
                <Button type="submit" disabled={busy || (!isNew && !isDirty)} className="w-full">
                  {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                  {isNew ? "Save draft" : "Save changes"}
                </Button>
              ) : null}

              {entry && entry.allowed_actions.length > 0 ? (
                <WorkflowActions
                  entry={entry}
                  timeZone={website.timezone}
                  disabled={busy}
                  dirty={isDirty}
                  onAction={act}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Address</CardTitle>
              <CardDescription>The last part of this {contentType.singular_name.toLowerCase()}&apos;s URL on your website.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field id="slug" label="Slug" error={errors.slug?.message} hint={isNew ? "Leave empty to make one from the title." : undefined}>
                <Input placeholder="e.g. budget-passes-first-reading" autoComplete="off" disabled={!editable || busy} {...form.register("slug")} />
              </Field>
            </CardContent>
          </Card>

          {entry ? <RevisionsCard website={website} entry={entry} /> : null}
          {entry?.can_delete ? <DeleteEntry website={website} entry={entry} listHref={listHref} /> : null}
        </div>
      </form>
    </>
  );
}

type Register = ReturnType<typeof useForm<EditorValues>>["register"];

function DataField({
  field,
  error,
  register,
  control,
  timeZone,
  slug,
  disabled,
  canUpload,
}: {
  field: FieldDefinition;
  error?: string;
  register: Register;
  control: Control<EditorValues>;
  timeZone: string;
  slug: string;
  disabled: boolean;
  canUpload: boolean;
}) {
  const id = `data.${field.key}` as const;
  const label = field.required ? field.label : `${field.label} (optional)`;

  if (isMediaField(field)) {
    return (
      <div className={field.type === "gallery" ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}>
        <span className="text-sm font-medium leading-none">{label}</span>
        <Controller
          control={control}
          name={id}
          render={({ field: control }) => (
            <MediaField
              slug={slug}
              kind={MEDIA_KINDS[field.type]}
              multiple={field.type === "gallery"}
              value={Array.isArray(control.value) ? control.value : []}
              onChange={(ids) => control.onChange(ids)}
              disabled={disabled}
              canUpload={canUpload}
            />
          )}
        />
        {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  const hint = field.type === "datetime" ? [field.help, `Time zone: ${timeZone.replaceAll("_", " ")}.`].filter(Boolean).join(" ") : field.help || undefined;

  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" {...register(id)} />
        {field.label}
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <div className="sm:col-span-2">
        <Field id={id} label={label} error={error} hint={hint}>
          <Textarea rows={4} placeholder={`Enter ${field.label.toLowerCase()}`} {...register(id)} />
        </Field>
      </div>
    );
  }
  const INPUT_TYPES: Partial<Record<FieldDefinition["type"], string>> = { text: "text", url: "url", date: "date", datetime: "datetime-local", number: "number" };
  const inputType = INPUT_TYPES[field.type] ?? "text";
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <Input
        type={inputType}
        placeholder={field.type === "url" ? "https://example.org/…" : field.type === "number" ? "0" : `Enter ${field.label.toLowerCase()}`}
        {...register(id)}
      />
    </Field>
  );
}

/** Search and social overrides, with a preview of how a search result may look. */
function SeoCard({
  website,
  control,
  register,
  errors,
  watchTitle,
  watchSummary,
  watchSeo,
  entrySlug,
  typeKey,
  disabled,
  canUpload,
}: {
  website: Website;
  control: Control<EditorValues>;
  register: Register;
  errors?: Record<string, { message?: string }>;
  watchTitle: string;
  watchSummary: string;
  watchSeo: SeoValues;
  entrySlug: string;
  typeKey: string;
  disabled: boolean;
  canUpload: boolean;
}) {
  const { data: settings } = useSeoSettings(website.slug);
  const template = settings?.title_template || "{title} | {site}";
  const pageTitle = watchSeo.title.trim() || watchTitle.trim() || "Untitled";
  const shownTitle = template.replace("{title}", pageTitle).replace("{site}", website.name);
  const description = watchSeo.description.trim() || watchSummary.trim() || settings?.default_description || "";
  const host = website.primary_domain || hostOf(website.frontend_url) || "your-website.com";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Search &amp; social</CardTitle>
        <CardDescription>Optional. Leave empty to use the title, summary and cover image.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="rounded-md border border-border bg-surface-muted/40 p-4" aria-label="Search result preview">
          <p className="truncate text-xs text-muted-foreground">
            {host} › {typeKey} › {entrySlug || "…"}
          </p>
          <p className="truncate text-lg text-accent">{shownTitle}</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">{description || "No description yet."}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="seo.title" label="Search title" error={errors?.title?.message} hint={`${pageTitle.length} characters. About 60 show in results.`}>
            <Input {...register("seo.title")} placeholder={watchTitle} />
          </Field>
          <Field id="seo.canonical_url" label="Canonical address" error={errors?.canonical_url?.message} hint="Only if this content first appeared elsewhere.">
            <Input type="url" placeholder="https://" {...register("seo.canonical_url")} />
          </Field>
          <div className="sm:col-span-2">
            <Field
              id="seo.description"
              label="Search description"
              error={errors?.description?.message}
              hint={`${description.length} characters. Aim for 50–160.`}
            >
              <Textarea rows={2} {...register("seo.description")} placeholder={watchSummary} />
            </Field>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium leading-none">Share image</span>
            <Controller
              control={control}
              name="seo.image"
              render={({ field }) => (
                <MediaField slug={website.slug} kind="image" value={field.value} onChange={field.onChange} disabled={disabled} canUpload={canUpload} />
              )}
            />
            {errors?.image?.message ? <p className="text-xs text-danger">{errors.image.message}</p> : null}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" {...register("seo.noindex")} />
            <span>
              <span className="font-medium">Hide from search engines</span>
              <span className="block text-xs text-muted-foreground">For thank-you pages and similar.</span>
            </span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function PublishingFacts({ entry, timeZone }: { entry: Entry; timeZone: string }) {
  return (
    <dl className="grid gap-2 text-sm">
      <Fact label="Author">{entry.author?.display_name || entry.author?.email || "Unknown"}</Fact>
      {entry.status === "scheduled" && entry.publish_at ? <Fact label="Goes live">{formatInZone(entry.publish_at, timeZone)}</Fact> : null}
      {entry.published_at ? <Fact label="First published">{formatInZone(entry.published_at, timeZone)}</Fact> : null}
      <Fact label="Last saved">
        {timeAgo(entry.updated_at)}
        {entry.updated_by_email ? ` by ${entry.updated_by_email}` : ""}
      </Fact>
    </dl>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 whitespace-nowrap text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function WorkflowActions({
  entry,
  timeZone,
  disabled,
  dirty,
  onAction,
}: {
  entry: Entry;
  timeZone: string;
  disabled: boolean;
  dirty: boolean;
  onAction: (action: EntryAction, publishAt?: string) => Promise<Entry | undefined>;
}) {
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState(() => toZonedInput(entry.publish_at, timeZone));
  const ordered = [...entry.allowed_actions].sort((a, b) => Number(PRIMARY.includes(b)) - Number(PRIMARY.includes(a)));

  return (
    <div className="grid gap-2 border-t border-border pt-4">
      {dirty ? <p className="text-xs text-warning">Save your changes before changing the status.</p> : null}
      {ordered.map((action, index) =>
        action === "schedule" ? (
          <div key={action} className="grid gap-2">
            {scheduling ? (
              <>
                <Field id="publish_at" label="Publish on" hint={`Time zone: ${timeZone.replaceAll("_", " ")}.`}>
                  <Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
                </Field>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={disabled || dirty || !when}
                    onClick={async () => {
                      if (await onAction("schedule", when)) setScheduling(false);
                    }}
                  >
                    Confirm schedule
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setScheduling(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <Button type="button" variant="outline" disabled={disabled || dirty} onClick={() => setScheduling(true)}>
                {entry.status === "scheduled" ? "Change schedule…" : ACTION_LABELS.schedule}
              </Button>
            )}
          </div>
        ) : (
          <Button
            key={action}
            type="button"
            variant={index === 0 && PRIMARY.includes(action) ? "default" : "outline"}
            disabled={disabled || dirty}
            onClick={() => onAction(action)}
          >
            {ACTION_LABELS[action]}
          </Button>
        ),
      )}
    </div>
  );
}

function RevisionsCard({ website, entry }: { website: Website; entry: Entry }) {
  const { data: revisions, isLoading } = useRevisions(website.slug, entry.id);
  const restore = useRestoreRevision(website.slug, entry.id);

  async function restoreTo(revisionId: number, version: number) {
    try {
      await restore.mutateAsync({ revisionId, version: entry.version });
      toast.success(`Restored version ${version}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore that version.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" aria-hidden />
          History
        </CardTitle>
        <CardDescription>Every saved version. Restoring keeps the current status.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        <ol className="grid max-h-80 gap-3 overflow-y-auto">
          {revisions?.map((revision) => (
            <li key={revision.id} className="flex items-start justify-between gap-2 border-l-2 border-border pl-3">
              <div className="min-w-0">
                <p className="text-sm">
                  v{revision.version} · {revision.note || "Saved"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {revision.created_by_email ?? "System"} · {timeAgo(revision.created_at)}
                </p>
              </div>
              {entry.can_edit && revision.version !== entry.version ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={restore.isPending}
                  onClick={() => restoreTo(revision.id, revision.version)}
                >
                  Restore
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function DeleteEntry({ website, entry, listHref }: { website: Website; entry: Entry; listHref: string }) {
  const router = useRouter();
  const remove = useDeleteEntry(website.slug, entry.id);
  const [open, setOpen] = useState(false);

  async function confirm() {
    try {
      await remove.mutateAsync();
      toast.success(`Deleted “${entry.title}”.`);
      router.replace(listHref);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete it.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="ghost" className="justify-start text-danger hover:bg-danger-soft" onClick={() => setOpen(true)}>
        <Trash2 />
        Delete {entry.type_name.toLowerCase()}
      </Button>
      <DialogContent>
        <DialogTitle>Delete “{entry.title}”?</DialogTitle>
        <DialogDescription>This removes it and its history for good. To hide it but keep it, archive it instead.</DialogDescription>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={remove.isPending} onClick={confirm}>
            {remove.isPending ? <Loader2 className="animate-spin" /> : null}
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
