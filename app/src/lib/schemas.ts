import { z } from "zod";

const HOST_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const URL_PATTERN = /^https?:\/\/[^\s/?#@]+(\/[^\s?#]*)?$/i;

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const setupSchema = z
  .object({
    display_name: z.string().trim().min(2, "Enter your name.").max(150),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string().min(12, "Use at least 12 characters."),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });
export type SetupValues = z.infer<typeof setupSchema>;

export const websiteSchema = z.object({
  name: z.string().trim().min(2, "Give the website a name.").max(120, "Keep the name under 120 characters."),
  website_type: z.enum(["news", "blog", "corporate", "events", "publications", "docs", "custom"]),
  description: z.string().max(2000, "Keep the description under 2000 characters."),
  primary_domain: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === "" || HOST_PATTERN.test(value), "Enter a host name only, such as news.example.com."),
  default_language: z
    .string()
    .trim()
    .refine((value) => LANGUAGE_PATTERN.test(value), "Use a language code such as en, fr or ar-EG."),
  timezone: z.string().min(1, "Choose a time zone."),
  frontend_url: z
    .string()
    .trim()
    .refine((value) => value === "" || URL_PATTERN.test(value), "Enter the full address, for example https://www.example.com."),
  frontend_framework: z.enum(["", "nextjs", "react", "vue", "nuxt", "angular", "svelte", "astro", "static", "mobile", "other"]),
});
export type WebsiteValues = z.infer<typeof websiteSchema>;

/** Connecting an existing website: the address is required. */
export const connectWebsiteSchema = websiteSchema.extend({
  frontend_url: websiteSchema.shape.frontend_url.refine((value) => value !== "", "Enter your website's address."),
});

export const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  role: z.enum(["admin", "editor", "author", "viewer"]),
});
export type InviteValues = z.infer<typeof inviteSchema>;
