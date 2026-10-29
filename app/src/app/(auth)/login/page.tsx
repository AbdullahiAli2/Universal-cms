"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CircleAlert, Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { loginSchema, type LoginValues } from "@/lib/schemas";
import { messageFrom } from "@/lib/api";
import { safeNextPath } from "@/lib/utils";

/** Shown after a no-JavaScript sign-in fails. The codes never carry the email or password. */
const FORM_ERRORS: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  throttled: "Too many sign-in attempts. Wait a minute and try again.",
  unavailable: "Sign-in is unavailable right now. Try again shortly.",
};

/** Generic wording, so the page never hints at whether an account exists. */
function loginErrorMessage(data: unknown, status: number): string {
  if (status === 400 || status === 401) return FORM_ERRORS.invalid;
  if (status === 429) return FORM_ERRORS.throttled;
  if (status >= 500) return FORM_ERRORS.unavailable;
  return messageFrom(data, status).message;
}

export default function LoginPage() {
  const router = useRouter();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code && FORM_ERRORS[code]) form.setError("root", { message: FORM_ERRORS[code] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(values: LoginValues) {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      form.setError("root", { message: loginErrorMessage(data, response.status) });
      form.resetField("password");
      return;
    }
    // Only follow same-site paths from the ?next= parameter, never external URLs.
    router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    router.refresh();
  }

  return (
    <div className="animate-rise w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-lg shadow-black/5 sm:p-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Sign in to manage your websites and content.</p>
      </div>

      {/* method and action matter if the form is submitted before JavaScript loads: the browser then
          POSTs to the session route instead of putting the email and password in the page URL. */}
      <form
        method="post"
        action="/api/session"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="grid gap-5"
      >
        {errors.root?.message ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-3 text-sm text-danger"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{errors.root.message}</span>
          </div>
        ) : null}

        <Field id="email" label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            icon={Mail}
            className="h-11 rounded-lg"
            {...form.register("email")}
          />
        </Field>

        <Field id="password" label="Password" error={errors.password?.message}>
          <PasswordInput autoComplete="current-password" placeholder="Enter your password" {...form.register("password")} />
        </Field>

        <Button type="submit" className="group mt-1 h-11 w-full rounded-lg text-[15px] shadow-sm" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground">
        Trouble signing in? Ask your CMS administrator to check your account.
      </p>
    </div>
  );
}
