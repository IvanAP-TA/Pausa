import { configDefaults, defineConfig } from "vitest/config";

// Unit tests only: the browser journeys in e2e/ belong to Playwright (`npm run e2e`).
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "e2e/**", "engine/**", ".open-next/**", "src-tauri/**", "test-results/**", "pausa/**"] },
});
