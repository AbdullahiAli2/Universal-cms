"use client";

import { Loader2, Lock, RotateCcw } from "lucide-react";
import { use, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRoles, useUpdateRole, useWebsite } from "@/lib/queries";
import type { RoleInfo, WebsiteRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function RolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: website } = useWebsite(slug);
  const { data, error, isLoading } = useRoles(slug);
  const [selected, setSelected] = useState<WebsiteRole>("editor");

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
        {error.message}
      </p>
    );
  }
  if (isLoading || !data || !website) return <PageSkeleton />;
  const role = data.roles.find((item) => item.key === selected) ?? data.roles[0];

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Choose what each role can do on this website. Changes apply to everyone with that role at once."
      />
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardContent className="p-2">
            <ul className="grid gap-1" role="listbox" aria-label="Roles">
              {data.roles.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.key === role.key}
                    onClick={() => setSelected(item.key)}
                    className={cn(
                      "w-full rounded-md px-3 py-2.5 text-left transition-colors",
                      item.key === role.key ? "bg-accent-soft" : "hover:bg-surface-muted",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("text-sm font-medium", item.key === role.key && "text-accent")}>{item.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.member_count} {item.member_count === 1 ? "user" : "users"}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <RoleEditor
          key={`${role.key}-${role.permissions.join(",")}`}
          slug={slug}
          role={role}
          catalog={data.catalog}
          canManage={data.can_manage}
          mine={new Set(website.permissions)}
        />
      </div>
    </>
  );
}

function RoleEditor({
  slug,
  role,
  catalog,
  canManage,
  mine,
}: {
  slug: string;
  role: RoleInfo;
  catalog: NonNullable<ReturnType<typeof useRoles>["data"]>["catalog"];
  canManage: boolean;
  mine: Set<string>;
}) {
  const update = useUpdateRole(slug);
  const initial = useMemo(() => new Set(role.permissions), [role.permissions]);
  const [checked, setChecked] = useState<Set<string>>(initial);
  const editable = canManage && role.editable;
  const dirty = checked.size !== initial.size || [...checked].some((code) => !initial.has(code));

  useEffect(() => setChecked(new Set(role.permissions)), [role.permissions]);

  // Unchecked boxes you could not grant stay locked; you can always remove a permission.
  const lockedFor = (code: string) => !editable || (!checked.has(code) && !mine.has(code));

  function toggle(code: string, on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  function toggleMany(codes: string[], on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      for (const code of codes) {
        if (on && !mine.has(code) && !current.has(code)) continue;
        if (on) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  }

  async function save() {
    try {
      await update.mutateAsync({ role: role.key, permissions: [...checked].sort() });
      toast.success(`${role.label} permissions saved.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            {role.label}
            {!role.editable ? (
              <Badge className="gap-1">
                <Lock className="size-3" /> Fixed
              </Badge>
            ) : role.customised ? (
              <Badge variant="accent">Customised</Badge>
            ) : (
              <Badge>Default</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {!role.editable
              ? "Owners always have every permission, so this role cannot be changed."
              : !canManage
                ? "Your role cannot change permissions. You can see them here."
                : "Tick what this role may do. Greyed-out boxes are permissions you do not have yourself."}
          </CardDescription>
        </div>
        {editable ? (
          <div className="flex gap-2">
            <Button variant="ghost" disabled={!dirty || update.isPending} onClick={() => setChecked(new Set(initial))}>
              <RotateCcw /> Undo changes
            </Button>
            <Button disabled={!dirty || update.isPending} onClick={save}>
              {update.isPending ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Content</h3>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Content type</th>
                  {catalog.content_actions.map((action) => {
                    const codes = catalog.content_types.map((type) => `content.${type.key}.${action.key}`);
                    const all = codes.every((code) => checked.has(code));
                    return (
                      <th key={action.key} scope="col" className="px-3 py-2 text-center font-medium">
                        <label className="inline-flex cursor-pointer flex-col items-center gap-1">
                          {action.label}
                          <input
                            type="checkbox"
                            aria-label={`${action.label} for every content type`}
                            className="size-4 accent-[var(--accent)]"
                            checked={all}
                            disabled={!editable}
                            onChange={(event) => toggleMany(codes, event.target.checked)}
                          />
                        </label>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {catalog.content_types.map((type) => (
                  <tr key={type.key}>
                    <th scope="row" className="px-3 py-2.5 text-left font-medium">{type.name}</th>
                    {catalog.content_actions.map((action) => {
                      const code = `content.${type.key}.${action.key}`;
                      return (
                        <td key={action.key} className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${action.label}: ${type.name}`}
                            className="size-4 accent-[var(--accent)]"
                            checked={checked.has(code)}
                            disabled={lockedFor(code)}
                            onChange={(event) => toggle(code, event.target.checked)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Anyone who can create a type can also edit, delete and submit their own drafts of it.
          </p>
        </section>

        <div className="grid gap-6 md:grid-cols-3">
          {catalog.groups.map((group) => (
            <section key={group.name}>
              <h3 className="mb-2 text-sm font-semibold">{group.name}</h3>
              <ul className="grid gap-2">
                {group.permissions.map((permission) => (
                  <li key={permission.code}>
                    <label className={cn("flex items-start gap-2 text-sm", lockedFor(permission.code) && !checked.has(permission.code) && "text-muted-foreground")}>
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-[var(--accent)]"
                        checked={checked.has(permission.code)}
                        disabled={lockedFor(permission.code)}
                        onChange={(event) => toggle(permission.code, event.target.checked)}
                      />
                      {permission.label}
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
