"use client";

import { Globe, Plus } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWebsites } from "@/lib/queries";
import { ROLE_LABELS, WEBSITE_TYPES, type WebsiteRole } from "@/lib/types";

export default function WebsitesPage() {
  const { data: websites, isLoading, error } = useWebsites();

  return (
    <>
      <PageHeader
        title="Websites"
        description="Universal CMS can manage more than one website. Most installations only need the default workspace."
        actions={
          <Button asChild>
            <Link href="/websites/new">
              <Plus />
              New website
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading websites">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-lg border border-border bg-surface" />
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {error.message}
        </p>
      ) : null}

      {websites && websites.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Globe />
          </span>
          <CardTitle>No websites yet</CardTitle>
          <CardDescription className="max-w-sm">
            Create a new website, or connect one you already have, to start managing its content, team and settings.
          </CardDescription>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/websites/new?mode=create">Create a website</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/websites/new?mode=connect">Connect existing website</Link>
            </Button>
          </div>
        </Card>
      ) : null}

      {websites && websites.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {websites.map((site) => (
            <li key={site.slug}>
              <Link href={`/websites/${site.slug}`} className="block h-full rounded-lg focus-visible:outline-offset-4">
                <Card className="h-full transition-colors hover:border-accent">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="truncate text-base">{site.name}</CardTitle>
                      {site.role ? <Badge variant="accent">{ROLE_LABELS[site.role as WebsiteRole]}</Badge> : null}
                    </div>
                    <CardDescription className="truncate">
                      {WEBSITE_TYPES.find((type) => type.value === site.website_type)?.label} ·{" "}
                      {site.primary_domain || "No domain yet"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Badge variant={site.status === "active" ? "success" : "default"}>
                      {site.status === "active" ? "Active" : "Archived"}
                    </Badge>
                    {site.source === "connected" ? <Badge>Connected</Badge> : null}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
