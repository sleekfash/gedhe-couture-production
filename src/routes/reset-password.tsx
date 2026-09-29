import { type FormEvent, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — Gedhe Couture" },
      {
        name: "description",
        content: "Complete secure staff password recovery for Gedhe Couture.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void getSupabaseBrowserClient().then(async (supabase) => {
      const { data } = await supabase.auth.getSession();
      if (active && data.session) setReady(true);
      const listener = supabase.auth.onAuthStateChange((event, session) => {
        if (active && (event === "PASSWORD_RECOVERY" || session)) setReady(true);
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 10) {
      setError("Use at least 10 characters for the new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const supabase = await getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await navigate({ to: "/admin", replace: true });
    } catch {
      setError("This recovery link is invalid or expired. Request a new one and try again.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-charcoal px-5 py-10 text-linen sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg items-center">
        <section className="w-full border border-linen/15 bg-background p-7 text-foreground sm:p-10">
          <div className="mb-7 grid h-11 w-11 place-items-center rounded-full border border-gold text-gold">
            <KeyRound className="h-5 w-5" />
          </div>
          <p className="text-eyebrow text-muted-foreground">Staff recovery</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight">Choose a new password</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Use the secure link from your recovery email to set a new password.
          </p>
          {error && (
            <Alert variant="destructive" className="mt-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {ready ? (
            <form onSubmit={submit} className="mt-7 space-y-5">
              <div>
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 h-11"
                />
              </div>
              <div>
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-2 h-11"
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="h-11 w-full bg-charcoal text-linen hover:bg-charcoal/90"
              >
                {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Update password
              </Button>
            </form>
          ) : (
            <Alert className="mt-6">
              <AlertDescription>
                No active recovery session was found. Open this page from the latest recovery email,
                or{" "}
                <Link to="/forgot-password" className="font-semibold underline">
                  request a new link
                </Link>
                .
              </AlertDescription>
            </Alert>
          )}
        </section>
      </div>
    </main>
  );
}
