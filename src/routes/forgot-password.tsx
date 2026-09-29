import { type FormEvent, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Recover staff access — Gedhe Couture" },
      { name: "description", content: "Secure password recovery for Gedhe Couture staff." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("admin@gedhecouture.com");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const supabase = await getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch {
      setError("The recovery email could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-charcoal px-5 py-10 text-linen sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg items-center">
        <section className="w-full border border-linen/15 bg-background p-7 text-foreground sm:p-10">
          <Link
            to="/login"
            className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
          <div className="mb-7 grid h-11 w-11 place-items-center rounded-full border border-gold text-gold">
            <Mail className="h-5 w-5" />
          </div>
          <p className="text-eyebrow text-muted-foreground">Staff recovery</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight">Reset your password</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            We’ll send a one-time recovery link to the approved administrator email.
          </p>
          {error && (
            <Alert variant="destructive" className="mt-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {sent ? (
            <Alert className="mt-6">
              <AlertDescription>
                Recovery email sent. Open the link in that email to choose a new password.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={submit} className="mt-7 space-y-5">
              <div>
                <Label htmlFor="recovery-email">Email address</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-11"
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="h-11 w-full bg-charcoal text-linen hover:bg-charcoal/90"
              >
                {busy ? <Loader2 className="animate-spin" /> : <Mail />} Send recovery email
              </Button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
