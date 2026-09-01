/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  TOURNAMENT_DB: D1Database;
  STORAGE_BACKEND?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
  AUTH_SECRET?: string;
  AUTH_COOKIE_SECURE?: string;
}
