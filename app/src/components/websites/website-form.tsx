"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, type FocusEvent } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { connectWebsiteSchema, websiteSchema, type WebsiteValues } from "@/lib/schemas";
import { FRAMEWORKS, WEBSITE_TYPES } from "@/lib/types";
import { timeZones } from "@/lib/utils";

const DEFAULTS: WebsiteValues = {
  name: "",
  website_type: "news",
  description: "",
  primary_domain: "",
  default_language: "en",
  timezone: "UTC",
  frontend_url: "",
  frontend_framework: "",
};

/**
 * create: a new website, no frontend yet. connect: an existing website, address first.
 * edit / edit-connected: the settings page for each kind.
 */
export type WebsiteFormMode = "create" | "connect" | "edit" | "edit-connected";

const SHARED_FIELDS: (keyof WebsiteValues)[] = ["name", "website_type", "default_language", "timezone", "description"];
const VISIBLE_FIELDS: Record<WebsiteFormMode, (keyof WebsiteValues)[]> = {
  create: [...SHARED_FIELDS, "primary_domain"],
  connect: [...SHARED_FIELDS, "frontend_url", "frontend_framework"],
  edit: [...SHARED_FIELDS, "primary_domain", "frontend_url", "frontend_framework"],
  "edit-connected": [...SHARED_FIELDS, "primary_domain", "frontend_url", "frontend_framework"],
};

/** Host name of an address, or "" while it is incomplete. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function WebsiteForm({
  defaultValues,
  submitLabel,
  submit,
  mode = "create",
  disabled = false,
}: {
  defaultValues?: Partial<WebsiteValues>;
  submitLabel: string;
  submit: (values: WebsiteValues) => Promise<unknown>;
  mode?: WebsiteFormMode;
  disabled?: boolean;
}) {
  const connecting = mode === "connect";
  const requiresAddress = mode === "connect" || mode === "edit-connected";
  const form = useForm<WebsiteValues>({
    resolver: zodResolver(requiresAddress ? connectWebsiteSchema : websiteSchema),
    defaultValues: { ...DEFAULTS, ...defaultValues },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  // Pre-select the browser's time zone for new websites. Done after mount to avoid a server/client mismatch.
  useEffect(() => {
    if (!defaultValues?.timezone) {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (local) form.setValue("timezone", local);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Accepts "example.com" and adds https://, then suggests a name if none was typed yet. */
  function tidyAddress(event: FocusEvent<HTMLInputElement>) {
    let value = event.target.value.trim();
    if (value && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
    if (value !== event.target.value) form.setValue("frontend_url", value, { shouldDirty: true, shouldValidate: true });
    const host = hostOf(value).replace(/^www\./, "");
    if (connecting && host && !form.getValues("name").trim()) {
      form.setValue("name", host, { shouldDirty: true });
    }
  }

  async function onValid(values: WebsiteValues) {
    try {
      await submit(values);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        for (const [key, messages] of Object.entries(error.fields)) {
          if (VISIBLE_FIELDS[mode].includes(key as keyof WebsiteValues)) {
            form.setError(key as keyof WebsiteValues, { message: messages[0] });
          } else {
            toast.error(messages[0]); // a field this form does not show, so the message still reaches the user
          }
        }
      } else {
        toast.error(error instanceof Error ? error.message : "Something went wrong. Try again.");
      }
    }
  }

  const zones = timeZones();
  const address = form.watch("frontend_url");
  const derivedDomain = connecting ? hostOf(address) : "";

  const addressField = (
    <Field
      id="frontend_url"
      label={requiresAddress ? "Website address" : "Website address (optional)"}
      error={errors.frontend_url?.message}
      hint={
        requiresAddress
          ? "Where your site is live today, for example https://www.example.com."
          : "Add it once your site is live."
      }
    >
      <Input
        type="url"
        inputMode="url"
        placeholder="https://www.example.com"
        autoComplete="url"
        autoFocus={connecting}
        {...form.register("frontend_url", { onBlur: tidyAddress })}
      />
    </Field>
  );

  const frameworkField = (
    <Field id="frontend_framework" label="Built with" hint="Optional. Helps your developers. Nothing is installed.">
      <Select {...form.register("frontend_framework")}>
        <option value="">Not sure</option>
        {FRAMEWORKS.map((framework) => (
          <option key={framework.value} value={framework.value}>
            {framework.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <form onSubmit={form.handleSubmit(onValid)} noValidate className="grid gap-5 md:grid-cols-2">
      <fieldset disabled={disabled || isSubmitting} className="contents">
        {connecting ? (
          <>
            <div className="md:col-span-2">{addressField}</div>
            {derivedDomain ? (
              <p className="-mt-3 text-xs text-muted-foreground md:col-span-2">
                Domain: <span className="font-medium text-foreground">{derivedDomain}</span>. You can change it later in
                Settings.
              </p>
            ) : null}
          </>
        ) : null}

        <Field id="name" label="Website name" error={errors.name?.message} hint="Shown in the dashboard and in the API.">
          <Input placeholder={connecting ? "My shop" : "Daily News"} {...form.register("name")} />
        </Field>

        <Field id="website_type" label="Website type" hint="Decides which dashboard widgets appear first.">
          <Select {...form.register("website_type")}>
            {WEBSITE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>

        {connecting ? frameworkField : null}

        {!connecting ? (
          <Field id="primary_domain" label="Primary domain" error={errors.primary_domain?.message} hint="Optional. Host name only.">
            <Input placeholder="news.example.com" autoComplete="off" {...form.register("primary_domain")} />
          </Field>
        ) : null}

        <Field id="default_language" label="Default language" error={errors.default_language?.message} hint="For example en, fr or ar-EG.">
          <Input placeholder="en" autoComplete="off" {...form.register("default_language")} />
        </Field>

        <Field id="timezone" label="Time zone" error={errors.timezone?.message} hint="Used for scheduled publishing.">
          <Select {...form.register("timezone")}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </Field>

        {mode === "edit" || mode === "edit-connected" ? (
          <>
            {addressField}
            {frameworkField}
          </>
        ) : null}

        <div className="md:col-span-2">
          <Field id="description" label="Description" error={errors.description?.message} hint="A short note for your team. Up to 2000 characters.">
            <Textarea rows={3} placeholder="What is this website about?" {...form.register("description")} />
          </Field>
        </div>

        {!disabled ? (
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="submit" disabled={isSubmitting || (!isDirty && !!defaultValues)}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
