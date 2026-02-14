/**
 * 🔧 Forge Sandbox — Batch Runner
 *
 * Runs the sandbox on multiple specs and outputs a summary.
 *
 * Usage:
 *   FORGE_OPERATOR_ID=0.0.X FORGE_OPERATOR_KEY=302e... npx ts-node src/forge/sandbox_batch.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { runSandbox, SandboxConfig, SandboxReport } from "./sandbox";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--live"); // Default dry-run unless --live
  const specsDir = path.join(__dirname, "specs");
  const kitRoot = path.resolve(__dirname, "../..");

  const operatorId = process.env.FORGE_OPERATOR_ID || process.env.OPERATOR_ID || "";
  const operatorKey = process.env.FORGE_OPERATOR_KEY || process.env.OPERATOR_KEY || "";

  if (!operatorId || !operatorKey) {
    console.error("Set FORGE_OPERATOR_ID and FORGE_OPERATOR_KEY (or OPERATOR_ID/OPERATOR_KEY)");
    process.exit(1);
  }

  const specFiles = fs.readdirSync(specsDir).filter(f => f.endsWith(".spec.json")).sort();

  console.log(`🔧 Forge Sandbox Batch — ${specFiles.length} specs`);
  console.log(`   Network: testnet | Dry run: ${dryRun}\n`);

  const reports: SandboxReport[] = [];

  for (const file of specFiles) {
    const config: SandboxConfig = {
      specPath: path.join(specsDir, file),
      network: "testnet",
      operatorId,
      operatorKey,
      dryRun,
      kitRoot,
    };

    process.stdout.write(`   ${file.padEnd(40)}`);

    const report = await runSandbox(config);
    reports.push(report);

    const v = report.steps.validate.ok ? "✅" : "❌";
    const g = report.steps.generate.ok ? "✅" : "❌";
    const c = report.steps.compile.ok ? "✅" : "❌";
    const t = report.steps.testnet.ok ? (report.steps.testnet.skipped ? "⏭️" : "✅") : "❌";

    console.log(`${v}${g}${c}${t} ${report.ok ? "PASS" : "FAIL"} (${report.durationMs}ms)`);
  }

  // Summary
  const passed = reports.filter(r => r.ok).length;
  const failed = reports.filter(r => !r.ok).length;

  console.log(`\n═══ Summary ═══`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Total: ${reports.length}`);

  if (failed > 0) {
    console.log(`\n   Failures:`);
    for (const r of reports.filter(r => !r.ok)) {
      const failStep = Object.entries(r.steps).find(([_, v]) => !v.ok);
      const err = failStep ? `${failStep[0]}: ${"errors" in failStep[1] ? failStep[1].errors?.[0] : "error" in failStep[1] ? failStep[1].error : "?"}` : "unknown";
      console.log(`   💀 ${r.specName} — ${err}`);
    }
  }

  // Write report JSON
  const reportPath = path.join(kitRoot, "forge-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
  console.log(`\n   Report: ${reportPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("💀", err);
  process.exit(1);
});
