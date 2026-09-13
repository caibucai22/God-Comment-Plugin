import { defineConfig } from "vite";

export default defineConfig({
  root: "tests/e2e",
  server: { host: "127.0.0.1", port: 4174, strictPort: true },
});
