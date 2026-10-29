"use client";

import { Loader2 } from "lucide-react";
import { use } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConnectionCard } from "@/components/websites/connection-card";
import { ApiError } from "@/lib/api";
import { useDashboard, useUpdateWebsite } from "@/lib/queries";
import { FRAMEWORKS, can, type Website } from "@/lib/types";
import { PageSkeleton } from "@/components/ui/skeleton";

/**
 * Optional: details for connecting a website that already exists. Nothing here is required to use the CMS,
 * and nothing is installed on the website; its developers use these values to read content from the API.
 */
export default function IntegrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data, error, isLoading } = useDashboard(slug);

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        {error.message}
      </p>
    );
  }
  if (isLoading || !data) return <PageSkeleton />;

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Optional. Connect a website you already have, built with Next.js, React, Vue or anything else. Its code is never changed."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <ConnectionCard website={data.website} connection={data.connection} slug={slug} />
        <FrontendForm key={data.website.updated_at} website={data.website} />
      </div>
    </>
  );
}

function FrontendForm({ website }: { website: Website }) {
  const update = useUpdateWebsite(website.slug);
  const editable = can(website, "settings.manage");
  const form = useForm({ defaultValues: { frontend_url: website.frontend_url, frontend_framework: website.frontend_framework } });
  const { errors, isDirty, isSubmitting } = form.formState;

  async function save(values: { frontend_url: string; frontend_framework: string }) {
    try {
      await update.mutateAsync({ frontend_url: values.frontend_url.trim(), frontend_framework: values.frontend_framework });
      toast.success("Saved.");
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [key, messages] of Object.entries(error.fields)) {
          form.setError(key as "frontend_url" | "frontend_framework", { message: messages[0] });
        }
        if (!Object.keys(error.fields).length) toast.error(error.message);
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your website</CardTitle>
        <CardDescription>
          {editable ? "Where your existing website lives and what it is built with. For your team's reference." : "Your role cannot change these."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(save)} noValidate className="grid gap-4">
          <fieldset disabled={!editable || isSubmitting} className="contents">
            <Field id="frontend_url" label="Website address" error={errors.frontend_url?.message} hint="For example https://www.example.org.">
              <Input type="url" placeholder="https://" {...form.register("frontend_url")} />
            </Field>
            <Field id="frontend_framework" label="Built with" error={errors.frontend_framework?.message}>
              <Select {...form.register("frontend_framework")}>
                <option value="">Not sure</option>
                {FRAMEWORKS.map((framework) => (
                  <option key={framework.value} value={framework.value}>
                    {framework.label}
                  </option>
                ))}
              </Select>
            </Field>
            {editable ? (
              <div className="flex justify-end">
                <Button type="submit" disabled={!isDirty || isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                  Save
                </Button>
              </div>
            ) : null}
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
