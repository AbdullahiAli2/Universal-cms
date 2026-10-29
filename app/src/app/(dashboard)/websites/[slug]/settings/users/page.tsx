"use client";

import { Ban, CheckCircle2, Copy, Loader2, MailPlus, MoreHorizontal, PencilLine, Search, Send, UserMinus, UserPlus, Users } from "lucide-react";
import { use, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ApiError } from "@/lib/api";
import { useInviteMember, useMe, useMembers, useRemoveMember, useResendInvitation, useUpdateMember, useWebsite } from "@/lib/queries";
import { ROLE_LABELS, can, type Member, type MemberStatus, type WebsiteRole } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const ASSIGNABLE: WebsiteRole[] = ["admin", "editor", "author", "viewer"];
const STATUS: Record<MemberStatus, { label: string; variant: "success" | "warning" | "default" }> = {
  active: { label: "Active", variant: "success" },
  invited: { label: "Invited", variant: "warning" },
  disabled: { label: "Disabled", variant: "default" },
};
type Filter = MemberStatus | "all";

export default function UsersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: website } = useWebsite(slug);
  const { data: me } = useMe();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [link, setLink] = useState<{ url: string; email: string; sent: boolean; error: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: members, error, isLoading } = useMembers(slug, search);
  const canManage = can(website, "users.manage");
  const isOwner = website?.role === "owner";
  const counts = { all: members?.length ?? 0, active: 0, invited: 0, disabled: 0 };
  for (const member of members ?? []) counts[member.status] += 1;
  const shown = (members ?? []).filter((member) => filter === "all" || member.status === filter);

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who can sign in to this website, with their role. Invited people choose their own password."
        actions={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus /> Invite user
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ["all", "All users", Users],
          ["active", "Active", CheckCircle2],
          ["invited", "Invited", Send],
          ["disabled", "Disabled", Ban],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-left transition-colors",
              filter === key ? "border-accent ring-3 ring-accent/10" : "border-border hover:border-muted-foreground/30",
            )}
          >
            <span className={cn("flex size-9 items-center justify-center rounded-lg", filter === key ? "bg-accent-soft text-accent" : "bg-surface-muted text-muted-foreground")}>
              <Icon className="size-4" />
            </span>
            <span>
              <span className="block text-xs text-muted-foreground">{label}</span>
              <span className="block text-lg font-semibold tabular-nums">{counts[key]}</span>
            </span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Input icon={Search} type="search" placeholder="Search by name, email or username" aria-label="Search users" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">
            {shown.length} {shown.length === 1 ? "person" : "people"}
            {filter !== "all" ? ` · ${STATUS[filter].label.toLowerCase()}` : ""}
          </p>
        </div>

        {error ? (
          <p role="alert" className="m-4 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
            {error.message}
          </p>
        ) : null}
        {isLoading ? (
          <div className="grid gap-3 p-4">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-14" />
            ))}
          </div>
        ) : null}

        {members && shown.length === 0 ? (
          <div className="py-12 text-center">
            <CardTitle className="text-base">Nobody here</CardTitle>
            <CardDescription>{search ? "Try another search." : "No users with this status."}</CardDescription>
          </div>
        ) : null}

        {shown.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/50 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="w-[40%] px-4 py-3">User</th>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="hidden px-4 py-3 md:table-cell">Last sign-in</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((member) => (
                  <UserRow
                    key={member.id}
                    slug={slug}
                    member={member}
                    canManage={canManage}
                    isOwner={isOwner}
                    isSuperuser={!!me?.is_superuser}
                    isSelf={me?.id === member.user_id}
                    onEdit={() => setEditing(member)}
                    onLink={setLink}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <InviteDialog slug={slug} open={inviteOpen} onOpenChange={setInviteOpen} isOwner={isOwner} onInvited={setLink} />
      <EditDialog slug={slug} member={editing} onClose={() => setEditing(null)} />
      <LinkDialog link={link} onClose={() => setLink(null)} />
    </>
  );
}

function UserRow({
  slug,
  member,
  canManage,
  isOwner,
  isSuperuser,
  isSelf,
  onEdit,
  onLink,
}: {
  slug: string;
  member: Member;
  canManage: boolean;
  isOwner: boolean;
  isSuperuser: boolean;
  isSelf: boolean;
  onEdit: () => void;
  onLink: (link: { url: string; email: string; sent: boolean; error: string }) => void;
}) {
  const update = useUpdateMember(slug);
  const remove = useRemoveMember(slug);
  const resend = useResendInvitation(slug);
  const name = [member.first_name, member.last_name].filter(Boolean).join(" ") || member.display_name || member.email;
  // Only owners touch owner roles; the API checks this too.
  const roleEditable = canManage && (member.role !== "owner" || isOwner) && !isSelf;
  const canResend = canManage && member.status === "invited";
  const canToggle = isSuperuser && !isSelf && !member.is_superuser;
  const canRemove = canManage && !isSelf && (member.role !== "owner" || isOwner);
  const hasActions = isSuperuser || canResend || canToggle || canRemove;

  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action();
      toast.success(label);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  return (
    <tr className={cn("transition-colors hover:bg-surface-muted/40", member.status === "disabled" && "opacity-60")}>
      <td className="max-w-0 px-4 py-3">
        <div className="flex items-center gap-3">
          <UserAvatar name={name} src={member.avatar_url} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-semibold">
              <span className="truncate">{name}</span>
              {isSelf ? <span className="shrink-0 rounded bg-surface-muted px-1.5 text-[11px] font-medium text-muted-foreground">You</span> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {member.email}
              {member.username ? ` · @${member.username}` : ""}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {roleEditable ? (
          <Select
            aria-label={`Role for ${member.email}`}
            value={member.role}
            disabled={update.isPending}
            onChange={(event) => run("Role changed.", () => update.mutateAsync({ id: member.id, role: event.target.value as WebsiteRole }))}
            className="h-9 w-36"
          >
            {(isOwner ? (["owner", ...ASSIGNABLE] as WebsiteRole[]) : ASSIGNABLE).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        ) : (
          <Badge variant="accent">{ROLE_LABELS[member.role]}</Badge>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={STATUS[member.status].variant}>{STATUS[member.status].label}</Badge>
          {member.is_superuser ? <Badge>Platform admin</Badge> : null}
        </div>
      </td>
      <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell">
        {member.last_login ? timeAgo(member.last_login) : member.status === "invited" ? "Not yet" : "Never"}
      </td>
      <td className="px-4 py-3 text-right">
        {hasActions ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Actions for ${member.email}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              {isSuperuser ? (
                <DropdownMenuItem onSelect={onEdit}>
                  <PencilLine /> Edit name
                </DropdownMenuItem>
              ) : null}
              {canResend ? (
                <DropdownMenuItem
                  onSelect={() =>
                    run("New invitation created.", async () => {
                      const result = await resend.mutateAsync(member.id);
                      onLink({ url: result.invite_url, email: member.email, sent: result.email_sent, error: result.email_error });
                    })
                  }
                >
                  <Send /> Resend invitation
                </DropdownMenuItem>
              ) : null}
              {canToggle ? (
                <DropdownMenuItem
                  onSelect={() =>
                    run(member.is_active ? "Account disabled." : "Account enabled.", () => update.mutateAsync({ id: member.id, is_active: !member.is_active }))
                  }
                >
                  {member.is_active ? <Ban /> : <CheckCircle2 />} {member.is_active ? "Disable account" : "Enable account"}
                </DropdownMenuItem>
              ) : null}
              {canRemove ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem danger onSelect={() => run("Removed from this website.", () => remove.mutateAsync(member.id))}>
                    <UserMinus /> Remove from website
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </td>
    </tr>
  );
}

interface InviteValues {
  email: string;
  first_name: string;
  last_name: string;
  role: WebsiteRole;
}

function InviteDialog({
  slug,
  open,
  onOpenChange,
  isOwner,
  onInvited,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner: boolean;
  onInvited: (link: { url: string; email: string; sent: boolean; error: string }) => void;
}) {
  const invite = useInviteMember(slug);
  const form = useForm<InviteValues>({ defaultValues: { email: "", first_name: "", last_name: "", role: "author" } });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: InviteValues) {
    try {
      const result = await invite.mutateAsync(values);
      form.reset();
      onOpenChange(false);
      if (result.invite_url) {
        onInvited({ url: result.invite_url, email: result.email, sent: !!result.email_sent, error: result.email_error ?? "" });
      } else {
        toast.success(`${result.email} already had an account and now has access.`);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [key, messages] of Object.entries(error.fields)) form.setError(key as keyof InviteValues, { message: messages[0] });
        if (!Object.keys(error.fields).length) toast.error(error.message);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Invite a user</DialogTitle>
        <DialogDescription>
          New people get an invitation to choose their password. Someone who already has an account is given access straight away.
        </DialogDescription>
        <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
          <Field id="invite-email" label="Email" error={errors.email?.message}>
            <Input placeholder="name@example.org" type="email" autoComplete="off" {...form.register("email", { required: "Enter an email address." })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="invite-first" label="First name (optional)">
              <Input placeholder="First name" {...form.register("first_name")} />
            </Field>
            <Field id="invite-last" label="Last name (optional)">
              <Input placeholder="Last name" {...form.register("last_name")} />
            </Field>
          </div>
          <Field id="invite-role" label="Role" error={errors.role?.message} hint="You can change what each role may do in Roles & Permissions.">
            <Select {...form.register("role")}>
              {ASSIGNABLE.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          </Field>
          {!isOwner ? null : <p className="text-xs text-muted-foreground">To add another owner, invite them first, then change their role.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <MailPlus />}
              Send invitation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({ link, onClose }: { link: { url: string; email: string; sent: boolean; error: string } | null; onClose: () => void }) {
  return (
    <Dialog open={link !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{link?.sent ? "Invitation sent" : "Share the invitation link"}</DialogTitle>
        <DialogDescription>
          {link?.sent
            ? `We emailed ${link.email} a link to choose their password. You can also share it yourself.`
            : `The email was not sent${link?.error ? ` (${link.error})` : ""}. Send ${link?.email} this link yourself. It works once, for 7 days.`}
        </DialogDescription>
        <div className="flex gap-2">
          <Input readOnly value={link?.url ?? ""} aria-label="Invitation link" onFocus={(event) => event.target.select()} />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link?.url ?? "");
                toast.success("Link copied.");
              } catch {
                toast.error("Could not copy.");
              }
            }}
          >
            <Copy /> Copy
          </Button>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ slug, member, onClose }: { slug: string; member: Member | null; onClose: () => void }) {
  const update = useUpdateMember(slug);
  const form = useForm<{ first_name: string; last_name: string }>();
  useEffect(() => {
    if (member) form.reset({ first_name: member.first_name, last_name: member.last_name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member]);

  async function submit(values: { first_name: string; last_name: string }) {
    if (!member) return;
    try {
      await update.mutateAsync({ id: member.id, ...values });
      toast.success("Saved.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    }
  }

  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Edit {member?.email}</DialogTitle>
        <DialogDescription>Changes this person&apos;s account on every website they belong to.</DialogDescription>
        <form onSubmit={form.handleSubmit(submit)} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="edit-first" label="First name">
              <Input placeholder="First name" {...form.register("first_name")} />
            </Field>
            <Field id="edit-last" label="Last name">
              <Input placeholder="Last name" {...form.register("last_name")} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
