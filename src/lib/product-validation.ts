import { z } from "zod";
export const moneySchema = z
  .number()
  .finite()
  .min(0)
  .max(999999999)
  .refine(
    (n) => Math.abs(Math.round(n * 100) - n * 100) < 0.00001,
    "Use at most two decimal places.",
  );
export const volumeTierSchema = z
  .object({
    minQty: z.number().int().min(1).max(5000),
    label: z.string().trim().max(100).default(""),
    unitPriceNgn: moneySchema,
    unitPriceGbp: moneySchema,
  })
  .strict();
export const volumeTiersSchema = z
  .array(volumeTierSchema)
  .max(30)
  .refine(
    (t) => new Set(t.map((x) => x.minQty)).size === t.length,
    "Each volume threshold must be unique.",
  )
  .transform((t) => [...t].sort((a, b) => a.minQty - b.minQty));
export const imageSourceSchema = z
  .string()
  .trim()
  .max(1000)
  .refine(
    (s) => /^asset:[a-z0-9-]+\.jpg$/i.test(s) || secureImage(s),
    "Use a bundled image or a secure image URL.",
  );
export const gallerySchema = z
  .array(
    z.object({ src: imageSourceSchema, caption: z.string().trim().max(200).default("") }).strict(),
  )
  .max(30);

function secureImage(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
