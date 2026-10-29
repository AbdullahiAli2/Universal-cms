"use client";

import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { useEmailSettings, useMe, useSaveEmailSettings, useSendTestEmail } from "@/lib/queries";
import type { EmailSettings } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/skeleton";

/** Every provider is reached over SMTP; a preset only fills in the usual server details. */
const PRESETS: Record<string, { label: string; host: string; port: number; security: EmailSettings["security"]; username?: string; note?: string }> = {
  smtp: { label: "Other SMTP server", host: "", port: 587, security: "starttls" },
  gmail: { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 587, security: "starttls", note: "Use an app password, not your normal Google password." },
  outlook: { label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: 587, security: "starttls" },
  sendgrid: { label: "SendGrid", host: "smtp.sendgrid.net", port: 587, security: "starttls", username: "apikey", note: "The password is your SendGrid API key." },
  mailgun: { label: "Mailgun", host: "smtp.mailgun.org", port: 587, security: "starttls" },
  ses: { label: "Amazon SES", host: "email-smtp.us-east-1.amazonaws.com", port: 587, security: "starttls", note: "Change the region in the host name to yours." },
  brevo: { label: "Brevo", host: "smtp-relay.brevo.com", port: 587, security: "starttls" },
  postmark: { label: "Postmark", host: "smtp.postmarkapp.com", port: 587, security: "starttls", note: "Use your server API token as both user name and password." },
};

interface Values {
  enabled: boolean;
  provider: string;
  host: string;
  port: number;
  security: EmailSettings["security"];
  username: string;
  password: string;
  clear_password: boolean;
  from_name: string;
  from_email: string;
  reply_to: string;
  timeout: number;
}

function valuesFrom(settings: EmailSettings): Values {
  return {
    enabled: settings.enabled,
    provider: settings.provider || "smtp",
    host: settings.host,
    port: settings.port,
    security: settings.security,
    username: settings.username,
    password: "",
    clear_password: false,
    from_name: settings.from_name,
    from_email: settings.from_email,
    reply_to: settings.reply_to,
    timeout: settings.timeout,
  };
}

export default function EmailPluginPage() {
  const { data: me } = useMe();
  const { data: settings, error, isLoading } = useEmailSettings(!!me?.is_superuser);

  if (me && !me.is_superuser) {
    return (
      <p role="alert" className="rounded-md bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
        Only platform administrators can manage email settings.
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        {error.message}
      </p>
    );
  }
  if (isLoading || !settings) return <PageSkeleton />;

  return (
    <>
      <PageHeader
        title="Email Plugin"
        description="How Universal CMS sends email, such as invitations. Applies to the whole installation."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SettingsForm key={settings.updated_at} settings={settings} />
        <TestCard settings={settings} defaultTo={me?.email ?? ""} />
      </div>
    </>
  );
}

function SettingsForm({ settings }: { settings: EmailSettings }) {
  const save = useSaveEmailSettings();
  const form = useForm<Values>({ defaultValues: valuesFrom(settings) });
  const { errors, isDirty, isSubmitting } = form.formState;
  const provider = form.watch("provider");
  const preset = PRESETS[provider] ?? PRESETS.smtp;

  function applyPreset(key: string) {
    const next = PRESETS[key];
    if (!next || key === "smtp") return;
    form.setValue("host", next.host, { shouldDirty: true });
    form.setValue("port", next.port, { shouldDirty: true });
    form.setValue("security", next.security, { shouldDirty: true });
    if (next.username) form.setValue("username", next.username, { shouldDirty: true });
  }

  async function submit(values: Values) {
    const { password, clear_password, ...rest } = values;
    const body: Parameters<typeof save.mutateAsync>[0] = { ...rest, port: Number(rest.port), timeout: Number(rest.timeout) };
    if (password) body.password = password;
    else if (clear_password) body.password = "";
    try {
      await save.mutateAsync(body);
      toast.success("Email settings saved.");
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [key, messages] of Object.entries(error.fields)) form.setError(key as keyof Values, { message: messages[0] });
        if (!Object.keys(error.fields).length) toast.error(error.message);
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server and sender</CardTitle>
        <CardDescription>The password is stored encrypted and is never shown again.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-5">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" {...form.register("enabled")} />
            <span>
              <span className="font-medium">Send email</span>
              <span className="block text-xs text-muted-foreground">While off, invitations show a link to share instead.</span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="provider" label="Provider" hint={preset.note}>
              <Select {...form.register("provider", { onChange: (event) => applyPreset(event.target.value) })}>
                {Object.entries(PRESETS).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="host" label="SMTP host" error={errors.host?.message}>
              <Input autoComplete="off" placeholder="smtp.example.com" {...form.register("host")} />
            </Field>
            <Field id="port" label="Port" error={errors.port?.message}>
              <Input placeholder="587" type="number" min={1} max={65535} {...form.register("port", { valueAsNumber: true })} />
            </Field>
            <Field id="security" label="Security" error={errors.security?.message}>
              <Select {...form.register("security")}>
                <option value="starttls">STARTTLS (usually port 587)</option>
                <option value="ssl">SSL/TLS (usually port 465)</option>
                <option value="none">None (not recommended)</option>
              </Select>
            </Field>
            <Field id="username" label="User name" error={errors.username?.message}>
              <Input placeholder="Usually your email address or API user" autoComplete="off" {...form.register("username")} />
            </Field>
            <Field
              id="password"
              label="Password or API key"
              error={errors.password?.message}
              hint={settings.has_password ? "A password is saved. Leave empty to keep it." : "Not set."}
            >
              <PasswordInput autoComplete="new-password" placeholder={settings.has_password ? "••••••••" : ""} {...form.register("password")} />
            </Field>
          </div>
          {settings.has_password ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" {...form.register("clear_password")} />
              Remove the saved password
            </label>
          ) : null}

          <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <Field id="from_name" label="Sender name" error={errors.from_name?.message}>
              <Input placeholder="Kaadir Institute" {...form.register("from_name")} />
            </Field>
            <Field id="from_email" label="Sender email" error={errors.from_email?.message} hint="Must be an address your provider lets you send from.">
              <Input type="email" placeholder="no-reply@example.org" {...form.register("from_email")} />
            </Field>
            <Field id="reply_to" label="Reply-to email (optional)" error={errors.reply_to?.message}>
              <Input type="email" placeholder="info@example.org" {...form.register("reply_to")} />
            </Field>
            <Field id="timeout" label="Timeout (seconds)" error={errors.timeout?.message}>
              <Input placeholder="15" type="number" min={3} max={60} {...form.register("timeout", { valueAsNumber: true })} />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {settings.updated_by_email ? `Last changed by ${settings.updated_by_email} ${timeAgo(settings.updated_at)}` : ""}
            </span>
            <Button type="submit" disabled={!isDirty || isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Save settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TestCard({ settings, defaultTo }: { settings: EmailSettings; defaultTo: string }) {
  const test = useSendTestEmail();
  const [to, setTo] = useState(defaultTo);
  useEffect(() => setTo((current) => current || defaultTo), [defaultTo]);

  async function send() {
    try {
      const result = await test.mutateAsync(to);
      if (result.ok) toast.success(`Test email sent to ${to}.`);
      else toast.error(result.error || "Sending failed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sending failed.");
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Send a test email</CardTitle>
        <CardDescription>Uses the saved settings. Save your changes first.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field id="test-to" label="Send to">
          <Input type="email" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Button onClick={send} disabled={!to || test.isPending || !settings.host || !settings.from_email}>
          {test.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          Send test email
        </Button>
        {!settings.host || !settings.from_email ? <p className="text-xs text-muted-foreground">Save a host and sender email first.</p> : null}
        {settings.last_test_at ? (
          <div className="flex items-start gap-2 rounded-md bg-surface-muted p-3 text-sm">
            {settings.last_test_ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />}
            <div>
              <p className="font-medium">{settings.last_test_ok ? "Last test succeeded" : "Last test failed"}</p>
              <p className="text-xs text-muted-foreground">
                {timeAgo(settings.last_test_at)}
                {settings.last_test_error ? ` · ${settings.last_test_error}` : ""}
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
