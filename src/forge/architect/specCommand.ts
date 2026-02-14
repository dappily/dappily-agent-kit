#!/usr/bin/env node
/**
 * 🧠 Forge Architect — AI Spec Generator
 *
 * Natural language → ActionPlan (LLM) → ActionSpec v4 (deterministic) → file
 *
 * Usage:
 *   npx ts-node src/forge/architect/specCommand.ts "send HBAR to another wallet"
 *   npx ts-node src/forge/architect/specCommand.ts "burn an NFT" --i-understand
 *   npx ts-node src/forge/architect/specCommand.ts "check balance" --yes
 *
 * Env: POE_API_KEY (uses Poe's OpenAI-compatible endpoint)
 *      or OPENAI_API_KEY (direct OpenAI)
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { ActionPlanSchema, SAFE_SET } from "./actionPlan";
import { SYSTEM_PROMPT, FEW_SHOT } from "./prompt";
import { planToSpec } from "./planToSpec";
import { validateSpec } from "../actionSpec";

// ── Parse CLI args ─────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith("--"));
const words = args.filter(a => !a.startsWith("--"));
const prompt = words.join(" ").trim();
const iUnderstand = flags.includes("--i-understand");
const autoApprove = flags.includes("--yes");

if (!prompt) {
  console.log(`
  🧠 Dappily Forge — AI Spec Architect

  Usage:
    npx ts-node src/forge/architect/specCommand.ts "describe what you want"

  Examples:
    "send HBAR to another account"
    "create a fungible token called DEMO"
    "check my account balance"
    "mint 3 NFTs with metadata"
    "post a message to a topic"

  Flags:
    --i-understand   Allow destructive actions (burns, deletes)
    --yes            Auto-approve without confirmation
  `);
  process.exit(0);
}

// ── API config ─────────────────────────────────────────────────

const poeKey = process.env.POE_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!poeKey && !openaiKey) {
  console.error("  ❌ Set POE_API_KEY or OPENAI_API_KEY");
  process.exit(1);
}

const apiBase = poeKey ? "https://api.poe.com/v1" : "https://api.openai.com/v1";
const apiKey = poeKey || openaiKey!;
const model = poeKey ? "Claude-3.5-Sonnet" : "gpt-4o-mini";

// ── Helpers ────────────────────────────────────────────────────

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, ans => { rl.close(); resolve(ans.trim().toLowerCase()); });
  });
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log("  🧠 Dappily Forge — AI Spec Architect");
  console.log("  ═════════════════════════════════════");
  console.log(`  ✏️  "${prompt}"\n`);

  // ── Call LLM ─────────────────────────────────────────────────
  console.log("  ⏳ Thinking...");

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...FEW_SHOT,
        { role: "user", content: prompt },
      ],
      temperature: 0.15,
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    console.error(`  ❌ API error: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const data = await response.json() as any;
  const rawContent = data.choices?.[0]?.message?.content;

  if (!rawContent) {
    console.error("  ❌ No response from LLM");
    process.exit(1);
  }

  // ── Parse JSON ───────────────────────────────────────────────
  let raw: any;
  try {
    // Strip markdown fences if present
    const cleaned = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    raw = JSON.parse(cleaned);
  } catch {
    console.error("  ❌ LLM returned invalid JSON:");
    console.error(`  ${rawContent.slice(0, 200)}`);
    process.exit(1);
  }

  // ── Unsupported check ────────────────────────────────────────
  if (raw.error === "unsupported") {
    console.error(`  ❌ Can't do that: ${raw.reason}`);
    process.exit(1);
  }

  // ── Zod validation ───────────────────────────────────────────
  const planResult = ActionPlanSchema.safeParse(raw);
  if (!planResult.success) {
    console.error("  ❌ LLM output failed schema validation:");
    for (const issue of planResult.error.issues) {
      console.error(`     ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const plan = planResult.data;
  console.log("  ✅ ActionPlan validated\n");

  // ── Safe set gate ────────────────────────────────────────────
  if (!SAFE_SET.includes(plan.actionKind) && !iUnderstand) {
    console.error(`  ⚠️  "${plan.actionKind}" is destructive. Re-run with --i-understand`);
    process.exit(1);
  }

  // ── Display plan ─────────────────────────────────────────────
  console.log(`  ┌──────────────────────────────────────────┐`);
  console.log(`  │ ${plan.label.padEnd(41)}│`);
  console.log(`  ├──────────────────────────────────────────┤`);
  console.log(`  │ Kind: ${plan.actionKind.padEnd(35)}│`);
  console.log(`  │ Inputs:${" ".repeat(34)}│`);
  for (const inp of plan.inputs) {
    const marker = inp.required ? "●" : "○";
    const line = `   ${marker} ${inp.name}: ${inp.type}`;
    console.log(`  │${line.padEnd(42)}│`);
  }
  console.log(`  └──────────────────────────────────────────┘`);
  console.log(`  ${plan.description}`);
  if (plan.notes) console.log(`  📝 ${plan.notes}`);
  console.log("");

  // ── Confirmation ─────────────────────────────────────────────
  if (!autoApprove) {
    const answer = await ask("  Approve? (y/n): ");
    if (answer !== "y" && answer !== "yes") {
      console.log("  Cancelled.");
      process.exit(0);
    }
  }

  // ── Convert to v4 Spec (deterministic) ───────────────────────
  const spec = planToSpec(plan);

  // ── Validate the generated spec ──────────────────────────────
  const specValidation = validateSpec(spec);
  if (!specValidation.ok) {
    console.error("  ❌ Generated spec failed validation:");
    for (const err of specValidation.errors) {
      console.error(`     ${err}`);
    }
    process.exit(1);
  }

  // ── Write spec file ──────────────────────────────────────────
  const outDir = path.join(__dirname, "..", "specs", "generated");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const fileName = `${plan.actionKind}_${Date.now()}.spec.json`;
  const filePath = path.join(outDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(spec, null, 2), "utf-8");

  console.log("  ═════════════════════════════════════");
  console.log(`  ✅ Spec written → ${path.relative(process.cwd(), filePath)}`);
  console.log("");
  console.log("  Next steps:");
  console.log(`    npm run forge:sandbox -- ${filePath}`);
  console.log(`    npm run forge:promote -- ${filePath}`);
  console.log("");
}

main().catch(err => {
  console.error(`  ❌ ${err.message}`);
  process.exit(1);
});
