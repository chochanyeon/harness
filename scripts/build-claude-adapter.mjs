#!/usr/bin/env node
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const srcDir = path.join(root, "target", ".claude", "hooks", "src");
const outDir = process.env.CLAUDE_ADAPTER_OUT_DIR
  ? path.resolve(process.env.CLAUDE_ADAPTER_OUT_DIR)
  : path.join(root, "target", ".claude", "hooks");

const entries = fs
  .readdirSync(srcDir)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => name.slice(0, -3));

if (entries.length === 0) {
  console.error(`No .ts entry points found in ${srcDir}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

for (const name of entries) {
  await build({
    entryPoints: [path.join(srcDir, `${name}.ts`)],
    outfile: path.join(outDir, `${name}.cjs`),
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    banner: { js: "#!/usr/bin/env node" },
    logLevel: "warning",
  });
}

console.log(`Built ${entries.length} Claude adapter bundle(s) into ${outDir}`);
