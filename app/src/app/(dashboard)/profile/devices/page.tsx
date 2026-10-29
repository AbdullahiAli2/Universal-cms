"use client";

import { ArrowLeft, Laptop, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ProfileHeader } from "@/components/profile/profile-header";
import { signOut } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";
import { useMe, useRevokeSession, useSessions } from "@/lib/queries";
import type { UserSession } from "@/lib/types";
import { cn, timeAgo, userLocale } from "@/lib/utils";

/** Every browser and device signed in to your account, with a way to sign each one out. */
export default function ActiveDevicesPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: sessions, isLoading } = useSessions();
  const revoke = useRevokeSession();
  const others = sessions?.filter((session) => !session.current).length ?? 0;

  async function end(session: UserSession) {
    try {
      await revoke.mutateAsync(session.id);
      if (session.current) {
        router.replace("/login");
        router.refresh();
        return;
      }
      toast.success("Device signed out.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign it out.");
    }
  }

  async function endOthers() {
    const result = await revoke.mutateAsync("others").catch(() => null);
    if (result) toast.success(`Signed out ${result.ended} other device${result.ended === 1 ? "" : "s"}.`);
  }

  if (!me) return <PageSkeleton />;

  return (
    <div className="grid gap-5">
      <Link href="/profile" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> My profile
      </Link>
      <ProfileHeader me={me} action="profile" />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Active devices</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Browsers and devices signed in to your account. Sessions end by themselves after 14 days. If you don&apos;t recognise one,
              sign it out and change your password.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {others > 0 ? (
              <Button variant="outline" disabled={revoke.isPending} onClick={endOthers}>
                <ShieldCheck /> Sign out other devices
              </Button>
            ) : null}
            <Button variant="outline" className="text-danger hover:bg-danger-soft" onClick={() => signOut(router)}>
              <LogOut /> Log out
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3 p-6">
            {[0, 1].map((item) => (
              <Skeleton key={item} className="h-16" />
            ))}
          </div>
        ) : null}

        <ul className="divide-y divide-border">
          {sessions?.map((session) => {
            const Icon = session.device === "Phone" || session.device === "Tablet" ? Smartphone : Laptop;
            return (
              <li key={session.id} className={cn("flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between", session.current && "bg-success-soft/30")}>
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      session.current ? "bg-success-soft text-success" : "bg-surface-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {session.user_agent ? `${session.browser} on ${session.os}` : "Unknown device"}
                      {session.current ? <Badge variant="success">This device</Badge> : null}
                    </p>
                    <p className="truncate text-sm text-muted-foreground" title={session.user_agent}>
                      {session.ip_address || "Unknown address"}
                      {session.ip_note ? ` (${session.ip_note})` : ""} · signed in{" "}
                      {new Intl.DateTimeFormat(userLocale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.created_at))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.device} · last active {timeAgo(session.last_used_at)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start text-danger hover:bg-danger-soft sm:self-center"
                  disabled={revoke.isPending}
                  onClick={() => end(session)}
                >
                  {session.current ? "Sign out here" : "Sign out device"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
