import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
execFileSync(process.execPath, ["node_modules/typescript/lib/tsc.js", "-p", "tsconfig.json", "--emitDeclarationOnly"], { stdio: "inherit" });
// This package's declaration is self-contained; each module format needs its own identity.
copyFileSync("dist/index.d.ts", "dist/index.d.cts");
for (const [format, outfile] of [
  ["esm", "dist/index.js"],
  ["cjs", "dist/index.cjs"],
  ["iife", "dist/here-evidence-memory.iife.js"],
]) {
  const result = await build({
    entryPoints: ["src/index.ts"], bundle: true, format, outfile,
    platform: format === "cjs" ? "node" : "browser", target: "es2022",
    ...(format === "iife" ? { globalName: "HereEvidenceMemory" } : {}),
    banner: { js: "/*! Here Evidence Memory | MIT License */" },
    metafile: true,
  });
  for (const output of Object.values(result.metafile.outputs)) {
    if (output.imports.length) throw new Error("Runtime bundle must be standalone.");
  }
}
