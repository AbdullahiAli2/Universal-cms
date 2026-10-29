"use client";

import { Check, KeyRound, Languages, Loader2, Monitor, Moon, Palette, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { AvatarEditor } from "@/components/profile/avatar-editor";
import { ProfileHeader } from "@/components/profile/profile-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { useChangePassword, useMe, useUpdateMe } from "@/lib/queries";
import type { CurrentUser, Language, ThemePreference } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "personal" | "preferences" | "password";
const TABS: { key: Tab; label: string; icon: typeof UserRound }[] = [
  { key: "personal", label: "Personal information", icon: UserRound },
  { key: "preferences", label: "Preferences", icon: Palette },
  { key: "password", label: "Password", icon: KeyRound },
];

function placeErrors<T extends object>(error: unknown, form: { setError: (key: keyof T & string, value: { message: string }) => void }, keys: string[]) {
  if (error instanceof ApiError) {
    let placed = false;
    for (const [key, messages] of Object.entries(error.fields)) {
      if (keys.includes(key)) {
        form.setError(key as keyof T & string, { message: messages[0] });
        placed = true;
      }
    }
    if (!placed) toast.error(error.message);
  } else {
    toast.error("Something went wrong. Try again.");
  }
}

export default function ProfilePage() {
  const { data: me, error } = useMe();
  const [tab, setTab] = useState<Tab>("personal");

  // Deep links such as /profile#password open the right tab.
  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "") as Tab;
    if (TABS.some((item) => item.key === fromHash)) setTab(fromHash);
  }, []);

  function choose(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
  }

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        {error.message}
      </p>
    );
  }
  if (!me) return <PageSkeleton />;

  return (
    <div className="grid gap-5">
      <ProfileHeader me={me} action="devices" />

      <div role="tablist" aria-label="Profile sections" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none]">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => choose(item.key)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === item.key ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="page-in" key={tab}>
        {tab === "personal" ? <PersonalInfo key={`${me.email}-${me.first_name}-${me.last_name}-${me.username}`} me={me} /> : null}
        {tab === "preferences" ? <Preferences me={me} /> : null}
        {tab === "password" ? <ChangePassword /> : null}
      </div>
    </div>
  );
}

/** A titled card: heading and explanation on top, fields below across the full width. */
function Section({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card>
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-5 p-6">{children}</div>
      {footer ? <div className="flex items-center justify-end gap-3 rounded-b-xl border-t border-border bg-surface-muted/30 px-6 py-3.5">{footer}</div> : null}
    </Card>
  );
}

interface PersonalValues {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  current_password: string;
}

function PersonalInfo({ me }: { me: CurrentUser }) {
  const update = useUpdateMe();
  const form = useForm<PersonalValues>({
    defaultValues: { first_name: me.first_name, last_name: me.last_name, username: me.username ?? "", email: me.email, current_password: "" },
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const emailChanged = form.watch("email").trim().toLowerCase() !== me.email.toLowerCase();

  async function save(values: PersonalValues) {
    const { current_password, ...rest } = values;
    try {
      await update.mutateAsync(emailChanged ? { ...rest, current_password } : { first_name: rest.first_name, last_name: rest.last_name, username: rest.username });
      toast.success("Profile saved.");
    } catch (error) {
      placeErrors<PersonalValues>(error, form, ["first_name", "last_name", "username", "email", "current_password"]);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(save)} noValidate>
      <Section
        title="Personal information"
        description="Your name and username appear to your team, in the activity log and on content you write."
        footer={
          <>
            {isDirty ? <span className="text-sm text-muted-foreground">Unsaved changes</span> : null}
            <Button type="button" variant="ghost" disabled={!isDirty || isSubmitting} onClick={() => form.reset()}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isDirty || isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Save changes
            </Button>
          </>
        }
      >
        <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <AvatarEditor me={me} />
          <div className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="first_name" label="First name" error={errors.first_name?.message}>
                <Input placeholder="Your first name" autoComplete="given-name" {...form.register("first_name")} />
              </Field>
              <Field id="last_name" label="Last name" error={errors.last_name?.message}>
                <Input placeholder="Your last name" autoComplete="family-name" {...form.register("last_name")} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="username" label="Username" error={errors.username?.message} hint="Optional. Lowercase letters, numbers, dots, dashes or underscores.">
                <Input placeholder="e.g. amara.okafor" autoComplete="username" {...form.register("username")} />
              </Field>
              <Field id="email" label="Email address" error={errors.email?.message} hint="You sign in with this address.">
                <Input placeholder="you@example.org" type="email" autoComplete="email" {...form.register("email")} />
              </Field>
            </div>
            {emailChanged ? (
              <div className="rounded-lg border border-warning/30 bg-warning-soft/50 p-4">
                <Field id="current_password" label="Confirm with your current password" error={errors.current_password?.message} hint="Needed because your email is also your sign-in name.">
                  <PasswordInput placeholder="Your current password" autoComplete="current-password" {...form.register("current_password")} />
                </Field>
              </div>
            ) : null}
          </div>
        </div>
      </Section>
    </form>
  );
}

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun; preview: string }[] = [
  { value: "light", label: "Light", icon: Sun, preview: "bg-[#f7f8fa]" },
  { value: "dark", label: "Dark", icon: Moon, preview: "bg-[#161920]" },
  { value: "system", label: "Match device", icon: Monitor, preview: "bg-[linear-gradient(135deg,#f7f8fa_50%,#161920_50%)]" },
];

const LANGUAGES: { value: Language; label: string; native: string }[] = [
  { value: "en", label: "English", native: "English" },
  { value: "so", label: "Somali", native: "Soomaali" },
  { value: "ar", label: "Arabic", native: "العربية" },
];

function Preferences({ me }: { me: CurrentUser }) {
  const update = useUpdateMe();
  const { setTheme } = useTheme();

  async function save(change: { language?: Language; theme?: ThemePreference }) {
    if (change.theme) setTheme(change.theme);
    try {
      await update.mutateAsync(change);
      toast.success("Preference saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    }
  }

  return (
    <div className="grid gap-5">
      <Section title="Appearance" description="Choose how the dashboard looks. Saved to your account, so it follows you to other devices.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Appearance">
          {THEMES.map((item) => {
            const active = me.theme === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => save({ theme: item.value })}
                className={cn(
                  "group relative overflow-hidden rounded-xl border-2 text-left transition-all",
                  active ? "border-accent shadow-sm" : "border-border hover:border-muted-foreground/40",
                )}
              >
                {/* A tiny picture of the dashboard in that theme. */}
                <div className={cn("h-20 border-b border-border p-2.5", item.preview)} aria-hidden>
                  <div className="flex h-full gap-1.5">
                    <div className="w-1/4 rounded bg-white/70 mix-blend-luminosity" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <div className="h-2 w-2/3 rounded bg-accent/70" />
                      <div className="flex-1 rounded bg-white/60 mix-blend-luminosity" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <item.icon className="size-4 text-muted-foreground" /> {item.label}
                  </span>
                  {active ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Language" description="Used for dates and times across the dashboard. The interface text is in English for now.">
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Language">
          {LANGUAGES.map((item) => {
            const active = me.language === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => save({ language: item.value })}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors",
                  active ? "border-accent bg-accent-soft/50" : "border-border hover:border-muted-foreground/40",
                )}
              >
                <span>
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.native}</span>
                </span>
                {active ? <Check className="size-4 text-accent" /> : <Languages className="size-4 text-muted-foreground/50" />}
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

interface PasswordValues {
  current_password: string;
  new_password: string;
  confirm: string;
}

/** Rough strength from length and character variety, to guide people towards a better password. */
function strength(password: string) {
  if (!password) return { score: 0, label: "" };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  let score = password.length >= 12 ? 1 : 0;
  if (password.length >= 14) score += 1;
  if (variety >= 3) score += 1;
  if (password.length >= 18 && variety >= 3) score += 1;
  return { score, label: ["Too short", "Fair", "Good", "Strong", "Very strong"][score] };
}

function ChangePassword() {
  const change = useChangePassword();
  const form = useForm<PasswordValues>({ defaultValues: { current_password: "", new_password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;
  const meter = strength(form.watch("new_password"));

  async function save(values: PasswordValues) {
    if (values.new_password !== values.confirm) {
      form.setError("confirm", { message: "The passwords do not match." });
      return;
    }
    try {
      const result = await change.mutateAsync({ current_password: values.current_password, new_password: values.new_password });
      form.reset();
      toast.success(
        result.other_sessions_ended
          ? `Password changed. Signed out ${result.other_sessions_ended} other session${result.other_sessions_ended === 1 ? "" : "s"}.`
          : "Password changed.",
      );
    } catch (error) {
      placeErrors<PasswordValues>(error, form, ["current_password", "new_password"]);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(save)} noValidate>
      <Section
        title="Change password"
        description="Use at least 12 characters. A few unrelated words make a strong password. Your other devices are signed out when you change it."
        footer={
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Update password
          </Button>
        }
      >
        <div className="grid gap-5 lg:w-[calc(50%-10px)]">
          <Field id="pw-current" label="Current password" error={errors.current_password?.message}>
            <PasswordInput placeholder="Your current password" autoComplete="current-password" {...form.register("current_password", { required: "Enter your current password." })} />
          </Field>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <Field id="pw-new" label="New password" error={errors.new_password?.message}>
            <PasswordInput
              placeholder="At least 12 characters"
              autoComplete="new-password"
              {...form.register("new_password", { required: "Choose a new password.", minLength: { value: 12, message: "Use at least 12 characters." } })}
            />
          </Field>
          {meter.label ? (
            <div className="flex items-center gap-3" aria-live="polite">
              <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
                {[1, 2, 3, 4].map((step) => (
                  <span
                    key={step}
                    className={cn(
                      "h-1.5 rounded-full transition-colors",
                      step <= meter.score ? (meter.score <= 1 ? "bg-warning" : "bg-success") : "bg-surface-muted",
                    )}
                  />
                ))}
              </div>
              <span className={cn("w-20 text-right text-xs font-medium", meter.score <= 1 ? "text-warning" : "text-success")}>{meter.label}</span>
            </div>
          ) : null}
        </div>
        <Field id="pw-confirm" label="Confirm new password" error={errors.confirm?.message}>
          <PasswordInput placeholder="Type the new password again" autoComplete="new-password" {...form.register("confirm", { required: "Type the new password again." })} />
        </Field>
        </div>
      </Section>
    </form>
  );
}
