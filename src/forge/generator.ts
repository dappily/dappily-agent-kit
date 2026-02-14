/**
 * 🔧 Dappily Agent Kit — Action Generator v2
 *
 * Takes a validated ActionSpec (v4) and produces a complete TypeScript
 * action file. Deterministic template fill — no LLM.
 */

import { ActionSpec } from "./actionSpec";

// ── Transform lookup table ─────────────────────────────────────
// Maps transform strings to code snippets.
// %v = the resolved value expression

const TRANSFORMS: Record<string, string> = {
  "AccountId.fromString": "AccountId.fromString(%v)",
  "TokenId.fromString": "TokenId.fromString(%v)",
  "Hbar.new": "new Hbar(%v)",
  "Hbar.negated": "new Hbar(%v).negated()",
  "PrivateKey.fromString": "PrivateKey.fromString(%v)",
  "negate": "-(%v)",
  "toString": "(%v).toString()",
  "toNumber": "Number(%v)",
};

// ── Resolve a "from" path to a code expression ────────────────

function resolveFrom(from: string): string {
  // "input.field" → "input.field"
  // "agent.field" → "agent.field"
  // "literal:value" → the literal value
  if (from.startsWith("literal:")) {
    const val = from.slice(8);
    // Numbers, booleans, and SDK enum references (Foo.Bar) pass through unquoted
    if (val === "true" || val === "false" || !isNaN(Number(val))) return val;
    if (/^[A-Z][a-zA-Z]*\.[A-Za-z]+$/.test(val)) return val; // SDK enum like TokenType.FungibleCommon
    return JSON.stringify(val);
  }
  return from;
}

// ── Apply transform to a resolved expression ──────────────────

function applyTransform(expr: string, transform?: string): string {
  if (!transform) return expr;
  const template = TRANSFORMS[transform];
  if (template) return template.replace(/%v/g, expr);
  // Unknown transform — fall back to method-style call
  return `${transform}(${expr})`;
}

// ── Zod type mapping ───────────────────────────────────────────

function zodType(input: ActionSpec["inputs"][0]): string {
  const c = input.constraints;
  let base: string;

  switch (input.type) {
    case "string":
      base = "z.string()";
      if (c?.min) base += `.min(${c.min})`;
      if (c?.max) base += `.max(${c.max})`;
      if (c?.regex) base += `.regex(/${c.regex}/, "Invalid format")`;
      break;
    case "number":
      base = "z.number()";
      if (c?.int) base += ".int()";
      if (c?.min !== undefined) base += `.min(${c.min})`;
      if (c?.max !== undefined) base += `.max(${c.max})`;
      break;
    case "boolean":
      base = "z.boolean()";
      break;
    case "string[]":
      base = "z.array(z.string())";
      if (c?.min) base += `.min(${c.min})`;
      if (c?.max) base += `.max(${c.max})`;
      break;
    case "number[]":
      base = "z.array(z.number())";
      break;
    default:
      base = "z.any()";
  }

  if (!input.required) {
    if (input.default !== undefined) {
      base += `.optional().default(${JSON.stringify(input.default)})`;
    } else {
      base += ".optional()";
    }
  }

  base += `.describe(${JSON.stringify(input.describe)})`;
  return base;
}

// ── SDK method call codegen ────────────────────────────────────

function sdkMethodLine(m: ActionSpec["sdkMethods"][0], varName: string): string {
  // Build args list
  let argsCode = "";
  if (m.args && m.args.length > 0) {
    const argExprs = m.args.map((a) => {
      if (Array.isArray(a.from)) {
        // Multi-input transform (e.g. NftId from tokenId + serial)
        const parts = a.from.map(resolveFrom);
        if (a.transform === "NftId") {
          return `new NftId(TokenId.fromString(${parts[0]}), ${parts[1]})`;
        }
        return parts.join(", ");
      }
      const resolved = resolveFrom(a.from);
      return applyTransform(resolved, a.transform);
    });
    argsCode = argExprs.join(", ");
  }

  const call = `${varName}.${m.method}(${argsCode})`;

  if (m.conditional) {
    const cond = m.conditional;
    let check: string;
    if (cond.when === "provided") check = `input.${cond.field}`;
    else if (cond.when === "true") check = `input.${cond.field} === true`;
    else check = `input.${cond.field} === false`;
    return `      if (${check}) { ${call}; }`;
  }

  return `      ${call};`;
}

// ── Success data field codegen ─────────────────────────────────

function dataFieldLine(d: ActionSpec["successData"][0]): string {
  switch (d.source) {
    case "receipt": {
      const field = d.receiptField || d.name;
      if (d.transform === "toString") return `${d.name}: receipt.${field}?.toString() ?? "unknown"`;
      if (d.transform === "toLongArray") return `${d.name}: (receipt.${field} || []).map((s: any) => Number(s.toString()))`;
      return `${d.name}: receipt.${field}`;
    }
    case "response":
      return `${d.name}: ${d.compute || `response.${d.name}`}`;
    case "input":
      return `${d.name}: input.${d.name} ?? null`;
    case "computed":
      return `${d.name}: ${d.compute || "null"}`;
    case "query_result": {
      const qf = d.queryField ? `result.${d.queryField}` : `result.${d.name}`;
      if (d.transform === "toString") return `${d.name}: ${qf}?.toString() ?? null`;
      if (d.transform === "toNumber") return `${d.name}: Number(${qf})`;
      return `${d.name}: ${qf}`;
    }
    default:
      return `${d.name}: null`;
  }
}

// ── Computed fields codegen (for queries) ──────────────────────

function computedFieldLine(cf: { name: string; from: string; op: string }): string {
  switch (cf.op) {
    case "notNull": return `const ${cf.name} = ${cf.from} !== null;`;
    case "toString": return `const ${cf.name} = ${cf.from}?.toString() ?? null;`;
    case "toNumber": return `const ${cf.name} = Number(${cf.from});`;
    default: return `const ${cf.name} = ${cf.from};`;
  }
}

// ── Main generator ─────────────────────────────────────────────

export function generateAction(spec: ActionSpec): string {
  const isTransaction = spec.hedera.networkCallType === "transaction";

  // Collect SDK imports
  const sdkImports = new Set(spec.hedera.sdkImports);
  if (isTransaction) sdkImports.add("Status");

  // Check if we need NftId
  const needsNftId = spec.sdkMethods.some(m => 
    m.args?.some(a => a.transform === "NftId")
  );
  if (needsNftId) { sdkImports.add("NftId"); sdkImports.add("TokenId"); }

  const sdkImportLine = `import {\n  ${[...sdkImports].join(",\n  ")},\n} from "@hashgraph/sdk";`;

  // Schema
  const schemaFields = spec.inputs.map((inp) => `    ${inp.name}: ${zodType(inp)},`).join("\n");

  // Simulation
  const simulateBlock = spec.hasSimulation ? `
  simulate: async (agent, input) => {
    return {
      summary: \`${spec.description.split(".")[0]}\`,
      estimatedFeeHbar: ${spec.hedera.estimatedFeeHbar},
      warnings: [],
    };
  },` : "";

  if (isTransaction) {
    return generateTransaction(spec, sdkImportLine, schemaFields, simulateBlock);
  } else {
    return generateQuery(spec, sdkImportLine, schemaFields);
  }
}

function generateTransaction(spec: ActionSpec, sdkImportLine: string, schemaFields: string, simulateBlock: string): string {
  const methodLines = spec.sdkMethods.map((m) => sdkMethodLine(m, "tx")).join("\n");

  const receiptFields = spec.successData.filter(d => d.source === "receipt");
  const primaryReceipt = receiptFields.find(d => d.receiptField && ["tokenId", "topicId"].includes(d.receiptField));

  const primaryCheck = primaryReceipt ? `
      const ${primaryReceipt.name} = receipt.${primaryReceipt.receiptField};
      if (!${primaryReceipt.name}) {
        return { ok: false, error: "NO_${primaryReceipt.receiptField!.toUpperCase()}", details: "Transaction succeeded but no ${primaryReceipt.receiptField} was returned." };
      }
` : "";

  const dataFields = spec.successData.filter(d => d.name !== "txId");
  const dataLines = dataFields.map(d => `          ${dataFieldLine(d)},`).join("\n");

  const errorEntries = spec.errorMap.map(e =>
    `        ${JSON.stringify(e.hederaStatus)}: ${JSON.stringify(e.details)},`
  ).join("\n");

  return `import { z } from "zod";
import { Action, ActionResult } from "../types/action";
${sdkImportLine}

const ${camelCase(spec.name)}Action: Action = {
  name: ${JSON.stringify(spec.name)},
  similes: ${JSON.stringify(spec.similes)},
  description: ${JSON.stringify(spec.description)},
  examples: [[]],
  schema: z.object({
${schemaFields}
  }),
  requiresConfirmation: ${spec.requiresConfirmation},${simulateBlock}
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const tx = new ${spec.hedera.sdkClass}();
${methodLines}

      const response = await tx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        return { ok: false, error: receipt.status.toString(), details: \`${spec.name} failed: \${receipt.status.toString()}\` };
      }
${primaryCheck}
      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: ${JSON.stringify(spec.description.split(".")[0])},
        txId,
        receipt: { status: receipt.status.toString() },
        data: {
${dataLines}
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const knownErrors: Record<string, string> = {
${errorEntries}
      };
      const errorCode = Object.keys(knownErrors).find((c) => message.includes(c));
      return { ok: false, error: errorCode || "${spec.name}_FAILED", details: errorCode ? knownErrors[errorCode] : message };
    }
  },
};

export default ${camelCase(spec.name)}Action;
`;
}

function generateQuery(spec: ActionSpec, sdkImportLine: string, schemaFields: string): string {
  const methodLines = spec.sdkMethods.map(m => sdkMethodLine(m, "query")).join("\n");

  // Computed fields (e.g. hasAdminKey = adminKey !== null)
  const computedLines = (spec.computedFields || []).map(cf => `      ${computedFieldLine(cf)}`).join("\n");

  const dataLines = spec.successData.map(d => {
    // If this field references a computedField, use the local variable
    const cf = (spec.computedFields || []).find(c => c.name === d.name);
    if (cf) return `          ${d.name}: ${d.name},`;
    return `          ${dataFieldLine(d)},`;
  }).join("\n");

  const errorEntries = spec.errorMap.map(e =>
    `        ${JSON.stringify(e.hederaStatus)}: ${JSON.stringify(e.details)},`
  ).join("\n");

  return `import { z } from "zod";
import { Action, ActionResult } from "../types/action";
${sdkImportLine}

const ${camelCase(spec.name)}Action: Action = {
  name: ${JSON.stringify(spec.name)},
  similes: ${JSON.stringify(spec.similes)},
  description: ${JSON.stringify(spec.description)},
  examples: [[]],
  schema: z.object({
${schemaFields}
  }),
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const query = new ${spec.hedera.sdkClass}();
${methodLines}

      const result = await query.execute(agent.client as any);

${computedLines}

      return {
        ok: true,
        summary: ${JSON.stringify(spec.description.split(".")[0])},
        data: {
${dataLines}
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const knownErrors: Record<string, string> = {
${errorEntries}
      };
      const errorCode = Object.keys(knownErrors).find((c) => message.includes(c));
      return { ok: false, error: errorCode || "${spec.name}_FAILED", details: errorCode ? knownErrors[errorCode] : message };
    }
  },
};

export default ${camelCase(spec.name)}Action;
`;
}

function camelCase(name: string): string {
  return name.toLowerCase().split("_").map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1)).join("");
}
