import { createServerFn } from "@tanstack/react-start";

/** Supabase's project URL and publishable key are intentionally public client configuration. */
export const getSupabaseBrowserConfig = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Authentication is temporarily unavailable.");
  return { url, key };
});
