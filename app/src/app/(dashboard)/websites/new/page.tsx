"use client";

import { ArrowLeft, ChevronRight, Link2, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WebsiteForm } from "@/components/websites/website-form";
import { useCreateWebsite } from "@/lib/queries";
import type { WebsiteValues } from "@/lib/schemas";

type Mode = "create" | "connect";

export default function NewWebsitePage() {
  // useSearchParams needs a Suspense boundary so the page can still be prerendered.
  return (
    <Suspense fallback={null}>
      <NewWebsite />
    </Suspense>
  );
}

function NewWebsite() {
  const params = useSearchParams();
  const raw = params.get("mode");
  const mode: Mode | null = raw === "create" || raw === "connect" ? raw : null;

  if (!mode) return <ChooseMode />;
  return <RegisterWebsite mode={mode} />;
}

function ChooseMode() {
  return (
    <>
      <PageHeader title="Add a website" description="Choose how you want to start. Both take about a minute." />
      <div className="grid gap-4 md:grid-cols-2">
        <ModeOption
          href="/websites/new?mode=create"
          icon={Sparkles}
          title="Create a new website"
          text="Starting from scratch? Set up the content workspace now and build your website later, with any tool or framework."
          points={["Nothing to install", "Invite your team straight away"]}
        />
        <ModeOption
          href="/websites/new?mode=connect"
          icon={Link2}
          title="Connect an existing website"
          text="Already have a site built with Next.js, React, Vue or anything else? Register it here to manage its content."
          points={["Your website's code is not changed", "Just enter its address"]}
        />
      </div>
    </>
  );
}

function ModeOption({
  href,
  icon: Icon,
  title,
  text,
  points,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  text: string;
  points: string[];
}) {
  return (
    <Link href={href} className="group block h-full rounded-lg focus-visible:outline-offset-4">
      <Card className="flex h-full flex-col transition-colors group-hover:border-accent">
        <CardHeader className="gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon className="size-5" aria-hidden />
          </span>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            {title}
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
          </CardTitle>
          <CardDescription>{text}</CardDescription>
        </CardHeader>
        <CardContent className="mt-auto">
          <ul className="grid gap-1 text-sm">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Link>
  );
}

function RegisterWebsite({ mode }: { mode: Mode }) {
  const router = useRouter();
  const create = useCreateWebsite();
  const connecting = mode === "connect";

  async function submit(values: WebsiteValues) {
    const website = await create.mutateAsync({ ...values, source: connecting ? "connected" : "created" });
    toast.success(connecting ? `${website.name} is connected.` : `${website.name} is ready.`);
    router.push(`/websites/${website.slug}`);
  }

  return (
    <>
      <Link
        href="/websites/new"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Choose a different option
      </Link>
      <PageHeader
        title={connecting ? "Connect an existing website" : "New website"}
        description={
          connecting
            ? "Register your website so your team can manage its content here."
            : "Set the basics now. You can change everything later in Settings."
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Website details</CardTitle>
          <CardDescription>
            {connecting
              ? "Universal CMS only saves these details. It does not install anything on your website or change its code."
              : "You become the owner of this website and can invite your team after it is created."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WebsiteForm
            key={mode}
            mode={mode}
            submitLabel={connecting ? "Connect website" : "Create website"}
            submit={submit}
          />
        </CardContent>
      </Card>
    </>
  );
}
