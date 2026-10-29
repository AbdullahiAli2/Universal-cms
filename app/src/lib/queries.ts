"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError, messageFrom } from "./api";
import type {
  AuditEntry,
  Branding,
  EmailSettings,
  InviteResult,
  RolesResponse,
  UserSession,
  Workspace,
  ContentTypeInfo,
  CurrentUser,
  Dashboard,
  Entry,
  EntryAction,
  EntryListItem,
  Domain,
  GrowthReport,
  MediaAsset,
  MediaKind,
  MediaPage,
  MediaUsage,
  Member,
  Paginated,
  Revision,
  SeoSettings,
  Website,
  WebsiteRole,
} from "./types";

export const queryKeys = {
  me: ["me"] as const,
  workspace: ["workspace"] as const,
  sessions: ["sessions"] as const,
  emailSettings: ["email-settings"] as const,
  roles: (slug: string) => ["roles", slug] as const,
  websites: ["websites"] as const,
  website: (slug: string) => ["website", slug] as const,
  dashboard: (slug: string) => ["dashboard", slug] as const,
  members: (slug: string) => ["members", slug] as const,
  audit: (slug: string) => ["audit", slug] as const,
  contentTypes: (slug: string) => ["content-types", slug] as const,
  entries: (slug: string) => ["entries", slug] as const,
  entry: (slug: string, id: number) => ["entry", slug, id] as const,
  revisions: (slug: string, id: number) => ["revisions", slug, id] as const,
  media: (slug: string) => ["media", slug] as const,
  mediaItem: (slug: string, id: number) => ["media-item", slug, id] as const,
  branding: (slug: string) => ["branding", slug] as const,
  domains: (slug: string) => ["domains", slug] as const,
  seo: (slug: string) => ["seo", slug] as const,
  growth: (slug: string) => ["growth", slug] as const,
};

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api<CurrentUser>("auth/me/") });
}

export function useWebsites() {
  return useQuery({
    queryKey: queryKeys.websites,
    queryFn: () => api<Paginated<Website>>("websites/"),
    select: (page) => page.results,
  });
}

export function useWebsite(slug: string) {
  return useQuery({
    queryKey: queryKeys.website(slug),
    queryFn: () => api<Website>(`websites/${slug}/`),
    retry: false,
  });
}

export function useDashboard(slug: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(slug),
    queryFn: () => api<Dashboard>(`websites/${slug}/dashboard/`),
    retry: false,
  });
}

export function useMembers(slug: string, search = "", enabled = true) {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return useQuery({
    queryKey: [...queryKeys.members(slug), search],
    queryFn: () => api<Member[]>(`websites/${slug}/members/${query}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export interface AuditFilters {
  action?: string;
  actor?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  scope?: "all" | "";
  page?: number;
}

export function useAuditLog(slug: string, filters: AuditFilters = {}, enabled = true) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && !(key === "page" && value === 1)) params.set(key, String(value));
  }
  return useQuery({
    queryKey: [...queryKeys.audit(slug), filters],
    queryFn: () => api<Paginated<AuditEntry>>(`websites/${slug}/audit-logs/?${params}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useCreateWebsite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Website>("websites/", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.websites }),
  });
}

export function useUpdateWebsite(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Website>(`websites/${slug}/`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.website(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.websites });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(slug) });
    },
  });
}

export function useDeleteWebsite(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`websites/${slug}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.website(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.websites });
    },
  });
}

function useMemberInvalidation(slug: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.members(slug) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(slug) });
    queryClient.invalidateQueries({ queryKey: queryKeys.audit(slug) });
  };
}

export function useInviteMember(slug: string) {
  const invalidate = useMemberInvalidation(slug);
  return useMutation({
    mutationFn: (body: { email: string; role: WebsiteRole; first_name?: string; last_name?: string }) =>
      api<InviteResult>(`websites/${slug}/members/`, { method: "POST", body }),
    onSuccess: invalidate,
  });
}

export function useChangeMemberRole(slug: string) {
  const invalidate = useMemberInvalidation(slug);
  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: WebsiteRole }) =>
      api<Member>(`websites/${slug}/members/${id}/`, { method: "PATCH", body: { role } }),
    onSuccess: invalidate,
  });
}

export function useUpdateMember(slug: string) {
  const invalidate = useMemberInvalidation(slug);
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; role?: WebsiteRole; first_name?: string; last_name?: string; is_active?: boolean }) =>
      api<Member>(`websites/${slug}/members/${id}/`, { method: "PATCH", body }),
    onSuccess: invalidate,
  });
}

export function useResendInvitation(slug: string) {
  return useMutation({
    mutationFn: (id: number) =>
      api<{ invite_url: string; email_sent: boolean; email_error: string }>(`websites/${slug}/members/${id}/invitation/`, { method: "POST", body: {} }),
  });
}

export function useRemoveMember(slug: string) {
  const invalidate = useMemberInvalidation(slug);
  return useMutation({
    mutationFn: (id: number) => api<void>(`websites/${slug}/members/${id}/`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// --- Content -----------------------------------------------------------------

export function useContentTypes(slug: string) {
  return useQuery({
    queryKey: queryKeys.contentTypes(slug),
    queryFn: () => api<ContentTypeInfo[]>(`websites/${slug}/content-types/`),
    retry: false,
  });
}

export interface EntryFilters {
  type: string;
  status?: string;
  search?: string;
  page?: number;
}

export function useEntries(slug: string, filters: EntryFilters) {
  const params = new URLSearchParams({ type: filters.type });
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  return useQuery({
    queryKey: [...queryKeys.entries(slug), filters],
    queryFn: () => api<Paginated<EntryListItem>>(`websites/${slug}/entries/?${params}`),
    placeholderData: (previous) => previous,
  });
}

export function useEntry(slug: string, id: number | null) {
  return useQuery({
    queryKey: queryKeys.entry(slug, id ?? 0),
    queryFn: () => api<Entry>(`websites/${slug}/entries/${id}/`),
    enabled: id !== null,
    retry: false,
  });
}

export function useRevisions(slug: string, id: number | null) {
  return useQuery({
    queryKey: queryKeys.revisions(slug, id ?? 0),
    queryFn: () => api<Revision[]>(`websites/${slug}/entries/${id}/revisions/`),
    enabled: id !== null,
  });
}

/** After any content change: lists, counts, the dashboard and the activity log may all be stale. */
function useContentInvalidation(slug: string) {
  const queryClient = useQueryClient();
  return (entry?: Entry) => {
    if (entry) queryClient.setQueryData(queryKeys.entry(slug, entry.id), entry);
    for (const key of [queryKeys.entries(slug), queryKeys.contentTypes(slug), queryKeys.dashboard(slug), queryKeys.audit(slug), queryKeys.growth(slug), queryKeys.media(slug)]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    if (entry) queryClient.invalidateQueries({ queryKey: queryKeys.revisions(slug, entry.id) });
  };
}

export type EntryInput = { title: string; slug?: string; summary?: string; body?: string; data?: Record<string, unknown> };

export function useCreateEntry(slug: string) {
  const invalidate = useContentInvalidation(slug);
  return useMutation({
    mutationFn: (body: EntryInput & { type: string }) => api<Entry>(`websites/${slug}/entries/`, { method: "POST", body }),
    onSuccess: invalidate,
  });
}

export function useUpdateEntry(slug: string, id: number) {
  const invalidate = useContentInvalidation(slug);
  return useMutation({
    mutationFn: (body: Partial<EntryInput> & { version: number }) =>
      api<Entry>(`websites/${slug}/entries/${id}/`, { method: "PATCH", body }),
    onSuccess: invalidate,
  });
}

export function useTransitionEntry(slug: string, id: number) {
  const invalidate = useContentInvalidation(slug);
  return useMutation({
    mutationFn: (body: { action: EntryAction; version: number; publish_at?: string }) =>
      api<Entry>(`websites/${slug}/entries/${id}/transition/`, { method: "POST", body }),
    onSuccess: invalidate,
  });
}

export function useDeleteEntry(slug: string, id: number) {
  const queryClient = useQueryClient();
  const invalidate = useContentInvalidation(slug);
  return useMutation({
    mutationFn: () => api<void>(`websites/${slug}/entries/${id}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.entry(slug, id) });
      invalidate();
    },
  });
}

export function useRestoreRevision(slug: string, id: number) {
  const invalidate = useContentInvalidation(slug);
  return useMutation({
    mutationFn: ({ revisionId, version }: { revisionId: number; version: number }) =>
      api<Entry>(`websites/${slug}/entries/${id}/revisions/${revisionId}/restore/`, { method: "POST", body: { version } }),
    onSuccess: invalidate,
  });
}

// --- Media -----------------------------------------------------------------------

export type MediaSort = "recent" | "newest" | "oldest" | "name" | "-name" | "size";

export function useMedia(slug: string, filters: { kind?: MediaKind | ""; search?: string; page?: number; sort?: MediaSort } = {}) {
  const params = new URLSearchParams();
  if (filters.sort && filters.sort !== "recent") params.set("sort", filters.sort);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.search) params.set("search", filters.search);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  return useQuery({
    queryKey: [...queryKeys.media(slug), filters],
    queryFn: () => api<MediaPage>(`websites/${slug}/media/?${params}`),
    placeholderData: (previous) => previous,
  });
}

/** Specific files by id, for showing what a field has selected. */
export function useMediaByIds(slug: string, ids: number[]) {
  const key = [...ids].sort((a, b) => a - b).join(",");
  return useQuery({
    queryKey: [...queryKeys.media(slug), "ids", key],
    queryFn: () => api<MediaPage>(`websites/${slug}/media/?ids=${key}`),
    enabled: ids.length > 0,
    select: (page) => new Map(page.results.map((asset) => [asset.id, asset])),
  });
}

export function useMediaItem(slug: string, id: number | null) {
  return useQuery({
    queryKey: queryKeys.mediaItem(slug, id ?? 0),
    queryFn: () => api<MediaAsset & { used_in: MediaUsage[] }>(`websites/${slug}/media/${id}/`),
    enabled: id !== null,
    retry: false,
  });
}

function useMediaInvalidation(slug: string) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [queryKeys.media(slug), queryKeys.audit(slug), queryKeys.growth(slug)]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    queryClient.invalidateQueries({ queryKey: ["media-item", slug] });
  };
}

/** Uploads one file as multipart form data. The API decides the file type from its contents. */
export function useUploadMedia(slug: string) {
  const invalidate = useMediaInvalidation(slug);
  return useMutation({
    mutationFn: async ({ file, alt_text }: { file: File; alt_text?: string }) => {
      const form = new FormData();
      form.append("file", file);
      if (alt_text) form.append("alt_text", alt_text);
      const response = await fetch(`/api/proxy/websites/${slug}/media`, { method: "POST", body: form, credentials: "same-origin" });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const { message, fields } = messageFrom(data, response.status);
        throw new ApiError(response.status === 413 ? "That file is too large." : message, response.status, fields);
      }
      return data as MediaAsset;
    },
    onSuccess: invalidate,
  });
}

export function useAddVideo(slug: string) {
  const invalidate = useMediaInvalidation(slug);
  return useMutation({
    mutationFn: (body: { embed_url: string; title: string }) => api<MediaAsset>(`websites/${slug}/media/`, { method: "POST", body }),
    onSuccess: invalidate,
  });
}

export function useUpdateMedia(slug: string, id: number) {
  const invalidate = useMediaInvalidation(slug);
  return useMutation({
    mutationFn: (body: Partial<Pick<MediaAsset, "title" | "alt_text" | "caption" | "credit" | "focal_point" | "embed_url">>) =>
      api<MediaAsset>(`websites/${slug}/media/${id}/`, { method: "PATCH", body }),
    onSuccess: invalidate,
  });
}

export function useDeleteMedia(slug: string, id: number) {
  const invalidate = useMediaInvalidation(slug);
  return useMutation({
    mutationFn: () => api<void>(`websites/${slug}/media/${id}/`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// --- Branding and domains ---------------------------------------------------------

export function useBranding(slug: string) {
  return useQuery({ queryKey: queryKeys.branding(slug), queryFn: () => api<Branding>(`websites/${slug}/branding/`) });
}

export function useUpdateBranding(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Omit<Branding, "assets" | "options" | "updated_at">>) =>
      api<Branding>(`websites/${slug}/branding/`, { method: "PATCH", body }),
    onSuccess: (branding) => {
      queryClient.setQueryData(queryKeys.branding(slug), branding);
      for (const key of [queryKeys.audit(slug), queryKeys.growth(slug), queryKeys.media(slug)]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useDomains(slug: string) {
  return useQuery({ queryKey: queryKeys.domains(slug), queryFn: () => api<Domain[]>(`websites/${slug}/domains/`) });
}

function useDomainInvalidation(slug: string) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [queryKeys.domains(slug), queryKeys.website(slug), queryKeys.websites, queryKeys.dashboard(slug), queryKeys.audit(slug)]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function useAddDomain(slug: string) {
  const invalidate = useDomainInvalidation(slug);
  return useMutation({
    mutationFn: (hostname: string) => api<Domain>(`websites/${slug}/domains/`, { method: "POST", body: { hostname } }),
    onSuccess: invalidate,
  });
}

export function useDomainAction(slug: string) {
  const invalidate = useDomainInvalidation(slug);
  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "verify" | "make-primary" | "remove" }): Promise<Domain | null> => {
      if (action === "remove") {
        await api<void>(`websites/${slug}/domains/${id}/`, { method: "DELETE" });
        return null;
      }
      return api<Domain>(`websites/${slug}/domains/${id}/${action}/`, { method: "POST", body: {} });
    },
    onSuccess: invalidate,
  });
}

// --- SEO and growth ---------------------------------------------------------------

export function useSeoSettings(slug: string) {
  return useQuery({ queryKey: queryKeys.seo(slug), queryFn: () => api<SeoSettings>(`websites/${slug}/seo/`) });
}

export function useUpdateSeoSettings(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Omit<SeoSettings, "updated_at">>) => api<SeoSettings>(`websites/${slug}/seo/`, { method: "PATCH", body }),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.seo(slug), settings);
      queryClient.invalidateQueries({ queryKey: queryKeys.growth(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit(slug) });
    },
  });
}

export function useGrowth(slug: string) {
  return useQuery({ queryKey: queryKeys.growth(slug), queryFn: () => api<GrowthReport>(`websites/${slug}/growth/`) });
}

// --- Workspace, profile and sessions -------------------------------------------------

export function useWorkspace() {
  return useQuery({ queryKey: queryKeys.workspace, queryFn: () => api<Workspace>("workspace/"), staleTime: 60_000 });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<CurrentUser, "first_name" | "last_name" | "username" | "email" | "language" | "theme">> & { current_password?: string }) =>
      api<CurrentUser>("auth/me/", { method: "PATCH", body }),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      api<{ other_sessions_ended: number }>("auth/me/password/", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
  });
}

export function useSessions() {
  return useQuery({ queryKey: queryKeys.sessions, queryFn: () => api<UserSession[]>("auth/sessions/") });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number | "others"): Promise<{ ended: number }> => {
      if (id === "others") return api<{ ended: number }>("auth/sessions/revoke-others/", { method: "POST", body: {} });
      await api<void>(`auth/sessions/${id}/`, { method: "DELETE" });
      return { ended: 1 };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
  });
}

// --- Roles and email ------------------------------------------------------------------

export function useRoles(slug: string) {
  return useQuery({ queryKey: queryKeys.roles(slug), queryFn: () => api<RolesResponse>(`websites/${slug}/roles/`) });
}

export function useUpdateRole(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ role, permissions }: { role: WebsiteRole; permissions: string[] }) =>
      api<{ key: string; permissions: string[] }>(`websites/${slug}/roles/${role}/`, { method: "PUT", body: { permissions } }),
    onSuccess: () => {
      for (const key of [queryKeys.roles(slug), queryKeys.website(slug), queryKeys.contentTypes(slug), queryKeys.workspace, queryKeys.audit(slug)]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useEmailSettings(enabled = true) {
  return useQuery({ queryKey: queryKeys.emailSettings, queryFn: () => api<EmailSettings>("settings/email/"), enabled, retry: false });
}

export function useSaveEmailSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Omit<EmailSettings, "has_password">> & { password?: string }) =>
      api<EmailSettings>("settings/email/", { method: "PUT", body }),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.emailSettings, settings),
  });
}

export function useSendTestEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (to: string) => api<{ ok: boolean; error: string; settings: EmailSettings }>("settings/email/test/", { method: "POST", body: { to } }),
    onSuccess: (result) => queryClient.setQueryData(queryKeys.emailSettings, result.settings),
  });
}

/** Uploads a profile photo (cropped to a square by the API) or removes it. */
export function useAvatar() {
  const queryClient = useQueryClient();
  const done = (user: CurrentUser) => {
    queryClient.setQueryData(queryKeys.me, user);
    queryClient.invalidateQueries({ queryKey: ["audit"] });
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("avatar", file);
      const response = await fetch("/api/proxy/auth/me/avatar", { method: "POST", body: form, credentials: "same-origin" });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const { message, fields } = messageFrom(data, response.status);
        throw new ApiError(response.status === 413 ? "That photo is too large." : message, response.status, fields);
      }
      return data as CurrentUser;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api<CurrentUser>("auth/me/avatar/", { method: "DELETE" }),
    onSuccess: done,
  });
  return { upload, remove };
}
