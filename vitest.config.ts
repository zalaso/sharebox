import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Alcuni test avviano esbuild o workerd: con tutti i test in parallelo il primo avvio può superare i 5 s predefiniti.
    testTimeout: 30_000,
  },
});
