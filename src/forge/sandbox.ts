/**
 * 🔧 Dappily Agent Kit — Sandbox Runner
 *
 * Automated pipeline: spec → generate → compile → testnet → report
 * Runs in an isolated temp directory. Uses a dedicated forge account.
 *
 * Usage:
 *   npx ts-node src/forge/sandbox.ts <spec.json> [--network testnet] [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { validateSpec, ActionSpec } from "./actionSpec";
import { generateAction } from "./generator";

// ── Types ──────────────────────────────────────────────────────

export interface SandboxReport {
  specName: string;
  specVersion: number;
  timestamp: string;
  steps: {
    validate: { ok: boolean; errors?: string[] };
    generate: { ok: boolean; codeLength?: number; error?: string };
    compile: { ok: boolean; errors?: string[] };
    testnet: { ok: boolean; result?: any; error?: string; skipped?: boolean };
  };
  ok: boolean;
  durationMs: number;
}

export interface SandboxConfig {
  specPath: string;
  network: "testnet" | "mainnet";
  operatorId: string;
  operatorKey: string;
  dryRun: boolean;  // Skip testnet execution
  kitRoot: string;  // Path to dappily-agent-kit root
}

// ── Sandbox Runner ─────────────────────────────────────────────

export async function runSandbox(config: SandboxConfig): Promise<SandboxReport> {
  const startTime = Date.now();
  const report: SandboxReport = {
    specName: "",
    specVersion: 0,
    timestamp: new Date().toISOString(),
    steps: {
      validate: { ok: false },
      generate: { ok: false },
      compile: { ok: false },
      testnet: { ok: false },
    },
    ok: false,
    durationMs: 0,
  };

  // ── Step 1: Validate Spec ────────────────────────────────────
  let spec: ActionSpec;
  try {
    const raw = JSON.parse(fs.readFileSync(config.specPath, "utf-8"));
    const result = validateSpec(raw);
    if (!result.ok) {
      report.steps.validate = { ok: false, errors: result.errors };
      report.durationMs = Date.now() - startTime;
      return report;
    }
    spec = result.spec;
    report.specName = spec.name;
    report.specVersion = spec.specVersion;
    report.steps.validate = { ok: true };
  } catch (err) {
    report.steps.validate = { ok: false, errors: [`Failed to read spec: ${err}`] };
    report.durationMs = Date.now() - startTime;
    return report;
  }

  // ── Step 2: Generate Code ────────────────────────────────────
  let code: string;
  try {
    code = generateAction(spec);
    report.steps.generate = { ok: true, codeLength: code.length };
  } catch (err) {
    report.steps.generate = { ok: false, error: err instanceof Error ? err.message : String(err) };
    report.durationMs = Date.now() - startTime;
    return report;
  }

  // ── Step 3: Compile Check (isolated temp dir) ────────────────
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dappily-forge-"));
  const actionFile = path.join(tmpDir, "action.ts");

  try {
    // Write generated code — fix import path to point at the real kit
    const fixedCode = code.replace(
      'from "../types/action"',
      `from "${path.join(config.kitRoot, "src/types/action")}"`
    );
    fs.writeFileSync(actionFile, fixedCode, "utf-8");

    // Run tsc --noEmit — copy to actions dir so module resolution works
    const compileCheckPath = path.join(config.kitRoot, `src/actions/_compile_check_${spec.name.toLowerCase()}.ts`);
    try {
      fs.writeFileSync(compileCheckPath, code, "utf-8");
      execSync(
        `npx -p typescript tsc --noEmit --strict --esModuleInterop --skipLibCheck --target ES2020 --module commonjs --moduleResolution node --types node "${compileCheckPath}"`,
        { timeout: 30000, encoding: "utf-8", stdio: "pipe", cwd: config.kitRoot }
      );
      report.steps.compile = { ok: true };
    } catch (err: any) {
      const stderr = err.stderr || err.stdout || "";
      const errors = stderr.split("\n").filter((l: string) => l.includes("error TS")).map((l: string) => l.trim());
      report.steps.compile = { ok: false, errors: errors.length > 0 ? errors : ["Compile failed"] };
      report.durationMs = Date.now() - startTime;
      cleanup(tmpDir);
      if (fs.existsSync(compileCheckPath)) fs.unlinkSync(compileCheckPath);
      return report;
    } finally {
      if (fs.existsSync(compileCheckPath)) fs.unlinkSync(compileCheckPath);
    }

    // ── Step 4: Testnet Execution ──────────────────────────────
    if (config.dryRun) {
      report.steps.testnet = { ok: true, skipped: true };
      report.ok = true;
      report.durationMs = Date.now() - startTime;
      cleanup(tmpDir);
      return report;
    }

    // Copy the action + test script into the kit so require() resolves
    const tempActionPath = path.join(config.kitRoot, `src/actions/_sandbox_${spec.name.toLowerCase()}.ts`);
    const testFile = path.join(config.kitRoot, `src/forge/_sandbox_test_${spec.name.toLowerCase()}.ts`);
    fs.writeFileSync(tempActionPath, code, "utf-8");

    const testScript = generateTestScript(spec, config);
    fs.writeFileSync(testFile, testScript, "utf-8");

    try {
      const output = execSync(
        `npx ts-node "${testFile}"`,
        { timeout: 60000, encoding: "utf-8", stdio: "pipe", cwd: config.kitRoot }
      );

      // Parse the JSON result from stdout — find the last JSON line
      const lines = output.trim().split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      let parsed = false;
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const testResult = JSON.parse(lines[i]);
          report.steps.testnet = { ok: testResult.ok, result: testResult };
          parsed = true;
          break;
        } catch { /* try previous line */ }
      }
      if (!parsed) {
        report.steps.testnet = { ok: false, error: `No JSON in output: ${lines.slice(-3).join(" | ")}` };
      }
    } catch (err: any) {
      const stderr = err.stderr || err.stdout || "";
      report.steps.testnet = { ok: false, error: stderr.slice(0, 500) };
    } finally {
      // Always clean up temp files
      if (fs.existsSync(tempActionPath)) fs.unlinkSync(tempActionPath);
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  } finally {
    cleanup(tmpDir);
  }

  report.ok = report.steps.validate.ok &&
    report.steps.generate.ok &&
    report.steps.compile.ok &&
    report.steps.testnet.ok;
  report.durationMs = Date.now() - startTime;
  return report;
}

// ── Test Script Generator ──────────────────────────────────────
// Generates a minimal test that exercises the action on testnet

function generateTestScript(spec: ActionSpec, config: SandboxConfig): string {
  const actionModuleName = `_sandbox_${spec.name.toLowerCase()}`;
  const isTransaction = spec.hedera.networkCallType === "transaction";
  const isQuery = spec.hedera.networkCallType === "query";

  // Build minimal test input from the spec
  const testInput: Record<string, any> = {};
  for (const inp of spec.inputs) {
    if (!inp.required && !inp.default) continue;
    if (inp.default !== undefined) { testInput[inp.name] = inp.default; continue; }

    // Generate safe test values
    switch (inp.type) {
      case "string":
        if (inp.constraints?.regex?.includes("\\d+\\.\\d+\\.\\d+")) {
          // Hedera ID — use operator for self-referencing safety
          testInput[inp.name] = config.operatorId;
        } else {
          testInput[inp.name] = `forge-test-${spec.name.toLowerCase()}`;
        }
        break;
      case "number":
        testInput[inp.name] = inp.constraints?.min !== undefined ? inp.constraints.min + 1 : 1;
        break;
      case "boolean":
        testInput[inp.name] = false;
        break;
      case "string[]":
        testInput[inp.name] = [Buffer.from("forge-test").toString("base64")];
        break;
      case "number[]":
        testInput[inp.name] = [1];
        break;
    }
  }

  return `
const { HederaAgentKit } = require("${path.join(config.kitRoot, "src/agent")}");
const action = require("${path.join(config.kitRoot, "src/actions", actionModuleName)}").default;

async function main() {
  const agent = new HederaAgentKit(
    ${JSON.stringify(config.operatorId)},
    ${JSON.stringify(config.operatorKey)},
    ${JSON.stringify(config.network)}
  );

  const input = ${JSON.stringify(testInput)};
  const result = await action.handler(agent, input);

  // Output structured result as JSON on the last line
  console.log(JSON.stringify({
    ok: result.ok,
    actionName: ${JSON.stringify(spec.name)},
    summary: result.ok ? result.summary : undefined,
    txId: result.ok ? result.txId : undefined,
    receiptStatus: result.ok ? result.receipt?.status : undefined,
    error: result.ok ? undefined : result.error,
    details: result.ok ? undefined : result.details,
    dataKeys: result.ok ? Object.keys(result.data) : undefined,
  }));
}

main().catch(err => {
  console.log(JSON.stringify({ ok: false, error: "UNHANDLED", details: err.message }));
  process.exit(1);
});
`;
}

// ── Cleanup ────────────────────────────────────────────────────

function cleanup(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

// ── CLI Entry Point ────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const specPath = args.find(a => !a.startsWith("--"));
  const dryRun = !args.includes("--live"); // Default dry-run unless --live
  const network = args.includes("--mainnet") ? "mainnet" as const : "testnet" as const;

  if (!specPath) {
    console.error("Usage: npx ts-node sandbox.ts <spec.json> [--live] [--mainnet]");
    process.exit(1);
  }

  // Load forge credentials from env
  const operatorId = process.env.FORGE_OPERATOR_ID || process.env.OPERATOR_ID || "";
  const operatorKey = process.env.FORGE_OPERATOR_KEY || process.env.OPERATOR_KEY || "";

  if (!operatorId || !operatorKey) {
    console.error("Set FORGE_OPERATOR_ID and FORGE_OPERATOR_KEY env vars (or OPERATOR_ID/OPERATOR_KEY)");
    process.exit(1);
  }

  const kitRoot = path.resolve(__dirname, "../..");

  const config: SandboxConfig = {
    specPath: path.resolve(specPath),
    network,
    operatorId,
    operatorKey,
    dryRun,
    kitRoot,
  };

  console.log(`🔧 Forge Sandbox — ${path.basename(specPath)}`);
  console.log(`   Network: ${network} | Dry run: ${dryRun}\n`);

  runSandbox(config).then((report) => {
    // Pretty print
    const v = report.steps.validate.ok ? "✅" : "❌";
    const g = report.steps.generate.ok ? "✅" : "❌";
    const c = report.steps.compile.ok ? "✅" : "❌";
    const t = report.steps.testnet.ok ? (report.steps.testnet.skipped ? "⏭️" : "✅") : "❌";

    console.log(`   ${v} Validate`);
    console.log(`   ${g} Generate${report.steps.generate.codeLength ? ` (${report.steps.generate.codeLength} chars)` : ""}`);
    console.log(`   ${c} Compile`);
    console.log(`   ${t} Testnet${report.steps.testnet.skipped ? " (skipped)" : ""}`);

    if (report.steps.testnet.result?.txId) {
      console.log(`   📊 txId: ${report.steps.testnet.result.txId}`);
    }

    if (!report.ok) {
      // Show first failure
      for (const [step, result] of Object.entries(report.steps)) {
        if (!result.ok && !("skipped" in result && result.skipped)) {
          const err = "errors" in result ? result.errors?.[0] : "error" in result ? result.error : "unknown";
          console.log(`\n   💀 Failed at ${step}: ${err}`);
          break;
        }
      }
    }

    console.log(`\n   ${report.ok ? "🎉 PASS" : "💀 FAIL"} — ${report.durationMs}ms`);

    // Also output the full report as JSON
    console.log("\n" + JSON.stringify(report, null, 2));

    process.exit(report.ok ? 0 : 1);
  });
}
