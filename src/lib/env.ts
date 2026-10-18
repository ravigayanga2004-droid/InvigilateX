import { z } from "zod";
export function environment() {
  return z.object({
    DATABASE_URL: z.url(), APP_URL: z.url(), SESSION_SECRET: z.string().min(32),
    CRON_SECRET: z.string().min(32),
  }).parse(process.env);
}
