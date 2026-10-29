"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { WebsiteForm } from "@/components/websites/website-form";
import { useDeleteWebsite, useUpdateWebsite, useWebsite } from "@/lib/queries";
import type { WebsiteValues } from "@/lib/schemas";
import { ROLE_LABELS, can, type WebsiteRole } from "@/lib/types";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function WebsiteSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { data: website, isLoading, error } = useWebsite(slug);
  const update = useUpdateWebsite(slug);
  const remove = useDeleteWebsite(slug);

  const role = (website?.role ?? null) as WebsiteRole | null;
  const canManage = can(website, "settings.manage");
  // The default workspace is where the dashboard opens, so it cannot be deleted.
  const canDelete = role === "owner" && !website?.is_default;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  async function save(values: WebsiteValues) {
    await update.mutateAsync(values);
    toast.success("Settings saved.");
  }

  async function deleteWebsite() {
    await remove.mutateAsync();
    toast.success("Website deleted.");
    router.replace("/websites");
    router.refresh();
  }

  if (isLoading) return <PageSkeleton />;
  if (error || !website) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        {error?.message ?? "Website not found."}
      </p>
    );
  }

  return (
    <>
      <PageHeader
        title="General settings"
        description={`${website.name}${website.is_default ? " · default workspace" : ""}`}
        actions={
          <>
            {role ? <Badge variant="accent">{ROLE_LABELS[role]}</Badge> : null}
            <Button variant="outline" asChild>
              <Link href={`/websites/${slug}`}>Back to overview</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              {canManage ? "Name, type, domain and regional settings." : "Your role does not allow changing these settings."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WebsiteForm
              key={website.updated_at}
              defaultValues={{
                name: website.name,
                website_type: website.website_type,
                description: website.description,
                primary_domain: website.primary_domain ?? "",
                default_language: website.default_language,
                timezone: website.timezone,
                frontend_url: website.frontend_url,
                frontend_framework: website.frontend_framework,
              }}
              mode={website.source === "connected" ? "edit-connected" : "edit"}
              submitLabel="Save changes"
              submit={save}
              disabled={!canManage}
            />
          </CardContent>
        </Card>

        {canDelete ? (
          <Card className="border-danger/40">
            <CardHeader>
              <CardTitle className="text-danger">Delete website</CardTitle>
              <CardDescription>
                Removes this website, its team memberships and its settings. The activity log entry for the deletion is
                kept. This cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-end">
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                  Delete website
                </Button>
                <DialogContent>
                  <DialogTitle>Delete {website.name}?</DialogTitle>
                  <DialogDescription>Type the website name to confirm.</DialogDescription>
                  <Field id="confirm-name" label={`Type “${website.name}” to confirm`}>
                    <Input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" />
                  </Field>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={confirmName !== website.name || remove.isPending}
                      onClick={deleteWebsite}
                    >
                      {remove.isPending ? <Loader2 className="animate-spin" /> : null}
                      Delete permanently
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardFooter>
          </Card>
        ) : null}
      </div>
    </>
  );
}
