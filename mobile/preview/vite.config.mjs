import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url)),
  mobile = path.resolve(here, "..");
const stub = (name) => path.resolve(here, "src", name);
export default defineConfig({
  plugins: [
    {
      name: "isolated-native-preview",
      enforce: "pre",
      resolveId(source, importer) {
        if (!importer || !source.startsWith(".")) return;
        const resolved = path
          .resolve(path.dirname(importer), source)
          .replace(/\\/g, "/");
        const replacements = {
          [mobile + "/src/session"]: "session.jsx",
          [mobile + "/src/reminders/provider"]: "reminders.jsx",
          [mobile + "/src/components/useFinancialCommand"]: "commands.jsx",
          [mobile + "/src/components/CommandFeedback"]: "feedback.jsx",
        };
        if (replacements[resolved]) return stub(replacements[resolved]);
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: /^@expo\/vector-icons\/Ionicons$/,
        replacement: stub("icons.jsx"),
      },
      { find: /^react-native$/, replacement: stub("native.jsx") },
      {
        find: /^react-native-web$/,
        replacement: path.resolve(
          here,
          "node_modules/react-native-web/dist/index.js",
        ),
      },
      { find: /^expo-router$/, replacement: stub("router.jsx") },
      { find: /^expo-crypto$/, replacement: stub("crypto.mjs") },
      {
        find: /^@react-native-community\/netinfo$/,
        replacement: stub("network.mjs"),
      },
      {
        find: /^react-dom(\/.*)?$/,
        replacement: path.resolve(mobile, "node_modules/react-dom") + "$1",
      },
      {
        find: /^react(\/.*)?$/,
        replacement: path.resolve(mobile, "node_modules/react") + "$1",
      },
    ],
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  define: {
    __DEV__: true,
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  esbuild: { jsx: "automatic" },
  build: { outDir: "dist", sourcemap: false, assetsInlineLimit: 1024 * 1024 },
});
