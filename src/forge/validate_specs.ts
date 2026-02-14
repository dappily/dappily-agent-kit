/**
 * Validate all spec files against the ActionSpec schema
 */
import { validateSpec, ActionSpec } from "./actionSpec";
import * as fs from "fs";
import * as path from "path";

const specsDir = path.join(__dirname, "specs");
const specFiles = fs.readdirSync(specsDir).filter((f) => f.endsWith(".spec.json"));

let passed = 0;
let failed = 0;

console.log("🔧 Validating Action Specs\n");

for (const file of specFiles) {
  const raw = JSON.parse(fs.readFileSync(path.join(specsDir, file), "utf-8"));
  const result = validateSpec(raw);

  if (result.ok) {
    console.log(`  ✅ ${file} — ${result.spec.name} (${result.spec.hedera.service}/${result.spec.hedera.sdkClass})`);
    passed++;
  } else {
    console.log(`  ❌ ${file}`);
    for (const err of result.errors) {
      console.log(`     ${err}`);
    }
    failed++;
  }
}

console.log(`\n  Passed: ${passed} | Failed: ${failed} | Total: ${specFiles.length}`);
if (failed > 0) process.exit(1);
