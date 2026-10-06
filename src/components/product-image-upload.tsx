import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createProductImageUpload } from "@/lib/admin.functions";
import { getSupabaseBrowserClient } from "@/integrations/supabase/client";
export function ProductImageUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const begin = useServerFn(createProductImageUpload);
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true);
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 15 * 1024 * 1024
      )
        throw new Error("Choose a JPEG, PNG or WebP under 15 MB.");
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Image resizing is unavailable.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Could not prepare image"))),
          "image/webp",
          0.85,
        ),
      );
      if (blob.type !== "image/webp" || blob.size > 2 * 1024 * 1024)
        throw new Error("Use a smaller image. Prepared images must be WebP under 2 MB.");
      const target = await begin();
      const client = await getSupabaseBrowserClient();
      const { error } = await client.storage
        .from("product-images")
        .uploadToSignedUrl(target.path, target.token, blob, { contentType: "image/webp" });
      if (error) throw new Error("Upload failed. Please retry.");
      onUploaded(target.url);
      toast.success("Image uploaded. Save the product to publish it.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="block text-sm">
      <span>{busy ? "Preparing and uploading…" : "Upload product image"}</span>
      <input
        className="mt-2 block w-full text-sm"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}
