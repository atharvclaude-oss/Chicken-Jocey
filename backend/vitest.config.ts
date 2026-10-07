import { defineConfig } from "vitest/config";

export default defineConfig({
  // API test files share one database and clean up "test-" rows, so run them one at a time.
  test: { fileParallelism: false },
});
