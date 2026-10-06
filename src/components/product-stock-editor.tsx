import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listProductInventory, setProductInventory } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function ProductStockEditor({ id, options }: { id: string; options: string[] }) {
  const load = useServerFn(listProductInventory);
  const save = useServerFn(setProductInventory);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    load({ data: { id } })
      .then((rows) => {
        if (alive) setValues(Object.fromEntries(rows.map((r) => [r.option, String(r.quantity)])));
      })
      .catch(() => {
        if (alive) setError("Stock could not load. Retry by reopening the product.");
      });
    return () => {
      alive = false;
    };
  }, [id, load]);
  async function update(option: string) {
    setBusy(true);
    try {
      await save({ data: { id, option, quantity: Number(values[option]) } });
      toast.success("Stock quantity saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save stock");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Stock per option</h3>
      <p className="text-xs text-muted-foreground">
        Enter actual stock on hand, including units held by open orders. Blank options remain
        untracked. Zero stops new checkout for that option. Cancellation after allocation does not
        automatically restock.
      </p>
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        options.map((option) => (
          <div key={option} className="flex flex-wrap items-center gap-2">
            <label htmlFor={`stock-${option}`} className="min-w-32 flex-1 text-sm">
              {option}
            </label>
            <Input
              id={`stock-${option}`}
              aria-label={`Stock for ${option}`}
              type="number"
              min="0"
              step="1"
              value={values[option] ?? ""}
              placeholder="Untracked"
              onChange={(e) => setValues((v) => ({ ...v, [option]: e.target.value }))}
              className="w-28"
            />
            <Button
              variant="outline"
              disabled={
                busy ||
                values[option] === undefined ||
                values[option] === "" ||
                !Number.isInteger(Number(values[option])) ||
                Number(values[option]) < 0
              }
              onClick={() => void update(option)}
            >
              Save stock
            </Button>
          </div>
        ))
      )}
    </section>
  );
}
