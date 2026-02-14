/**
 * CLI: Generate an action file from a spec
 * Usage: npx ts-node src/forge/generate_from_spec.ts specs/create_token.spec.json [output_path]
 */
import * as fs from "fs";
import * as path from "path";
import { validateSpec } from "./actionSpec";
import { generateAction } from "./generator";

const specPath = process.argv[2];
const outputPath = process.argv[3];

if (!specPath) {
  console.error("Usage: npx ts-node generate_from_spec.ts <spec.json> [output.ts]");
  process.exit(1);
}

const fullSpecPath = path.resolve(__dirname, specPath);
const raw = JSON.parse(fs.readFileSync(fullSpecPath, "utf-8"));

// Validate
const result = validateSpec(raw);
if (!result.ok) {
  console.error("❌ Spec validation failed:");
  for (const err of result.errors) {
    console.error(`   ${err}`);
  }
  process.exit(1);
}

console.log(`✅ Spec valid: ${result.spec.name}`);

// Generate
const code = generateAction(result.spec);

if (outputPath) {
  const fullOutputPath = path.resolve(outputPath);
  fs.writeFileSync(fullOutputPath, code, "utf-8");
  console.log(`📝 Written to: ${fullOutputPath}`);
} else {
  console.log("\n── Generated Code ──\n");
  console.log(code);
}
