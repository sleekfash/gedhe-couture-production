import { FormEvent, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LockKeyhole, Loader2, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getSupabaseBrowserClient } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Admin sign in — Gedhe Couture" },
      { name: "description", content: "Secure staff sign in for Gedhe Couture order operations." },
      { property: "og:title", content: "Admin sign in — Gedhe Couture" },
      {
        property: "og:description",
        content: "Secure staff sign in for Gedhe Couture order operations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const supabase = await getSupabaseBrowserClient();
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch {
      setError("Sign in failed. Check your email and password, then try again.");
      setBusy(false);
      return;
    }
    await navigate({ to: "/admin" });
  }

  return (
    <main className="min-h-screen bg-charcoal px-5 py-10 text-linen sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden border border-linen/15 bg-charcoal-deep md:grid-cols-[1fr_0.9fr]">
          <div className="hidden min-h-[520px] flex-col justify-between border-r border-linen/10 p-10 md:flex">
            <Link to="/" className="flex items-center gap-3 text-linen/75 hover:text-linen">
              <ArrowLeft className="h-4 w-4" /> Back to storefront
            </Link>
            <div>
              <p className="text-eyebrow text-gold">Private operations</p>
              <h1 className="mt-4 max-w-sm font-display text-5xl leading-[0.95] tracking-tight">
                The atelier, kept in order.
              </h1>
              <p className="mt-6 max-w-sm text-sm leading-7 text-linen/60">
                Manage orders, payment state, fulfilment, and the live catalog from one secure
                workspace.
              </p>
            </div>
            <p className="text-xs uppercase tracking-[0.18em] text-linen/35">
              Gedhe Couture · staff access
            </p>
          </div>
          <div className="bg-background p-7 text-foreground sm:p-10">
            <div className="mb-9">
              <div className="mb-5 grid h-11 w-11 place-items-center rounded-full border border-gold text-gold">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <p className="text-eyebrow text-muted-foreground">Staff access</p>
              <h2 className="mt-2 font-display text-3xl tracking-tight">Sign in to operations</h2>
            </div>
            {error && (
              <Alert variant="destructive" className="mb-5">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={submit} className="space-y-5">
              <div>
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 h-11"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 h-11"
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="h-11 w-full bg-charcoal text-linen hover:bg-charcoal/90"
              >
                {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Sign in
              </Button>
            </form>
            <p className="mt-4 text-center text-sm">
              <Link to="/forgot-password" className="font-semibold text-clay hover:underline">
                Forgot your password?
              </Link>
            </p>
            <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
              Only approved administrator accounts can open this workspace.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
