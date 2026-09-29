import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TITLE = "Find your order — Gedhe Couture";
const DESCRIPTION =
  "Enter your secure payment token to confirm payment and follow your Gedhe Couture order.";

export const Route = createFileRoute("/order-return")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderReturnPage,
});

function OrderReturnPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token");
    if (value) setToken(value);
  }, []);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[0-9a-f-]{36}$/i.test(token.trim())) {
      setError("Enter the complete payment token from your checkout confirmation.");
      return;
    }
    void navigate({ to: "/order/$token", params: { token: token.trim() } });
  }

  return (
    <main className="min-h-screen bg-charcoal px-5 py-10 text-linen sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <div className="w-full border border-linen/15 bg-charcoal-deep p-7 sm:p-12">
          <div className="grid h-12 w-12 place-items-center rounded-full border border-gold text-gold">
            <KeyRound className="h-5 w-5" />
          </div>
          <p className="mt-8 text-eyebrow text-gold">Gedhe Couture · Payment return</p>
          <h1 className="mt-3 max-w-xl font-display text-5xl leading-none tracking-tight">
            Find your order.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-linen/60">
            Use the secure token from checkout to see payment confirmation and delivery progress.
            Your private delivery details stay protected.
          </p>
          <form onSubmit={submit} className="mt-9 max-w-xl">
            <Label htmlFor="token" className="text-linen/80">
              Payment token
            </Label>
            <Input
              id="token"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setError("");
              }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="mt-2 h-12 border-linen/20 bg-linen/5 text-linen placeholder:text-linen/30"
            />
            {error && <p className="mt-2 text-sm text-clay">{error}</p>}
            <Button type="submit" className="mt-5 bg-gold text-charcoal hover:bg-gold-soft">
              View order <ArrowRight />
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
