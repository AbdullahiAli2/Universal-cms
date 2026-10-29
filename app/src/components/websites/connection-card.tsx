"use client";

import { Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FRAMEWORKS, type Dashboard } from "@/lib/types";

/** Only stored values. The CMS never installs or edits anything on the website itself. */
export function ConnectionCard({
  website,
  connection,
  slug,
}: {
  website: Dashboard["website"];
  connection: Dashboard["connection"];
  slug: string;
}) {
  const framework = FRAMEWORKS.find((item) => item.value === website.frontend_framework)?.label;
  const settingsLink = (
    <Link href={`/websites/${slug}/settings`} className="text-accent hover:underline">
      Add it below
    </Link>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection</CardTitle>
        <CardDescription>
          {website.source === "connected"
            ? "Your existing website, registered with this CMS. Its code stays exactly as it is."
            : "Details your developers need when they build this website."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Website address">
            {website.frontend_url ? (
              <a
                href={website.frontend_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 break-all text-accent hover:underline"
              >
                {website.frontend_url}
                <ExternalLink className="size-3.5 shrink-0" aria-hidden />
              </a>
            ) : (
              <span className="text-muted-foreground">Not added yet. {settingsLink}.</span>
            )}
          </Detail>
          <Detail label="Built with">
            {framework ?? <span className="text-muted-foreground">Not set</span>}
          </Detail>
          <Detail label="Website ID">
            <CopyValue value={connection.website_id} label="website ID" />
          </Detail>
          <Detail label="CMS API address">
            {connection.api_base_url ? (
              <CopyValue value={connection.api_base_url} label="API address" />
            ) : (
              <span className="text-muted-foreground">Not published yet. Your administrator can set CMS_PUBLIC_API_URL.</span>
            )}
          </Detail>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Your website will read its content from this API using the website ID. Content endpoints arrive with the
          content engine in Phase 2.
        </p>
      </CardContent>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Copied the ${label}.`);
    } catch {
      toast.error("Could not copy. Select the text and copy it instead.");
    }
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <code className="truncate rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[13px]">{value}</code>
      <Button type="button" variant="ghost" size="icon" className="size-7" onClick={copy} aria-label={`Copy ${label}`}>
        <Copy />
      </Button>
    </span>
  );
}

