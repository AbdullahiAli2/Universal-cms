export type WebsiteRole = "owner" | "admin" | "editor" | "author" | "viewer";

export const WEBSITE_TYPES = [
  { value: "news", label: "News and magazine" },
  { value: "blog", label: "Blog" },
  { value: "corporate", label: "Corporate" },
  { value: "events", label: "Events" },
  { value: "publications", label: "Publications" },
  { value: "docs", label: "Documentation" },
  { value: "custom", label: "Custom" },
] as const;

export type WebsiteType = (typeof WEBSITE_TYPES)[number]["value"];

/** What an existing frontend is built with. Stored for reference; the CMS never touches frontend code. */
export const FRAMEWORKS = [
  { value: "nextjs", label: "Next.js" },
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "nuxt", label: "Nuxt" },
  { value: "angular", label: "Angular" },
  { value: "svelte", label: "Svelte or SvelteKit" },
  { value: "astro", label: "Astro" },
  { value: "static", label: "Static HTML" },
  { value: "mobile", label: "Mobile app" },
  { value: "other", label: "Other" },
] as const;

export type Framework = (typeof FRAMEWORKS)[number]["value"];
export type WebsiteSource = "created" | "connected";

export const ROLE_LABELS: Record<WebsiteRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  author: "Author",
  viewer: "Viewer",
};

const ROLE_RANK: Record<WebsiteRole, number> = { viewer: 1, author: 2, editor: 3, admin: 4, owner: 5 };

/** Mirrors the API's role ranks. Only for showing or hiding controls; the API enforces every rule. */
export function roleAtLeast(role: WebsiteRole | null | undefined, minimum: WebsiteRole): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export type Language = "en" | "so" | "ar";
export type ThemePreference = "system" | "light" | "dark";

export interface CurrentUser {
  id: number;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  full_name: string;
  username: string | null;
  language: Language;
  theme: ThemePreference;
  is_superuser: boolean;
  date_joined: string;
  last_login: string | null;
  /** Dashboard path of the profile photo, or null for initials. */
  avatar_url: string | null;
}

/** Whether the signed-in user has a permission on this website. The API enforces it; this only hides controls. */
export function can(website: { permissions?: string[] } | null | undefined, code: string): boolean {
  return !!website?.permissions?.includes(code);
}

export interface Website {
  id: number;
  name: string;
  slug: string;
  description: string;
  website_type: WebsiteType;
  default_language: string;
  primary_domain: string | null;
  timezone: string;
  status: "active" | "archived";
  source: WebsiteSource;
  frontend_url: string;
  frontend_framework: Framework | "";
  is_default: boolean;
  role: WebsiteRole | null;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  website: Website | null;
  website_count: number;
}

export type MemberStatus = "active" | "invited" | "disabled";

export interface Member {
  id: number;
  user_id: number;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  username: string | null;
  role: WebsiteRole;
  is_active: boolean;
  is_superuser: boolean;
  last_login: string | null;
  status: MemberStatus;
  avatar_url: string | null;
  created_at: string;
}

export interface InviteResult extends Member {
  invite_url?: string;
  email_sent?: boolean;
  email_error?: string;
}

export interface RoleInfo {
  key: WebsiteRole;
  label: string;
  description: string;
  member_count: number;
  permissions: string[];
  editable: boolean;
  customised: boolean;
}

export interface RolesResponse {
  roles: RoleInfo[];
  can_manage: boolean;
  catalog: {
    content_actions: { key: string; label: string }[];
    content_types: { key: string; name: string }[];
    groups: { name: string; permissions: { code: string; label: string }[] }[];
  };
}

export interface UserSession {
  id: number;
  created_at: string;
  last_used_at: string;
  user_agent: string;
  ip_address: string;
  current: boolean;
  browser: string;
  os: string;
  device: string;
  ip_note: string;
}

export interface EmailSettings {
  enabled: boolean;
  provider: string;
  host: string;
  port: number;
  security: "starttls" | "ssl" | "none";
  username: string;
  has_password: boolean;
  from_name: string;
  from_email: string;
  reply_to: string;
  timeout: number;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string;
  updated_by_email: string | null;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  created_at: string;
  action: string;
  module: string;
  actor_email: string | null;
  actor: { id: number; email: string; name: string; username: string | null; avatar_url: string | null } | null;
  target_type: string;
  target_id: string;
  summary: string;
  method: string;
  path: string;
  ip_address: string;
  user_agent: string;
  website_name: string | null;
  /** Plain-language description of the action, e.g. "Edited content". */
  action_label: string;
  target_label: string;
  /** Parsed on the server from the user agent. */
  browser: string;
  os: string;
  device: string;
  /** e.g. "This computer (local development)" or "Private network". */
  ip_note: string;
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  available?: boolean;
  note?: string;
}

export interface Dashboard {
  website: Website;
  stats: {
    members: number;
    by_role: Record<WebsiteRole, number>;
    content: Record<EntryStatus, number>;
    articles_published: number;
    upcoming_scheduled: number;
  };
  needs_attention: AttentionItem[];
  overview: DashboardOverview;
  /** api_base_url is empty until the administrator sets CMS_PUBLIC_API_URL. */
  connection: { api_base_url: string; website_id: string };
  setup_checklist: ChecklistItem[];
  recent_activity: AuditEntry[];
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type EntryStatus = "draft" | "in_review" | "scheduled" | "published" | "archived";

export const ENTRY_STATUSES: { value: EntryStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export type FieldKind = "text" | "textarea" | "url" | "date" | "datetime" | "number" | "boolean" | "image" | "document" | "gallery";

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldKind;
  required: boolean;
  help?: string;
}

export interface ContentTypeInfo {
  key: string;
  name: string;
  singular_name: string;
  description: string;
  is_builtin: boolean;
  fields: FieldDefinition[];
  counts: Partial<Record<EntryStatus | "total", number>>;
  can_create: boolean;
}

export type EntryAction = "submit" | "withdraw" | "publish" | "schedule" | "unpublish" | "archive" | "restore";

export interface Person {
  id: number;
  email: string;
  display_name: string;
}

export interface EntryListItem {
  id: number;
  type: string;
  type_name: string;
  title: string;
  slug: string;
  summary: string;
  status: EntryStatus;
  publish_at: string | null;
  published_at: string | null;
  author: Person | null;
  version: number;
  created_at: string;
  updated_at: string;
  allowed_actions: EntryAction[];
  can_edit: boolean;
}

export interface Entry extends EntryListItem {
  body: string;
  data: Record<string, string | number | boolean | number[]>;
  seo: EntrySeo;
  can_delete: boolean;
  updated_by_email: string | null;
}

export interface Revision {
  id: number;
  version: number;
  title: string;
  summary: string;
  status: EntryStatus;
  note: string;
  created_by_email: string | null;
  created_at: string;
}

export interface AttentionItem {
  id: number;
  title: string;
  status: EntryStatus;
  type: string;
  type_name: string;
  author_email: string | null;
  updated_at: string;
}

// --- Media ---------------------------------------------------------------------

export type MediaKind = "image" | "document" | "video";

export interface MediaAsset {
  id: number;
  kind: MediaKind;
  title: string;
  /** For files: a path served by the dashboard (/media/…). For videos: the embed address. */
  url: string;
  /** Absolute file address for websites, once CMS_PUBLIC_API_URL is set. */
  public_url: string | null;
  embed_url: string;
  original_name: string;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  alt_text: string;
  caption: string;
  credit: string;
  focal_point: string;
  uploaded_by_email: string | null;
  created_at: string;
  updated_at: string;
  can_change: boolean;
}

export interface MediaUsage {
  kind: "entry" | "branding";
  id: number | null;
  type: string;
  title: string;
}

export interface MediaPage extends Paginated<MediaAsset> {
  totals: { all: number; image: number; document: number; video: number; bytes: number };
}

// --- Branding and domains --------------------------------------------------------

export interface SocialLink {
  network: string;
  url: string;
}

export type BrandingImageField = "logo" | "logo_reversed" | "icon" | "share_image";

export interface Branding {
  tagline: string;
  logo: number | null;
  logo_reversed: number | null;
  icon: number | null;
  share_image: number | null;
  primary_color: string;
  accent_color: string;
  heading_font: string;
  body_font: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  office_hours: string;
  maps_url: string;
  socials: SocialLink[];
  updated_at: string;
  assets: Record<BrandingImageField, MediaAsset | null>;
  options: { fonts: string[]; social_networks: string[] };
}

export interface Domain {
  id: number;
  hostname: string;
  is_primary: boolean;
  verified_at: string | null;
  last_checked_at: string | null;
  last_error: string;
  record_name: string;
  record_value: string;
  created_at: string;
}

// --- SEO and growth --------------------------------------------------------------

export interface EntrySeo {
  title?: string;
  description?: string;
  image?: number;
  canonical_url?: string;
  noindex?: boolean;
}

export interface SeoSettings {
  title_template: string;
  default_description: string;
  allow_indexing: boolean;
  google_site_verification: string;
  bing_site_verification: string;
  ga4_measurement_id: string;
  plausible_domain: string;
  updated_at: string;
}

export interface SeoIssue {
  entry_id: number;
  type: string;
  title: string;
  code: string;
  message: string;
}

export interface GrowthReport {
  output: { types: string[]; weeks: ({ week: string } & Record<string, number | string>)[] };
  seo_health: {
    checked: number;
    healthy: number;
    issues: SeoIssue[];
    issue_counts: Record<string, number>;
    images_without_alt: number;
    indexing_allowed: boolean;
    has_default_description: boolean;
    has_share_image: boolean;
  };
  sitemap: { count: number; entries: { type: string; slug: string; title: string; updated_at: string }[] };
  analytics: { ga4_measurement_id: string; plausible_domain: string; connected: boolean };
}

export interface DashboardOverview {
  tiles: {
    articles_published: number;
    articles_last_30: number;
    /** Percent change against the 30 days before; null when there is nothing to compare with. */
    articles_change: number | null;
    upcoming_events: number;
    publications_total: number;
    publications_published: number;
    media_files: number;
  };
  activity: { date: string; created: number; published: number }[];
  output: GrowthReport["output"];
  seo: {
    checked: number;
    healthy: number;
    issue_counts: Record<string, number>;
    images_without_alt: number;
    issues: SeoIssue[];
  };
  scheduled: { id: number; title: string; type: string; type_name: string; publish_at: string }[];
}
