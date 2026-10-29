"use client";

import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, CheckCircle2, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { use, type ReactNode } from "react";

import { StatusBadge } from "@/components/content/status-badge";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { OutputChart } from "@/components/growth/output-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { formatInZone } from "@/lib/datetime";
import { useDashboard, useMe } from "@/lib/queries";
import { ROLE_LABELS, can, type WebsiteRole } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const ISSUE_LABELS: Record<string, string> = {
  description_missing: "Missing description",
  description_short: "Short description",
  description_long: "Long description",
  title_long: "Long search title",
  title_duplicate: "Duplicate title",
  image_missing: "No share image",
  noindex: "Hidden from search",
};

export default function WebsiteOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data, isLoading, error } = useDashboard(slug);
  const { data: me } = useMe();

  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        {error.message}
      </p>
    );
  }
  if (!data) return null;

  const { website, stats, recent_activity: activity, needs_attention: attention, overview } = data;
  const tiles = overview.tiles;
  const base = `/websites/${slug}`;
  const firstName = me?.first_name || me?.full_name || me?.email?.split("@")[0];

  return (
    <div className="grid gap-4">
      {/* Greeting and quick actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{greeting(firstName)}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Here is how {website.name} is doing. Figures cover the last 30 days.
            {website.role ? <Badge variant="accent">{ROLE_LABELS[website.role as WebsiteRole]}</Badge> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(website, "media.upload") ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`${base}/media`}>
                <Upload /> Upload media
              </Link>
            </Button>
          ) : null}
          {can(website, "content.event.create") ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`${base}/content/event/new`}>
                <CalendarDays /> New event
              </Link>
            </Button>
          ) : null}
          {can(website, "content.article.create") ? (
            <Button size="sm" asChild>
              <Link href={`${base}/content/article/new`}>
                <Plus /> New article
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Six tiles, as in the V3 dashboard */}
      <section aria-label="At a glance" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile
          label="Published articles"
          value={tiles.articles_published}
          href={`${base}/content/article`}
          note={<Change value={tiles.articles_change} fallback={`${tiles.articles_last_30} in the last 30 days`} />}
        />
        <Tile
          label="Drafts and reviews"
          value={stats.content.draft + stats.content.in_review}
          note={stats.content.in_review ? `${stats.content.in_review} need review` : "Nothing waiting"}
        />
        <Tile label="Upcoming events" value={tiles.upcoming_events} note="Next 60 days" href={`${base}/content/event`} />
        <Tile label="Publications" value={tiles.publications_total} note={`${tiles.publications_published} published`} href={`${base}/content/publication`} />
        <Tile label="Media files" value={tiles.media_files} note="In the library" href={`${base}/media`} />
        <Tile label="Team members" value={stats.members} note={`${(stats.by_role.owner ?? 0) + (stats.by_role.admin ?? 0)} owners and admins`} href={`${base}/settings/users`} />
      </section>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Content activity" meta="Last 30 days">
          <ActivityChart data={overview.activity} />
        </Panel>
        <Panel title="Publishing output" meta="Entries per week">
          <OutputChart output={overview.output} height={258} />
        </Panel>
      </div>

      {/* Lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Needs attention"
          meta={`${stats.content.draft} draft${stats.content.draft === 1 ? "" : "s"} · ${stats.content.in_review} in review`}
        >
          {attention.length === 0 ? (
            <Empty>Nothing waiting. Drafts and entries in review show up here.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {attention.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`${base}/content/${item.type}/${item.id}`} className="min-w-0 truncate text-sm font-medium text-accent hover:underline">
                    {item.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <StatusBadge status={item.status} />
                    <span className="hidden sm:inline">{item.type_name}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Search health" meta={overview.seo.checked ? `${overview.seo.healthy} of ${overview.seo.checked} published entries pass` : "Nothing published yet"} action={<Link href={`${base}/growth`} className="text-xs text-accent hover:underline">Open SEO</Link>}>
          {overview.seo.checked === 0 ? (
            <Empty>Publish content to see how it looks to search engines.</Empty>
          ) : overview.seo.issues.length === 0 ? (
            <p className="flex items-center gap-2 py-2 text-sm text-success">
              <CheckCircle2 className="size-4" /> Every published entry passes the checks.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="w-full py-2 font-medium">Entry</th>
                  <th scope="col" className="py-2 text-right font-medium">Problem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.seo.issues.map((issue, index) => (
                  <tr key={`${issue.entry_id}-${issue.code}-${index}`}>
                    <td className="max-w-0 py-2.5 pr-3">
                      <Link href={`${base}/content/${issue.type}/${issue.entry_id}`} className="block truncate hover:underline">
                        {issue.title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5 text-warning" aria-hidden />
                        {ISSUE_LABELS[issue.code] ?? issue.code}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Scheduled publications" meta={overview.scheduled.length ? `${overview.scheduled.length} upcoming` : undefined}>
          {overview.scheduled.length === 0 ? (
            <Empty>Nothing scheduled. Schedule an entry from its Publishing panel.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {overview.scheduled.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.type_name} · publishes {formatInZone(item.publish_at, website.timezone)}
                    </p>
                  </div>
                  <Link href={`${base}/content/${item.type}/${item.id}`} className="shrink-0 text-xs font-medium text-accent hover:underline">
                    Edit
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Recent activity"
          action={can(website, "audit.view") ? <Link href={`${base}/settings/audit-logs`} className="text-xs text-accent hover:underline">View all</Link> : undefined}
        >
          {activity.length === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((entry) => (
                <li key={entry.id} className="flex gap-2.5 py-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      <span className="font-medium">{entry.actor_email ?? "System"}</span> <span className="text-muted-foreground">·</span> {entry.summary}
                    </p>
                    <p className="text-xs text-muted-foreground">{timeAgo(entry.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function greeting(name?: string) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

function Tile({ label, value, note, href }: { label: string; value: number; note: ReactNode; href?: string }) {
  const body = (
    <Card className={cn("h-full px-4 py-3.5", href && "transition-colors hover:border-accent/50")}>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{note}</div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-offset-2">
      {body}
    </Link>
  ) : (
    body
  );
}

/** "▲ 12% vs previous 30 days", in text colours (never the series colours). */
function Change({ value, fallback }: { value: number | null; fallback: string }) {
  if (value === null) return <>{fallback}</>;
  const up = value >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success" : "text-danger")}>
      <Icon className="size-3" aria-hidden />
      {Math.abs(value)}% <span className="font-normal text-muted-foreground">vs last month</span>
    </span>
  );
}

function Panel({ title, meta, action, children }: { title: string; meta?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {meta ? <span>{meta}</span> : null}
          {action}
        </div>
      </div>
      {children}
    </Card>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
