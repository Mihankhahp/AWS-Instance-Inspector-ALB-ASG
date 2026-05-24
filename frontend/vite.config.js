import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // In local dev: forward API + stress endpoints to Express on :4000
      "/api": "http://localhost:4000",
      "/stress-fe": "http://localhost:4000",
    },
  },
});
