// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var electron_vite_config_default = defineConfig({
  main: {
    build: {
      outDir: "out/main",
      emptyOutDir: false,
      rollupOptions: {
        external: ["better-sqlite3"]
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      outDir: "out/preload",
      emptyOutDir: false
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    build: {
      outDir: "out/renderer",
      emptyOutDir: false
    },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
