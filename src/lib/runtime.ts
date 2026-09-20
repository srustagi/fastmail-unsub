import { env } from "cloudflare:workers";

export interface AppEnv {
  DB: D1Database;
  CREDENTIALS_KEY?: string;
  DEV_USER_EMAIL?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export function getEnv(): AppEnv {
  return env as unknown as AppEnv;
}

export function getDb(): D1Database {
  const db = getEnv().DB;

  if (!db) {
    throw new Error("The Cloudflare D1 binding named DB is not configured.");
  }

  return db;
}
