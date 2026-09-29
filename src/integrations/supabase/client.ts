import { createClient } from "@supabase/supabase-js";

import { getSupabaseBrowserConfig } from "@/lib/supabase-config.functions";
import type { Database } from "./types";

let clientPromise: Promise<ReturnType<typeof createClient<Database>>> | undefined;

export function getSupabaseBrowserClient() {
  clientPromise ??= getSupabaseBrowserConfig().then(({ url, key }) =>
    createClient<Database>(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    }),
  );
  return clientPromise;
}
