"use client";

import {
  type LucideIcon,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronDown,
  File,
  Globe,
  History,
  Image as ImageIcon,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MonitorSmartphone,
  Moon,
  Newspaper,
  Palette,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";

import { NavigationProgress } from "@/components/shell/navigation-progress";
import { Button } from "@/components/ui/button";
import { useContentTypes, useMe, useUpdateMe, useWebsite, useWebsites, useWorkspace } from "@/lib/queries";
import { can, type Website } from "@/lib/types";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

const WEBSITE_PATH = /^\/websites\/([^/]+)/;
const NOT_A_SLUG = new Set(["new"]);

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  onNavigate,
  count,
  nested = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  onNavigate: () => void;
  count?: number;
  nested?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
        nested && "pl-8",
        active &&
          "bg-accent-soft font-medium text-accent before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-accent hover:bg-accent-soft hover:text-accent",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {count !== undefined ? <span className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span> : null}
    </Link>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">{children}</p>
  );
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  article: Newspaper,
  event: CalendarDays,
  publication: BookOpen,
  page: File,
};

/** The website the sidebar links to: the one in the address, else the default workspace. */
function useCurrentSlug(pathname: string) {
  const fromPath = pathname.match(WEBSITE_PATH)?.[1];
  const { data: workspace } = useWorkspace();
  if (fromPath && !NOT_A_SLUG.has(fromPath)) return fromPath;
  return workspace?.website?.slug;
}

function WebsiteNav({
  website,
  pathname,
  onNavigate,
  isSuperuser,
  websiteCount,
}: {
  website: Website;
  pathname: string;
  onNavigate: () => void;
  isSuperuser: boolean;
  websiteCount: number;
}) {
  const { data: types } = useContentTypes(website.slug);
  const base = `/websites/${website.slug}`;
  const settingsBase = `${base}/settings`;
  const [adminOpen, setAdminOpen] = useState(true);
  const showAdmin = can(website, "roles.manage") || can(website, "users.manage") || can(website, "audit.view");
  const at = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <SectionLabel>Overview</SectionLabel>
      <NavLink href={base} icon={LayoutDashboard} label="Dashboard" active={pathname === base} onNavigate={onNavigate} />

      <SectionLabel>Content</SectionLabel>
      {types?.map((type) => {
        const href = `${base}/content/${type.key}`;
        return (
          <NavLink
            key={type.key}
            href={href}
            icon={TYPE_ICONS[type.key] ?? Layers}
            label={type.name}
            count={type.counts.total ?? 0}
            active={at(href)}
            onNavigate={onNavigate}
          />
        );
      })}
      <NavLink href={`${base}/media`} icon={ImageIcon} label="Media Library" active={at(`${base}/media`)} onNavigate={onNavigate} />

      <SectionLabel>Growth</SectionLabel>
      <NavLink href={`${base}/growth`} icon={BarChart3} label="SEO & Analytics" active={at(`${base}/growth`)} onNavigate={onNavigate} />

      <SectionLabel>Settings</SectionLabel>
      <NavLink href={settingsBase} icon={SlidersHorizontal} label="General" active={pathname === settingsBase} onNavigate={onNavigate} />
      {showAdmin ? (
        <>
          <button
            type="button"
            onClick={() => setAdminOpen((open) => !open)}
            aria-expanded={adminOpen}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <ShieldCheck className="size-4 shrink-0" />
            <span className="truncate">Administration Panel</span>
            <ChevronDown className={cn("ml-auto size-4 transition-transform", !adminOpen && "-rotate-90")} aria-hidden />
          </button>
          {adminOpen ? (
            <>
              {can(website, "roles.manage") || can(website, "users.manage") ? (
                <NavLink nested href={`${settingsBase}/roles`} icon={KeyRound} label="Roles & Permissions" active={at(`${settingsBase}/roles`)} onNavigate={onNavigate} />
              ) : null}
              <NavLink nested href={`${settingsBase}/users`} icon={Users} label="Users" active={at(`${settingsBase}/users`)} onNavigate={onNavigate} />
              {can(website, "audit.view") ? (
                <NavLink nested href={`${settingsBase}/audit-logs`} icon={History} label="Audit Logs" active={at(`${settingsBase}/audit-logs`)} onNavigate={onNavigate} />
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <NavLink href={`${settingsBase}/users`} icon={Users} label="Users" active={at(`${settingsBase}/users`)} onNavigate={onNavigate} />
      )}
      {isSuperuser ? <NavLink href="/settings/email" icon={Mail} label="Email Plugin" active={at("/settings/email")} onNavigate={onNavigate} /> : null}
      <NavLink href={`${settingsBase}/integrations`} icon={Plug} label="Integrations" active={at(`${settingsBase}/integrations`)} onNavigate={onNavigate} />
      <NavLink href={`${base}/branding`} icon={Palette} label="Branding & domains" active={at(`${base}/branding`)} onNavigate={onNavigate} />
      {isSuperuser || websiteCount > 1 ? (
        <NavLink href="/websites" icon={Globe} label="Websites" active={pathname === "/websites" || pathname === "/websites/new"} onNavigate={onNavigate} />
      ) : null}
    </>
  );
}

function Sidebar({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  const slug = useCurrentSlug(pathname);
  const { data: website } = useWebsite(slug ?? "");
  const { data: workspace } = useWorkspace();
  const { data: me } = useMe();
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-0.5 p-3">
      <Link href="/" onClick={onNavigate} className="mb-1 flex items-center gap-2.5 rounded-lg px-2 py-2 font-semibold tracking-tight">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground shadow-sm shadow-accent/30">U</span>
        Universal CMS
      </Link>
      {website ? (
        <WebsiteNav
          website={website}
          pathname={pathname}
          onNavigate={onNavigate}
          isSuperuser={!!me?.is_superuser}
          websiteCount={workspace?.website_count ?? 1}
        />
      ) : null}
    </nav>
  );
}

/** The current website: a switcher when there are several, otherwise just its name. */
function WebsiteSwitcher({ slug }: { slug: string }) {
  const router = useRouter();
  const { data: websites } = useWebsites();
  const { data: current } = useWebsite(slug);
  if (!websites || websites.length < 2) {
    return current ? (
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{current.name}</span>
      </span>
    ) : null;
  }
  return (
    <select
      aria-label="Current website"
      value={slug}
      onChange={(event) => router.push(`/websites/${event.target.value}`)}
      className="h-9 max-w-[240px] cursor-pointer truncate rounded-lg border border-border bg-surface px-2.5 text-sm font-medium shadow-xs hover:border-muted-foreground/40"
    >
      {websites.map((site) => (
        <option key={site.slug} value={site.slug}>
          {site.name}
        </option>
      ))}
    </select>
  );
}

/** Applies the saved theme once per sign-in, and saves changes made with the header toggle. */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { data: me } = useMe();
  const update = useUpdateMe();
  const applied = useRef(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (me && !applied.current) {
      applied.current = true;
      setTheme(me.theme);
    }
    // Dates and times follow the language preference. Interface text is English for now, so direction stays ltr.
    if (me) document.documentElement.lang = me.language;
  }, [me, setTheme]);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        setTheme(next);
        if (me) update.mutate({ theme: next });
      }}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

/** Avatar menu: who you are, your role, and quick links to your profile, devices and sign-out. */
function UserMenu({ slug }: { slug?: string }) {
  const router = useRouter();
  const { data: user } = useMe();
  const { data: website } = useWebsite(slug ?? "");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!user) return null;
  const name = user.full_name || user.email;
  const role = user.is_superuser ? "Super admin" : website?.role ? website.role : null;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm transition-colors hover:bg-surface-muted"
      >
        <UserAvatar name={name} src={user.avatar_url} size="sm" />
        <span className="hidden max-w-40 truncate font-medium sm:inline">{name}</span>
        <ChevronDown className={cn("hidden size-4 text-muted-foreground transition-transform sm:block", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="dialog-content absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-xl shadow-black/10">
          <div className="flex items-start gap-3 border-b border-border px-4 py-3">
            <UserAvatar name={name} src={user.avatar_url} size="lg" />
            <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            {role ? (
              <span className="mt-2 inline-block rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {role}
              </span>
            ) : null}
            </div>
          </div>
          <div className="grid p-1.5">
            <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-muted">
              <UserRound className="size-4 text-muted-foreground" /> Profile settings
            </Link>
            <Link role="menuitem" href="/profile/devices" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-muted">
              <MonitorSmartphone className="size-4 text-muted-foreground" /> Active devices
            </Link>
          </div>
          <div className="border-t border-border p-1.5">
            <button role="menuitem" type="button" onClick={() => signOut(router)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft">
              <LogOut className="size-4" /> Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export async function signOut(router: ReturnType<typeof useRouter>) {
  await fetch("/api/session", { method: "DELETE" });
  router.replace("/login");
  router.refresh();
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const slug = useCurrentSlug(pathname);

  return (
    <div className="grid min-h-dvh md:grid-cols-[256px_minmax(0,1fr)]">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <aside className="hidden border-r border-border bg-surface md:sticky md:top-0 md:block md:h-dvh md:overflow-y-auto">
        <Sidebar pathname={pathname} onNavigate={() => undefined} />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-border bg-surface shadow-lg">
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                <X />
              </Button>
            </div>
            <Sidebar pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/85 px-4 backdrop-blur-md sm:px-5 lg:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu />
          </Button>
          {slug ? <WebsiteSwitcher slug={slug} /> : null}
          <div className="flex-1" />
          <ThemeToggle />
          <UserMenu slug={slug} />
        </header>
        <main id="main" className="w-full min-w-0 flex-1 px-4 py-5 sm:px-5 lg:px-6">
          {/* Full width, like the V3 body. Keyed by path so each page fades in on arrival. */}
          <div key={pathname} className="page-in w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
