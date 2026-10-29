"use client";

import { CalendarDays, Eye, FileText, Globe, Monitor, Network, Route, Search, UserRound } from "lucide-react";
import { use, useEffect, useState, type ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuditLog, useMe, type AuditFilters } from "@/lib/queries";
import type { AuditEntry } from "@/lib/types";
import { cn, userLocale } from "@/lib/utils";

const PAGE_SIZE = 50;
const CATEGORIES = [
  { value: "", label: "All modules" },
  { value: "entry.", label: "Content" },
  { value: "media.", label: "Media" },
  { value: "member.", label: "Users" },
  { value: "user.", label: "User accounts" },
  { value: "role.", label: "Roles" },
  { value: "website.", label: "Settings" },
  { value: "branding.", label: "Branding" },
  { value: "domain.", label: "Domains" },
  { value: "seo.", label: "SEO" },
  { value: "auth.", label: "Account and sign-in" },
  { value: "email.", label: "Email" },
  { value: "profile.", label: "Profiles" },
];

function formatDate(iso: string, withTime = false) {
  return new Intl.DateTimeFormat(userLocale(), withTime ? { dateStyle: "short", timeStyle: "medium" } : { dateStyle: "short" }).format(new Date(iso));
}

export default function AuditLogsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: me } = useMe();
  const [filters, setFilters] = useState<AuditFilters>({ page: 1 });
  const [actorInput, setActorInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [open, setOpen] = useState<AuditEntry | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => ({ ...current, actor: actorInput.trim(), search: searchInput.trim(), page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [actorInput, searchInput]);

  const { data, error, isLoading, isFetching } = useAuditLog(slug, filters);
  const page = filters.page ?? 1;
  const set = (patch: AuditFilters) => setFilters((current) => ({ ...current, ...patch, page: 1 }));

  return (
    <>
      <PageHeader title="Audit Trail" description="A permanent record of who changed what, when and from where. Entries cannot be edited or deleted." />

      <Card className="overflow-hidden">
        <div className="grid gap-2 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_200px_minmax(0,1fr)_150px_150px_auto]">
          <Input icon={Search} type="search" placeholder="Search actions, e.g. Published" aria-label="Search actions" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          <Select aria-label="Module" value={filters.action ?? ""} onChange={(event) => set({ action: event.target.value })}>
            {CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <Input icon={UserRound} placeholder="User email" aria-label="User email" value={actorInput} onChange={(event) => setActorInput(event.target.value)} />
          <Input type="date" aria-label="From date" title="From date" value={filters.date_from ?? ""} onChange={(event) => set({ date_from: event.target.value })} />
          <Input type="date" aria-label="To date" title="To date" value={filters.date_to ?? ""} onChange={(event) => set({ date_to: event.target.value })} />
          {me?.is_superuser ? (
            <label className="flex items-center gap-2 whitespace-nowrap text-sm">
              <input type="checkbox" checked={filters.scope === "all"} onChange={(event) => set({ scope: event.target.checked ? "all" : "" })} />
              Include sign-ins
            </label>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="m-4 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
            {error.message}
          </p>
        ) : null}

        {isLoading ? (
          <div className="grid gap-3 p-4">
            {[0, 1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-12" />
            ))}
          </div>
        ) : null}

        {data && data.results.length === 0 ? (
          <div className="py-12 text-center">
            <CardTitle className="text-base">No entries</CardTitle>
            <CardDescription>Nothing matches these filters.</CardDescription>
          </div>
        ) : null}

        {data && data.results.length > 0 ? (
          <>
            <div className={cn("overflow-x-auto", isFetching && "opacity-70")}>
              <table className="w-full text-sm">
                <thead className="bg-surface-muted/50 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">User</th>
                    <th scope="col" className="px-4 py-3">Module</th>
                    <th scope="col" className="w-[38%] px-4 py-3">Action</th>
                    <th scope="col" className="hidden px-4 py-3 lg:table-cell">Path</th>
                    <th scope="col" className="px-4 py-3">Date</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.results.map((entry) => {
                    const name = entry.actor?.name ?? "System";
                    return (
                      <tr key={entry.id} className="transition-colors hover:bg-surface-muted/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <UserAvatar name={name} src={entry.actor?.avatar_url} className="ring-2 ring-accent/20" />
                            <div className="min-w-0">
                              <p className="max-w-48 truncate font-semibold">{name}</p>
                              <p className="max-w-48 truncate text-xs text-muted-foreground">
                                {entry.actor ? (entry.actor.username ? `@${entry.actor.username}` : entry.actor.email) : "Automatic"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="accent">{entry.module}</Badge>
                        </td>
                        <td className="max-w-0 px-4 py-3">
                          <p className="truncate font-semibold">{entry.action_label}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {entry.summary}
                            {entry.target_type ? (
                              <span className="ml-1.5 text-muted-foreground/80">
                                · {entry.target_label} #{entry.target_id}
                              </span>
                            ) : null}
                          </p>
                        </td>
                        <td className="hidden max-w-64 px-4 py-3 lg:table-cell">
                          {entry.path ? (
                            <p className="truncate font-mono text-xs">
                              <span className="font-semibold text-accent">{entry.method}</span> {entry.path}
                            </p>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium">{formatDate(entry.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" className="text-accent" onClick={() => setOpen(entry)}>
                            <Eye /> View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={(next) => setFilters((current) => ({ ...current, page: next }))} />
          </>
        ) : null}
      </Card>

      <AuditDetails entry={open} onClose={() => setOpen(null)} />
    </>
  );
}

function Detail({ icon: Icon, label, children }: { icon: typeof Globe; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="break-words font-medium">{children}</div>
      </div>
    </div>
  );
}

function AuditDetails({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  const name = entry?.actor?.name ?? "System";
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="text-accent">Audit Trail Details</DialogTitle>
        <DialogDescription className="sr-only">Everything recorded about this change.</DialogDescription>
        {entry ? (
          <div className="grid gap-5 text-sm">
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Detail icon={FileText} label="Target">
                {entry.target_type ? (
                  <>
                    {entry.target_label} <span className="text-xs text-muted-foreground">#{entry.target_id}</span>
                  </>
                ) : (
                  "—"
                )}
              </Detail>
              <div className="flex items-center gap-3">
                <UserAvatar name={name} src={entry.actor?.avatar_url} size="lg" className="ring-2 ring-accent/20" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">User</p>
                  <p className="truncate font-semibold">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{entry.actor?.email ?? "Automatic change"}</p>
                </div>
              </div>
              <Detail icon={FileText} label="Module">
                {entry.module}
              </Detail>
              <Detail icon={CalendarDays} label="Date of action">
                {formatDate(entry.created_at, true)}
              </Detail>
              <Detail icon={Monitor} label="Browser">
                {entry.browser || "—"}
                {entry.device ? <span className="block text-xs font-normal text-muted-foreground">{entry.device}</span> : null}
              </Detail>
              <Detail icon={Network} label="IP address">
                {entry.ip_address || "—"}
                {entry.ip_note ? <span className="block text-xs font-normal text-muted-foreground">{entry.ip_note}</span> : null}
              </Detail>
              <Detail icon={Route} label="Path">
                {entry.path ? (
                  <span className="font-mono text-[13px]">
                    <span className="text-accent">{entry.method}</span> {entry.path}
                  </span>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail icon={Globe} label="Website">
                {entry.website_name ?? "Whole installation"}
              </Detail>
            </div>

            <section>
              <h3 className="mb-2 font-semibold">Action</h3>
              <div className="rounded-lg bg-surface-muted/70 px-4 py-3">
                <p className="font-semibold">{entry.action_label}</p>
                <p className="mt-0.5">{entry.summary}</p>
              </div>
            </section>

            <section>
              <h3 className="mb-2 font-semibold">System Information</h3>
              <div className="grid gap-1 rounded-lg bg-surface-muted/70 px-4 py-3">
                <p>
                  <span className="font-semibold">Operating system:</span> {entry.os || "—"}
                </p>
                <p>
                  <span className="font-semibold">Device:</span> {entry.device || "—"}
                </p>
                {entry.user_agent ? <p className="break-all text-xs text-muted-foreground">{entry.user_agent}</p> : null}
              </div>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
