import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages sirve bajo /<repo>/, no bajo /. VITE_BASE lo inyecta el workflow.
// Ojo: GitHub Pages es case-sensitive -> /INSPECCION-DE-CAMPO-EQ-DE-TORRE/.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  build: {
    // Las fotos viajan como blob en IndexedDB, pero jspdf + recharts + xlsx pesan.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
