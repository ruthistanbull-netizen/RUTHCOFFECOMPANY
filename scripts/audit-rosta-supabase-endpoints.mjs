#!/usr/bin/env node
/**
 * Static Supabase endpoint audit for the ROSTA monorepo.
 * Scans all TS/JS/MJS/CJS/JSON/YAML in the two app source trees.
 * It does NOT read secrets or contact remote services.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const roots = ["apps/admin/src", "apps/storefront/src", "packages"];
const extensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".yaml", ".yml"]);
const banned = [
  { name: "Ruth Supabase endpoint", pattern: /supabase\.ruthistanbul\.com|mpfpkiikqutiwuycpsjb\.supabase\.co/gi },
  { name: "Old ROSTA Cloud endpoint", pattern: /(?:https?:\/\/)?fposvxuryzidmeuwytbg\.supabase\.co/gi },
  { name: "Unrestricted third-party Supabase endpoint", pattern: /https?:\/\/[\w-]+\.supabase\.co/gi },
];
const allowedOldCloud = new Set([
  "apps/admin/src/lib/platform.ts",
  "apps/storefront/src/lib/supabaseRuntime.ts",
  "apps/storefront/next.config.ts",
]);
let files = 0;
const findings = [];
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) { walk(path); continue; }
    if (!item.isFile() || !extensions.has(extname(item.name))) continue;
    files++;
    const rel = relative(".", path).replaceAll("\\", "/");
    for (const [i, line] of readFileSync(path, "utf8").split("\n").entries()) {
      for (const { name, pattern } of banned) {
        const re = new RegExp(pattern.source, pattern.flags);
        if (!re.test(line)) continue;
        if (name === "Old ROSTA Cloud endpoint" && allowedOldCloud.has(rel)) continue;
        if (name === "Unrestricted third-party Supabase endpoint" && allowedOldCloud.has(rel) && /fposvxuryzidmeuwytbg/.test(line)) continue;
        findings.push(rel + ":" + (i + 1) + " " + name);
      }
    }
  }
}
for (const root of roots) walk(root);
console.log("ROSTA files scanned: " + files);
if (findings.length) {
  console.error("Hardcoded Supabase endpoints need review:\n" + findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("No unapproved hardcoded Supabase endpoints.");
}
