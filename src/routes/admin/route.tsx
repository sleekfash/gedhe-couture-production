import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getAdminSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    try {
      await getAdminSession();
    } catch {
      throw redirect({ to: "/login" });
    }
  },
  component: () => <Outlet />,
});
