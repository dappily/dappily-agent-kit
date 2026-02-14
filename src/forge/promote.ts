/**
 * 🔧 Forge Promotion Gate
 *
 * Takes a sandbox report (or runs the sandbox), and if it passes:
 * 1. Copies the generated action to src/actions/
 * 2. Updates the action registry (src/actions/index.ts)
 * 3. Outputs a ready-to-commit summary
 *
 * Usage:
 *   OPERATOR_ID=... OPERATOR_KEY=... npx ts-node src/forge/promote.ts <spec.json> [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { validateSpec, ActionSpec } from "./actionSpec";
import { generateAction } from "./generator";
import { runSandbox, SandboxConfig } from "./sandbox";

// ── Types ──────────────────────────────────────────────────────

export interface PromotionResult {
  ok: boolean;
  specName: string;
  actionFile: string | null;
  registryUpdated: boolean;
  sandboxPassed: boolean;
  summary: string;
  proofLine: string | null;
  filesChanged: string[];
}

// ── Promote ────────────────────────────────────────────────────

export async function promote(specPath: string, config: {
  operatorId: string;
  operatorKey: string;
  network: "testnet" | "mainnet";
  dryRun: boolean;
  kitRoot: string;
}): Promise<PromotionResult> {
  const result: PromotionResult = {
    ok: false,
    specName: "",
    actionFile: null,
    registryUpdated: false,
    sandboxPassed: false,
    summary: "",
    proofLine: null,
    filesChanged: [],
  };

  // 1. Load and validate spec
  const raw = JSON.parse(fs.readFileSync(specPath, "utf-8"));
  const validation = validateSpec(raw);
  if (!validation.ok) {
    result.summary = `Spec validation failed: ${validation.errors[0]}`;
    return result;
  }
  const spec = validation.spec;
  result.specName = spec.name;

  // 2. Run sandbox
  // Promotion ALWAYS runs live testnet. Dry-run promotions are not allowed.
  // The whole point is that promoted code has a testnet receipt.
  const sandboxConfig: SandboxConfig = {
    specPath,
    network: config.network,
    operatorId: config.operatorId,
    operatorKey: config.operatorKey,
    dryRun: false, // Never dry-run for promotion
    kitRoot: config.kitRoot,
  };

  const report = await runSandbox(sandboxConfig);
  result.sandboxPassed = report.ok;

  if (!report.ok) {
    const failStep = Object.entries(report.steps).find(([_, v]) => !(v as any).ok);
    result.summary = `Sandbox failed at ${failStep?.[0] || "unknown"}`;
    return result;
  }

  // 3. Generate the action file
  const code = generateAction(spec);
  const fileName = spec.name.toLowerCase() + ".ts";
  const actionPath = path.join(config.kitRoot, "src/actions", fileName);

  // Check if file already exists
  if (fs.existsSync(actionPath)) {
    // Backup existing
    const backupPath = actionPath + ".bak";
    fs.copyFileSync(actionPath, backupPath);
    result.filesChanged.push(`${fileName}.bak (backup)`);
  }

  fs.writeFileSync(actionPath, code, "utf-8");
  result.actionFile = actionPath;
  result.filesChanged.push(fileName);

  // 4. Update the registry (src/actions/index.ts)
  const registryPath = path.join(config.kitRoot, "src/actions/index.ts");
  const registry = fs.readFileSync(registryPath, "utf-8");

  const camelName = camelCase(spec.name);
  const importName = `${camelName}Action`;
  const importPath = `./${spec.name.toLowerCase()}`;

  if (!registry.includes(importName)) {
    // Add import
    const lastImportIdx = registry.lastIndexOf("\nimport ");
    const nextNewline = registry.indexOf("\n", lastImportIdx + 1);
    const importLine = `\nimport ${importName} from "${importPath}";`;

    let updated = registry.slice(0, nextNewline) + importLine + registry.slice(nextNewline);

    // Add to actions array
    updated = updated.replace(
      /(\];)\s*\n\s*\/\/ Named exports/,
      `  ${importName},\n$1\n\n// Named exports`
    );

    // Add to named exports
    updated = updated.replace(
      /(export \{[\s\S]*?)(};)/,
      `$1  ${importName},\n$2`
    );

    fs.writeFileSync(registryPath, updated, "utf-8");
    result.registryUpdated = true;
    result.filesChanged.push("index.ts (registry)");
  } else {
    result.registryUpdated = false; // Already registered
  }

  // 5. Build proof line
  const txId = report.steps.testnet.result?.txId;
  const hashscanBase = config.network === "mainnet"
    ? "https://hashscan.io/mainnet/transaction/"
    : "https://hashscan.io/testnet/transaction/";

  if (txId) {
    const formattedTxId = txId.replace(/@/g, "-").replace(/\./g, "-");
    result.proofLine = `✅ Promoted ${spec.name} from specVersion ${spec.specVersion} — generated code compiled + verified on Hedera ${config.network}: ${hashscanBase}${formattedTxId}`;
  } else if (spec.hedera.networkCallType === "query") {
    result.proofLine = `✅ Promoted ${spec.name} from specVersion ${spec.specVersion} — generated query compiled + executed on Hedera ${config.network}`;
  } else {
    result.proofLine = `✅ Promoted ${spec.name} from specVersion ${spec.specVersion} — compiled + sandbox passed (dry-run)`;
  }

  result.ok = true;
  result.summary = result.proofLine;
  return result;
}

// ── Helpers ────────────────────────────────────────────────────

function camelCase(name: string): string {
  return name.toLowerCase().split("_").map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1)).join("");
}

// ── CLI ────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const specPath = args.find(a => !a.startsWith("--"));
  if (!specPath) {
    console.error("Usage: npx ts-node promote.ts <spec.json>");
    console.error("  Promotion always runs live testnet. No dry-run option.");
    process.exit(1);
  }

  const operatorId = process.env.FORGE_OPERATOR_ID || process.env.OPERATOR_ID || "";
  const operatorKey = process.env.FORGE_OPERATOR_KEY || process.env.OPERATOR_KEY || "";

  if (!operatorId || !operatorKey) {
    console.error("Set FORGE_OPERATOR_ID/FORGE_OPERATOR_KEY or OPERATOR_ID/OPERATOR_KEY");
    process.exit(1);
  }

  const kitRoot = path.resolve(__dirname, "../..");

  console.log(`🔧 Forge Promote — ${path.basename(specPath)}`);
  console.log(`   Network: testnet | Live testnet execution required\n`);

  promote(path.resolve(specPath), {
    operatorId,
    operatorKey,
    network: "testnet",
    dryRun: false,
    kitRoot,
  }).then((result) => {
    if (result.ok) {
      console.log(`\n${result.proofLine}\n`);
      console.log(`   📁 Files changed: ${result.filesChanged.length}`);
      for (const f of result.filesChanged) {
        console.log(`      · ${f}`);
      }
      console.log(`\n   Next steps:`);
      console.log(`      git diff src/actions/`);
      console.log(`      git add -A && git commit -m "forge: promote ${result.specName}"`);
    } else {
      console.log(`\n   ❌ Promotion failed: ${result.summary}`);
    }
    process.exit(result.ok ? 0 : 1);
  });
}
