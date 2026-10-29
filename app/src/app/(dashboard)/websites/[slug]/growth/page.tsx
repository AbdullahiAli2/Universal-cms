"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { use, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { OutputChart } from "@/components/growth/output-chart";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useGrowth, useSeoSettings, useUpdateSeoSettings, useWebsite } from "@/lib/queries";
import { can, type SeoSettings } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/skeleton";

const ISSUE_LABELS: Record<string, string> = {
  description_missing: "Missing description",
  description_short: "Short description",
  description_long: "Long description",
  title_long: "Long search title",
  title_duplicate: "Duplicate title",
  image_missing: "No share image",
  noindex: "Hidden from search",
};

export default function GrowthPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: website } = useWebsite(slug);
  const { data: report, error, isLoading } = useGrowth(slug);
  const { data: settings } = useSeoSettings(slug);

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        {error.message}
      </p>
    );
  }
  if (isLoading || !report || !website) return <PageSkeleton />;

  const health = report.seo_health;
  const problemCount = health.issues.filter((issue) => issue.code !== "noindex").length;
  const canManage = can(website, "seo.manage");

  return (
    <>
      <PageHeader
        title="SEO & analytics"
        description="Search health and publishing output, worked out from this website's content. Visitor numbers stay in your analytics tool."
      />

      <section aria-labelledby="growth-stats" className="mb-6">
        <h2 id="growth-stats" className="sr-only">
          Summary
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="SEO health" value={health.checked ? `${health.healthy}/${health.checked}` : "–"} note={health.checked ? "Published entries with no problems" : "Nothing published yet"} />
          <Tile label="Problems to fix" value={String(problemCount)} note={problemCount ? "Listed below" : "None found"} />
          <Tile label="Images without alt text" value={String(health.images_without_alt)} note="Alt text helps search and accessibility" href={`/websites/${slug}/media`} />
          <Tile
            label="Analytics"
            value={report.analytics.connected ? "Set up" : "Not set up"}
            note={report.analytics.ga4_measurement_id || report.analytics.plausible_domain || "Add an ID below"}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Publishing output</CardTitle>
            <CardDescription>Entries first published each week, last 8 weeks.</CardDescription>
          </CardHeader>
          <CardContent>
            <OutputChart output={report.output} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Search checklist</CardTitle>
            <CardDescription>Website-wide settings search engines look for.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 text-sm">
              <Check ok={health.indexing_allowed} label="Search engines may index the website" fix="Turn on “Allow search engines” below." />
              <Check ok={health.has_default_description} label="Default description is set" fix="Add one below. Pages without their own description use it." />
              <Check ok={health.has_share_image} label="Default share image is set" fix={<Link className="text-accent hover:underline" href={`/websites/${slug}/branding`}>Choose one in Branding.</Link>} />
              <Check ok={!!settings?.google_site_verification} label="Google Search Console verification" fix="Paste the code from Search Console below." optional />
              <Check ok={report.analytics.connected} label="Analytics connected" fix="Add a Google Analytics 4 ID or a Plausible domain below." optional />
              <Check ok={report.sitemap.count > 0} label={`${report.sitemap.count} page${report.sitemap.count === 1 ? "" : "s"} ready for the sitemap`} fix="Publish content to fill the sitemap." />
            </ul>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Content to improve</CardTitle>
            <CardDescription>
              {Object.entries(health.issue_counts)
                .map(([code, count]) => `${ISSUE_LABELS[code] ?? code}: ${count}`)
                .join(" · ") || "Every published entry passes the checks."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {health.issues.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" /> Nothing to fix.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {health.issues.map((issue, index) => (
                  <li key={`${issue.entry_id}-${issue.code}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/websites/${slug}/content/${issue.type}/${issue.entry_id}`} className="font-medium text-accent hover:underline">
                        {issue.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{issue.message}</p>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {issue.code === "noindex" ? <Info className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5 text-warning" aria-hidden />}
                      {ISSUE_LABELS[issue.code] ?? issue.code}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {settings ? <SeoSettingsCard key={settings.updated_at} slug={slug} settings={settings} canManage={canManage} /> : null}

        <Card>
          <CardHeader>
            <CardTitle>Sitemap</CardTitle>
            <CardDescription>Published entries that are not hidden from search. Your website builds sitemap.xml from these.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.sitemap.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="grid max-h-96 gap-2 overflow-y-auto text-sm">
                {report.sitemap.entries.map((entry) => (
                  <li key={`${entry.type}-${entry.slug}`} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground">/{entry.type}/</span>
                      {entry.slug}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(entry.updated_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            {report.sitemap.count > report.sitemap.entries.length ? (
              <p className="mt-2 text-xs text-muted-foreground">Showing 50 of {report.sitemap.count}.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Tile({ label, value, note, href }: { label: string; value: string; note: string; href?: string }) {
  const body = (
    <Card className={href ? "h-full p-5 transition-colors hover:border-accent" : "h-full p-5"}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{note}</p>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-lg focus-visible:outline-offset-4">
      {body}
    </Link>
  ) : (
    body
  );
}

function Check({ ok, label, fix, optional = false }: { ok: boolean; label: string; fix: ReactNode; optional?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" />
      ) : optional ? (
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Optional" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="To do" />
      )}
      <div>
        <p className={ok ? undefined : "font-medium"}>{label}</p>
        {!ok ? <p className="text-xs text-muted-foreground">{fix}</p> : null}
      </div>
    </li>
  );
}

type SettingsValues = Omit<SeoSettings, "updated_at">;

function SeoSettingsCard({ slug, settings, canManage }: { slug: string; settings: SeoSettings; canManage: boolean }) {
  const update = useUpdateSeoSettings(slug);
  const { updated_at: _updated, ...defaults } = settings;
  const form = useForm<SettingsValues>({ defaultValues: defaults });
  const { errors, isDirty, isSubmitting } = form.formState;

  async function save(values: SettingsValues) {
    try {
      await update.mutateAsync(values);
      toast.success("SEO settings saved.");
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [key, messages] of Object.entries(error.fields)) form.setError(key as keyof SettingsValues, { message: messages[0] });
        if (!Object.keys(error.fields).length) toast.error(error.message);
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>SEO settings</CardTitle>
        <CardDescription>{canManage ? "Defaults and IDs your website's frontend uses." : "Your role cannot change these."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(save)} noValidate className="grid gap-4">
          <fieldset disabled={!canManage || isSubmitting} className="contents">
            <Field id="title_template" label="Page title format" error={errors.title_template?.message} hint="{title} is the page title, {site} the website name.">
              <Input placeholder={"{title} | {site}"} {...form.register("title_template")} />
            </Field>
            <Field id="default_description" label="Default description" error={errors.default_description?.message} hint="Used when a page has no description of its own. Up to 320 characters.">
              <Textarea placeholder="One or two sentences describing the whole website" rows={2} {...form.register("default_description")} />
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" {...form.register("allow_indexing")} />
              <span>
                <span className="font-medium">Allow search engines</span>
                <span className="block text-xs text-muted-foreground">Turn off while the website is being built.</span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="google_site_verification" label="Google verification code" error={errors.google_site_verification?.message} hint="From Search Console. The whole meta tag works too.">
                <Input placeholder="Paste the code or the whole meta tag" autoComplete="off" {...form.register("google_site_verification")} />
              </Field>
              <Field id="bing_site_verification" label="Bing verification code" error={errors.bing_site_verification?.message}>
                <Input placeholder="Paste the code from Bing Webmaster Tools" autoComplete="off" {...form.register("bing_site_verification")} />
              </Field>
              <Field id="ga4_measurement_id" label="Google Analytics 4 ID" error={errors.ga4_measurement_id?.message} hint="Looks like G-XXXXXXXXXX.">
                <Input autoComplete="off" placeholder="G-" {...form.register("ga4_measurement_id")} />
              </Field>
              <Field id="plausible_domain" label="Plausible domain" error={errors.plausible_domain?.message} hint="If you use Plausible instead.">
                <Input autoComplete="off" placeholder="example.org" {...form.register("plausible_domain")} />
              </Field>
            </div>
            {canManage ? (
              <div className="flex justify-end">
                <Button type="submit" disabled={!isDirty || isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                  Save settings
                </Button>
              </div>
            ) : null}
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
