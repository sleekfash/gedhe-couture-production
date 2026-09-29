import { createMiddleware } from "@tanstack/react-start";

import { getSupabaseBrowserClient } from "./client";

/** Applied only to protected admin server functions, never public storefront reads. */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const supabase = await getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
