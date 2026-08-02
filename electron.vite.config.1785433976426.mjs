// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
delete process.env.ELECTRON_RUN_AS_NODE;
var electron_vite_config_default = defineConfig({
  main: {
    build: {
      outDir: "out/main",
      emptyOutDir: false
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
