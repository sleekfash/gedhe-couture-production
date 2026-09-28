import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const deploymentPreset = process.env["NITRO_PRESET"] || "cloudflare_module";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({ srcDirectory: "src", server: { entry: "server" } }),
    viteReact(),
    nitro({ preset: deploymentPreset }),
  ],
});
