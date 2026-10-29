"use client";

import { CalendarDays, Clock, MonitorSmartphone, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AvatarWithCamera } from "@/components/profile/avatar-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CurrentUser } from "@/lib/types";
import { timeAgo, userLocale } from "@/lib/utils";

/** Who you are at a glance: avatar, name, role and account dates. Shared by My Profile and Active devices. */
export function ProfileHeader({ me, action }: { me: CurrentUser; action?: "devices" | "profile" }) {
  const joined = new Intl.DateTimeFormat(userLocale(), { dateStyle: "long" }).format(new Date(me.date_joined));

  return (
    <Card className="overflow-hidden">
      {/* Soft accent banner behind the avatar. */}
      <div className="relative h-28 overflow-hidden bg-gradient-to-r from-accent via-accent/80 to-accent/50" aria-hidden>
        <div className="absolute -right-10 -top-16 size-56 rounded-full bg-white/10" />
        <div className="absolute right-40 top-8 size-32 rounded-full bg-white/10" />
      </div>
      <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <AvatarWithCamera me={me} className="-mt-12 w-fit" />
          <div className="min-w-0 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{me.full_name || "Add your name"}</h1>
              {me.is_superuser ? (
                <Badge variant="accent" className="gap-1">
                  <ShieldCheck className="size-3" /> Super admin
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {me.email}
              {me.username ? ` · @${me.username}` : ""}
            </p>
            <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" aria-hidden /> Member since {joined}
              </span>
              {me.last_login ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden /> Last signed in {timeAgo(me.last_login)}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        {action === "devices" ? (
          <Button variant="outline" asChild>
            <Link href="/profile/devices">
              <MonitorSmartphone /> Active devices
            </Link>
          </Button>
        ) : action === "profile" ? (
          <Button variant="outline" asChild>
            <Link href="/profile">Profile settings</Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
