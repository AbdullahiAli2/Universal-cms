"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { messageFrom } from "@/lib/api";

interface Values {
  first_name: string;
  last_name: string;
  password: string;
  confirm: string;
}

type Invitation = { valid: false } | { valid: true; email: string; first_name: string; last_name: string };

/** Someone invited by an administrator chooses their password here, then lands in the dashboard. */
export default function InvitePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const form = useForm<Values>({ defaultValues: { first_name: "", last_name: "", password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(value);
    // Drop the token from the address bar and history once it has been read.
    window.history.replaceState(null, "", "/invite");
    fetch(`/api/invite?token=${encodeURIComponent(value)}`)
      .then((response) => response.json())
      .then((data: Invitation) => {
        setInvitation(data);
        if (data.valid) form.reset({ first_name: data.first_name, last_name: data.last_name, password: "", confirm: "" });
      })
      .catch(() => setInvitation({ valid: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(values: Values) {
    if (values.password !== values.confirm) {
      form.setError("confirm", { message: "The passwords do not match." });
      return;
    }
    const response = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: values.password, first_name: values.first_name, last_name: values.last_name }),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const { message, fields } = messageFrom(data, response.status);
      if (fields.password) form.setError("password", { message: fields.password[0] });
      else form.setError("root", { message });
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="animate-rise w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-lg shadow-black/5 sm:p-8">
      {invitation === null ? (
        <p className="text-center text-sm text-muted-foreground" role="status">
          Checking your invitation…
        </p>
      ) : !invitation.valid ? (
        <div className="text-center">
          <h1 className="text-xl font-semibold">This link no longer works</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Invitation links work once and expire after 7 days. Ask your administrator to send a new one.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Choose a password for <span className="font-medium text-foreground">{invitation.email}</span>.
            </p>
          </div>
          <form method="post" action="/api/invite" onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            {errors.root?.message ? (
              <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
                {errors.root.message}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Field id="first_name" label="First name">
                <Input placeholder="e.g. Nimco" autoComplete="given-name" {...form.register("first_name")} />
              </Field>
              <Field id="last_name" label="Last name">
                <Input placeholder="e.g. Ali" autoComplete="family-name" {...form.register("last_name")} />
              </Field>
            </div>
            <Field id="password" label="Password" error={errors.password?.message} hint="At least 12 characters.">
              <PasswordInput placeholder="At least 12 characters" autoComplete="new-password" {...form.register("password", { required: "Choose a password.", minLength: { value: 12, message: "Use at least 12 characters." } })} />
            </Field>
            <Field id="confirm" label="Confirm password" error={errors.confirm?.message}>
              <PasswordInput placeholder="Type the password again" autoComplete="new-password" {...form.register("confirm", { required: "Type the password again." })} />
            </Field>
            <Button type="submit" className="mt-1 h-11 w-full rounded-lg" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Set password and continue
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
