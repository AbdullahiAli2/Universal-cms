"use client";

import { use } from "react";

import { EntryEditor } from "@/components/content/entry-editor";
import { useContentTypes, useEntry, useWebsite } from "@/lib/queries";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function EditEntryPage({ params }: { params: Promise<{ slug: string; type: string; id: string }> }) {
  const { slug, type, id } = use(params);
  const entryId = /^\d+$/.test(id) ? Number(id) : null;
  const { data: website } = useWebsite(slug);
  const { data: types } = useContentTypes(slug);
  const { data: entry, error } = useEntry(slug, entryId);
  const contentType = types?.find((item) => item.key === type);

  if (entryId === null || error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        {error?.message ?? "Entry not found."}
      </p>
    );
  }
  if (!website || !types || !entry) return <PageSkeleton />;
  if (!contentType || entry.type !== type) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        Entry not found.
      </p>
    );
  }
  return (
    <EntryEditor
      key={entry.id}
      website={website}
      contentType={contentType}
      entry={entry}
      canCreate={contentType.can_create}
    />
  );
}
