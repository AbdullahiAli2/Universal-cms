"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { messageFrom } from "@/lib/api";
import { setupSchema, type SetupValues } from "@/lib/schemas";

/** First-run setup. Shown only while the installation has no administrator. */
export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const form = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: { display_name: "", email: "", password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    fetch("/api/setup")
      .then((response) => response.json())
      .then((data: { initialized: boolean }) => {
        if (data.initialized) router.replace("/login");
        else setChecking(false);
      })
      .catch(() => form.setError("root", { message: "Could not reach the CMS API. Check that the server is running." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(values: SetupValues) {
    const { confirm: _confirm, ...payload } = values;
    const response = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const { message, fields } = messageFrom(data, response.status);
      for (const [key, messages] of Object.entries(fields)) {
        if (key in values) form.setError(key as keyof SetupValues, { message: messages[0] });
      }
      if (Object.keys(fields).length === 0 || !Object.keys(fields).some((key) => key in values)) {
        form.setError("root", { message });
      }
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (checking) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" /> Checking installation…
      </div>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Set up Universal CMS</CardTitle>
        <CardDescription>
          Create the platform administrator. You can add websites and teammates after you sign in. This page closes once
          the administrator exists.
        </CardDescription>
      </CardHeader>
      <form method="post" action="/api/setup" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent className="grid gap-4">
          <Field id="display_name" label="Your name" error={errors.display_name?.message}>
            <Input placeholder="e.g. Amara Okafor" autoComplete="name" {...form.register("display_name")} />
          </Field>
          <Field id="email" label="Email" error={errors.email?.message}>
            <Input placeholder="you@example.org" type="email" autoComplete="email" {...form.register("email")} />
          </Field>
          <Field id="password" label="Password" error={errors.password?.message} hint="At least 12 characters.">
            <Input placeholder="At least 12 characters" type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          <Field id="confirm" label="Confirm password" error={errors.confirm?.message}>
            <Input placeholder="Type the password again" type="password" autoComplete="new-password" {...form.register("confirm")} />
          </Field>
          {errors.root?.message ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {errors.root.message}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-stretch">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Create administrator
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
