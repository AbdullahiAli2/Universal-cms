"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/lib/queries";

/** Opens the default workspace's dashboard. Nobody has to create or connect a website first. */
export default function HomePage() {
  const router = useRouter();
  const { data, error } = useWorkspace();

  useEffect(() => {
    if (data?.website) router.replace(`/websites/${data.website.slug}`);
  }, [data, router]);

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        {error.message}
      </p>
    );
  }
  if (data && !data.website) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-8 text-center">
        <CardTitle>No workspace yet</CardTitle>
        <CardDescription className="mt-2">
          Your account is not part of a website yet. Ask an administrator to add you under Settings → Users.
        </CardDescription>
      </Card>
    );
  }
  return <PageSkeleton />;
}
