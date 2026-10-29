"use client";

import { use } from "react";

import { EntryEditor } from "@/components/content/entry-editor";
import { useContentTypes, useWebsite } from "@/lib/queries";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function NewEntryPage({ params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type } = use(params);
  const { data: website, error } = useWebsite(slug);
  const { data: types } = useContentTypes(slug);
  const contentType = types?.find((item) => item.key === type);

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        {error.message}
      </p>
    );
  }
  if (!website || !types) return <PageSkeleton />;
  if (!contentType) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        This content type does not exist on this website.
      </p>
    );
  }
  return <EntryEditor website={website} contentType={contentType} canCreate={contentType.can_create} />;
}
