import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
let html = await readFile(path.join(dist, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)];
const styles = [...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)];
if (scripts.length !== 1 || styles.length !== 1) {
  throw new Error("Expected exactly one bundled script and stylesheet.");
}
const resolveAsset = (asset) => {
  const resolved = path.resolve(dist, asset.replace(/^\//, ""));
  if (!resolved.startsWith(dist)) throw new Error("Asset outside dist.");
  return resolved;
};
const js = await readFile(resolveAsset(scripts[0][1]), "utf8");
const style = await readFile(resolveAsset(styles[0][1]), "utf8");
html = html.replace(scripts[0][0], () => `<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>`);
html = html.replace(styles[0][0], () => `<style>${style.replace(/<\/style/gi, "<\\/style")}</style>`);
await writeFile(path.join(dist, "catat-harian-preview.html"), html);
console.log("Standalone preview: dist/catat-harian-preview.html");
