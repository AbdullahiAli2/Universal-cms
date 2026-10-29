"use client";

import { CheckCircle2, Copy, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { use, useState, type FormEvent } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { MediaField } from "@/components/media/media-picker";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useAddDomain, useBranding, useDomainAction, useDomains, useUpdateBranding, useWebsite } from "@/lib/queries";
import { can, type Branding, type BrandingImageField, type Domain, type SocialLink } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/skeleton";

const NETWORK_LABELS: Record<string, string> = {
  facebook: "Facebook",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

interface BrandValues {
  tagline: string;
  logo: number[];
  logo_reversed: number[];
  icon: number[];
  share_image: number[];
  primary_color: string;
  accent_color: string;
  heading_font: string;
  body_font: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  office_hours: string;
  maps_url: string;
  socials: SocialLink[];
}

const IMAGE_FIELDS: { key: BrandingImageField; label: string; hint: string; dark?: boolean }[] = [
  { key: "logo", label: "Logo", hint: "For light backgrounds, such as the header." },
  { key: "logo_reversed", label: "Reversed logo", hint: "For dark backgrounds, such as the footer.", dark: true },
  { key: "icon", label: "Site icon", hint: "Square. Used as the browser tab icon." },
  { key: "share_image", label: "Default share image", hint: "Shown when a page without its own image is shared. 1200×630 works best." },
];

function valuesFrom(branding: Branding): BrandValues {
  const one = (id: number | null) => (id ? [id] : []);
  return {
    tagline: branding.tagline,
    logo: one(branding.logo),
    logo_reversed: one(branding.logo_reversed),
    icon: one(branding.icon),
    share_image: one(branding.share_image),
    primary_color: branding.primary_color,
    accent_color: branding.accent_color,
    heading_font: branding.heading_font,
    body_font: branding.body_font,
    contact_email: branding.contact_email,
    contact_phone: branding.contact_phone,
    address: branding.address,
    office_hours: branding.office_hours,
    maps_url: branding.maps_url,
    socials: branding.socials,
  };
}

export default function BrandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: website } = useWebsite(slug);
  const { data: branding, error } = useBranding(slug);

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        {error.message}
      </p>
    );
  }
  if (!branding || !website) return <PageSkeleton />;
  const canManage = can(website, "branding.manage");
  const canManageDomains = can(website, "domains.manage");

  return (
    <>
      <PageHeader
        title="Branding & domains"
        description="How your website presents itself. Your website's frontend reads these values; nothing on the site changes until it does."
      />
      <div className="grid gap-6">
        <BrandingForm key={branding.updated_at} slug={slug} branding={branding} canManage={canManage} />
        <DomainsCard slug={slug} canManage={canManageDomains} />
      </div>
    </>
  );
}

function BrandingForm({ slug, branding, canManage }: { slug: string; branding: Branding; canManage: boolean }) {
  const update = useUpdateBranding(slug);
  const form = useForm<BrandValues>({ defaultValues: valuesFrom(branding) });
  const socials = useFieldArray({ control: form.control, name: "socials" });
  const { errors, isDirty, isSubmitting } = form.formState;
  const [primary, accent, headingFont, bodyFont, tagline] = form.watch(["primary_color", "accent_color", "heading_font", "body_font", "tagline"]);

  async function save(values: BrandValues) {
    const first = (ids: number[]) => ids[0] ?? null;
    try {
      await update.mutateAsync({
        ...values,
        logo: first(values.logo),
        logo_reversed: first(values.logo_reversed),
        icon: first(values.icon),
        share_image: first(values.share_image),
      });
      toast.success("Branding saved.");
    } catch (error) {
      if (error instanceof ApiError) {
        let placed = false;
        for (const [key, messages] of Object.entries(error.fields)) {
          if (key in values) {
            form.setError(key as keyof BrandValues, { message: messages[0] });
            placed = true;
          }
        }
        if (!placed) toast.error(error.message);
      }
    }
  }

  return (
    <form onSubmit={form.handleSubmit(save)} noValidate className="grid gap-6 xl:grid-cols-2">
      <fieldset disabled={!canManage || isSubmitting} className="contents">
        <Card>
          <CardHeader>
            <CardTitle>Logos and images</CardTitle>
            <CardDescription>Chosen from this website&apos;s media library.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {IMAGE_FIELDS.map((item) => (
              <div key={item.key} className="grid content-start gap-1.5">
                <span className="text-sm font-medium leading-none">{item.label}</span>
                <div className={item.dark ? "rounded-md bg-[#14171f] p-2" : undefined}>
                  <Controller
                    control={form.control}
                    name={item.key}
                    render={({ field }) => (
                      <MediaField slug={slug} kind="image" value={field.value} onChange={field.onChange} disabled={!canManage} canUpload={canManage} />
                    )}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{item.hint}</p>
                {errors[item.key]?.message ? <p className="text-xs text-danger">{errors[item.key]?.message}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Colours and type</CardTitle>
            <CardDescription>For example teal #064b63 and burgundy #74133f.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <ColorField id="primary_color" label="Primary colour" error={errors.primary_color?.message} value={primary} register={form.register} setValue={(v) => form.setValue("primary_color", v, { shouldDirty: true })} />
            <ColorField id="accent_color" label="Accent colour" error={errors.accent_color?.message} value={accent} register={form.register} setValue={(v) => form.setValue("accent_color", v, { shouldDirty: true })} />
            <Field id="heading_font" label="Heading font" error={errors.heading_font?.message}>
              <Select {...form.register("heading_font")}>
                <option value="">Website default</option>
                {branding.options.fonts.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="body_font" label="Body font" error={errors.body_font?.message}>
              <Select {...form.register("body_font")}>
                <option value="">Website default</option>
                {branding.options.fonts.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field id="tagline" label="Tagline" error={errors.tagline?.message}>
                <Input placeholder="Independent research for Somalia and the Horn of Africa" {...form.register("tagline")} />
              </Field>
            </div>
            <div className="overflow-hidden rounded-md border border-border sm:col-span-2" aria-label="Colour preview">
              <div className="px-4 py-3" style={{ background: primary || "#3b5bdb", color: "#fff" }}>
                <p className="text-xs opacity-80">{headingFont || "Website default"} · {bodyFont || "Website default"}</p>
                <p className="text-lg font-semibold">{tagline || "Your tagline"}</p>
              </div>
              <div className="flex items-center justify-between gap-2 bg-surface px-4 py-3">
                <span className="text-sm text-muted-foreground">Buttons and links</span>
                <span className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: accent || primary || "#3b5bdb" }}>
                  Read more
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact details</CardTitle>
            <CardDescription>Shown in your website&apos;s footer and contact page.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field id="contact_email" label="Email" error={errors.contact_email?.message}>
              <Input type="email" placeholder="info@example.org" {...form.register("contact_email")} />
            </Field>
            <Field id="contact_phone" label="Phone" error={errors.contact_phone?.message}>
              <Input type="tel" placeholder="+252 …" {...form.register("contact_phone")} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="address" label="Address" error={errors.address?.message}>
                <Textarea rows={2} placeholder="Street, Mogadishu, Somalia" {...form.register("address")} />
              </Field>
            </div>
            <Field id="office_hours" label="Office hours" error={errors.office_hours?.message}>
              <Input placeholder="Sat–Thu, 8:00–16:00 EAT" {...form.register("office_hours")} />
            </Field>
            <Field id="maps_url" label="Map link" error={errors.maps_url?.message}>
              <Input type="url" placeholder="https://maps.google.com/…" {...form.register("maps_url")} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Social links</CardTitle>
            <CardDescription>Up to 12.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {socials.fields.length === 0 ? <p className="text-sm text-muted-foreground">No links yet.</p> : null}
            {socials.fields.map((item, index) => (
              <div key={item.id} className="grid grid-cols-[140px_minmax(0,1fr)_auto] items-start gap-2">
                <Select aria-label="Network" {...form.register(`socials.${index}.network`)}>
                  {branding.options.social_networks.map((network) => (
                    <option key={network} value={network}>
                      {NETWORK_LABELS[network] ?? network}
                    </option>
                  ))}
                </Select>
                <div>
                  <Input type="url" aria-label="Link" placeholder="https://" {...form.register(`socials.${index}.url`, { required: "Enter the link." })} />
                  {errors.socials?.[index]?.url?.message ? <p className="mt-1 text-xs text-danger">{errors.socials[index]?.url?.message}</p> : null}
                </div>
                {canManage ? (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove link" onClick={() => socials.remove(index)}>
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            ))}
            {errors.socials?.message || errors.socials?.root?.message ? (
              <p className="text-xs text-danger">{errors.socials?.message ?? errors.socials?.root?.message}</p>
            ) : null}
            {canManage && socials.fields.length < 12 ? (
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => socials.append({ network: "facebook", url: "" })}>
                  <Plus /> Add link
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {canManage ? (
          <div className="flex items-center justify-end gap-3 xl:col-span-2">
            {isDirty ? <span className="text-sm text-muted-foreground">Unsaved changes</span> : null}
            <Button type="submit" disabled={!isDirty || isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Save branding
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground xl:col-span-2">Your role cannot change branding.</p>
        )}
      </fieldset>
    </form>
  );
}

function ColorField({
  id,
  label,
  error,
  value,
  register,
  setValue,
}: {
  id: "primary_color" | "accent_color";
  label: string;
  error?: string;
  value: string;
  register: ReturnType<typeof useForm<BrandValues>>["register"];
  setValue: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium leading-none">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(event) => setValue(event.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1"
        />
        <Input id={id} placeholder="#064b63" autoComplete="off" aria-invalid={error ? true : undefined} {...register(id)} />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function DomainsCard({ slug, canManage }: { slug: string; canManage: boolean }) {
  const { data: domains, isLoading } = useDomains(slug);
  const add = useAddDomain(slug);
  const [hostname, setHostname] = useState("");
  const [addError, setAddError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAddError("");
    try {
      await add.mutateAsync(hostname);
      setHostname("");
      toast.success("Domain added. Add the DNS record below to verify it.");
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Could not add it.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Domains</CardTitle>
        <CardDescription>
          The addresses your website is served from. Prove you own each one with a DNS record, then make one primary. The primary
          domain can also be changed in Settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {domains && domains.length === 0 ? <p className="text-sm text-muted-foreground">No domains yet.</p> : null}
        <ul className="grid gap-3">
          {domains?.map((domain) => (
            <DomainRow key={domain.id} slug={slug} domain={domain} canManage={canManage} />
          ))}
        </ul>
        {canManage ? (
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1">
              <Input
                aria-label="New domain"
                placeholder="www.example.org"
                value={hostname}
                onChange={(event) => setHostname(event.target.value)}
                aria-invalid={addError ? true : undefined}
              />
              {addError ? <p className="mt-1 text-xs text-danger">{addError}</p> : null}
            </div>
            <Button type="submit" variant="outline" disabled={!hostname.trim() || add.isPending}>
              {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              Add domain
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DomainRow({ slug, domain, canManage }: { slug: string; domain: Domain; canManage: boolean }) {
  const action = useDomainAction(slug);

  async function run(kind: "verify" | "make-primary" | "remove") {
    try {
      const result = await action.mutateAsync({ id: domain.id, action: kind });
      if (kind === "verify") {
        if (result?.verified_at) toast.success(`${domain.hostname} is verified.`);
        else toast.error(result?.last_error || "Not verified yet.");
      } else if (kind === "make-primary") toast.success(`${domain.hostname} is now the primary domain.`);
      else toast.success(`Removed ${domain.hostname}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy.");
    }
  }

  return (
    <li className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{domain.hostname}</span>
          {domain.is_primary ? <Badge variant="accent">Primary</Badge> : null}
          {domain.verified_at ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="size-3" /> Verified
            </Badge>
          ) : (
            <Badge variant="warning" className="gap-1">
              <ShieldAlert className="size-3" /> Not verified
            </Badge>
          )}
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {!domain.verified_at ? (
              <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => run("verify")}>
                {action.isPending ? <Loader2 className="animate-spin" /> : null}
                Check now
              </Button>
            ) : null}
            {domain.verified_at && !domain.is_primary ? (
              <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => run("make-primary")}>
                Make primary
              </Button>
            ) : null}
            {!domain.is_primary ? (
              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" disabled={action.isPending} onClick={() => run("remove")}>
                Remove
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {!domain.verified_at ? (
        <div className="mt-3 grid gap-2 text-sm">
          <p className="text-muted-foreground">At your domain provider, add this TXT record:</p>
          <dl className="grid gap-1.5 rounded-md bg-surface-muted p-3 font-mono text-[13px]">
            {[
              ["Type", "TXT"],
              ["Name", domain.record_name],
              ["Value", domain.record_value],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center gap-2">
                <dt className="w-14 shrink-0 font-sans text-xs text-muted-foreground">{label}</dt>
                <dd className="min-w-0 flex-1 truncate">{value}</dd>
                {label !== "Type" ? (
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => copy(value)}>
                    <Copy />
                  </Button>
                ) : null}
              </div>
            ))}
          </dl>
          {domain.last_error ? <p className="text-xs text-warning">{domain.last_error}</p> : null}
          {domain.last_checked_at ? <p className="text-xs text-muted-foreground">Last checked {timeAgo(domain.last_checked_at)}.</p> : null}
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Verified {timeAgo(domain.verified_at)}.</p>
      )}
    </li>
  );
}
