"use client";

import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";

import { StatusBadge } from "@/components/content/status-badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatInZone } from "@/lib/datetime";
import { useContentTypes, useEntries, useWebsite } from "@/lib/queries";
import { ENTRY_STATUSES, type EntryStatus } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 25;

export default function EntryListPage({ params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type } = use(params);
  const { data: website } = useWebsite(slug);
  const { data: types, isLoading: typesLoading } = useContentTypes(slug);
  const contentType = types?.find((item) => item.key === type);

  const [status, setStatus] = useState<EntryStatus | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Search as the user types, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, error, isFetching } = useEntries(slug, { type, status, search, page });

  if (typesLoading) return <PageSkeleton />;
  if (!contentType) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        This content type does not exist on this website.
      </p>
    );
  }

  const canCreate = contentType.can_create;
  const base = `/websites/${slug}/content/${type}`;
  const counts = contentType.counts;
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;
  const filtered = !!(status || search);

  return (
    <>
      <PageHeader
        title={contentType.name}
        description={contentType.description}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus />
                New {contentType.singular_name.toLowerCase()}
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1">
          {[{ value: "" as const, label: "All" }, ...ENTRY_STATUSES].map((item) => {
            const count = item.value ? (counts[item.value] ?? 0) : (counts.total ?? 0);
            const active = status === item.value;
            return (
              <button
                key={item.value || "all"}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setStatus(item.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-accent-soft font-medium text-accent" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                )}
              >
                {item.label}
                <span className="ml-1.5 text-xs tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative lg:w-72">
          <Input
            icon={Search}
            type="search"
            placeholder={`Search ${contentType.name.toLowerCase()}`}
            aria-label={`Search ${contentType.name}`}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {error.message}
        </p>
      ) : null}

      {isLoading ? (
        <div className="h-48 animate-pulse rounded-lg border border-border bg-surface" aria-busy="true" aria-label="Loading entries" />
      ) : null}

      {data && data.results.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <CardTitle className="text-base">{filtered ? "Nothing matches" : `No ${contentType.name.toLowerCase()} yet`}</CardTitle>
          <CardDescription className="max-w-sm">
            {filtered
              ? "Try another status or search."
              : canCreate
                ? `Write your first ${contentType.singular_name.toLowerCase()}. It stays a draft until you publish it.`
                : "Nothing has been added here yet."}
          </CardDescription>
          {!filtered && canCreate ? (
            <Button asChild className="mt-2">
              <Link href={`${base}/new`}>New {contentType.singular_name.toLowerCase()}</Link>
            </Button>
          ) : null}
        </Card>
      ) : null}

      {data && data.results.length > 0 ? (
        <Card className={cn("overflow-hidden", isFetching && "opacity-70")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="w-[55%] px-4 py-2.5 font-medium">Title</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Author</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.results.map((entry) => (
                  <tr key={entry.id} className="hover:bg-surface-muted/40">
                    <td className="max-w-0 px-4 py-3">
                      <Link href={`${base}/${entry.id}`} className="block truncate font-medium text-accent hover:underline">
                        {entry.title}
                      </Link>
                      {entry.summary ? <p className="truncate text-xs text-muted-foreground">{entry.summary}</p> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={entry.status} />
                      {entry.status === "scheduled" && entry.publish_at && website ? (
                        <p className="mt-1 text-xs text-muted-foreground">{formatInZone(entry.publish_at, website.timezone)}</p>
                      ) : null}
                    </td>
                    <td className="hidden max-w-48 truncate px-4 py-3 text-muted-foreground md:table-cell">
                      {entry.author?.display_name || entry.author?.email || "Unknown"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">{timeAgo(entry.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">
                Page {page} of {pages} · {data.count} total
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" aria-label="Previous page" disabled={!data.previous} onClick={() => setPage(page - 1)}>
                  <ChevronLeft />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Next page" disabled={!data.next} onClick={() => setPage(page + 1)}>
                  <ChevronRight />
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
