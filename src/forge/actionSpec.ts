import { z } from "zod";

// ── Action Spec Schema v4 ──────────────────────────────────────
// CHANGELOG:
// v4: sdkMethods now use args[] with { from, transform? }.
//     Added computedFields for derived query outputs.
//     Killed single-arg method calls — everything uses args[].
// v3: transform, compute, structured conditional, int constraint.
// v2: versioning, risk/costTier, sdkImports, implicitBehaviors.
// v1: Initial schema.

export const SPEC_VERSION = 4;

// ── Enums ──────────────────────────────────────────────────────

const HederaServiceSchema = z.enum(["HBAR", "HTS", "HCS", "SCHEDULE", "CONTRACT", "MIRROR", "ACCOUNT"]);
const KeyRequirementSchema = z.enum(["operator", "supply", "admin", "sender", "custom"]);
const NetworkCallTypeSchema = z.enum(["query", "transaction", "mirror_rest"]);
const RiskSchema = z.enum(["read", "write", "destructive"]);
const CostTierSchema = z.enum(["free", "low", "medium", "high"]);

// ── Input fields ───────────────────────────────────────────────

const InputConstraintsSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  regex: z.string().optional(),
  enum: z.array(z.string()).optional(),
  int: z.boolean().optional(),
}).optional();

const InputFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "string[]", "number[]"]),
  required: z.boolean(),
  default: z.any().optional(),
  constraints: InputConstraintsSchema,
  describe: z.string(),
});

// ── Pre-flight checks ──────────────────────────────────────────

const PreflightCheckSchema = z.object({
  check: z.string(),
  type: z.enum(["association", "balance", "metadata_size", "amount_threshold", "key_required", "custom"]),
  failError: z.string(),
  failDetails: z.string(),
});

// ── Error mapping ──────────────────────────────────────────────

const ErrorMapEntrySchema = z.object({
  hederaStatus: z.string(),
  error: z.string(),
  details: z.string(),
});

// ── Success data fields ────────────────────────────────────────

const DataFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "string[]", "number[]", "object"]),
  source: z.enum(["receipt", "response", "input", "computed", "query_result"]),
  receiptField: z.string().optional(),
  transform: z.string().optional(),
  queryField: z.string().optional(),
  compute: z.string().optional(),
  describe: z.string(),
});

// ── Computed fields (for query-derived values) ─────────────────

const ComputedFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean"]),
  from: z.string().describe("Source field path (e.g. 'result.adminKey')"),
  op: z.enum(["notNull", "toString", "toNumber"]),
});

// ── SDK method args ────────────────────────────────────────────
// Each arg: { from: "input.x" | "agent.x" | "literal:value", transform?: "TransformName" }
// from can be an array for multi-input transforms (e.g. NftId from tokenId + serial)

const SdkArgSchema = z.object({
  from: z.union([z.string(), z.array(z.string())]).describe("Dot path: input.field, agent.field, or literal:value"),
  transform: z.string().optional().describe("Transform function name"),
});

const ConditionalSchema = z.object({
  field: z.string(),
  when: z.enum(["provided", "true", "false"]),
});

const SdkMethodCallSchema = z.object({
  method: z.string(),
  args: z.array(SdkArgSchema).optional().describe("Arguments for this method call"),
  conditional: ConditionalSchema.optional(),
});

// ── Implicit behaviors ─────────────────────────────────────────

const ImplicitBehaviorSchema = z.object({
  behavior: z.string(),
  details: z.string(),
});

// ── Main Spec Schema ───────────────────────────────────────────

export const ActionSpecSchema = z.object({
  specVersion: z.number(),
  kitVersion: z.string(),
  sdkVersion: z.string(),

  name: z.string().regex(/^[A-Z][A-Z0-9_]+$/, "ACTION_NAME format"),
  description: z.string().min(10),
  category: z.enum(["core", "fungible", "nft", "hcs", "schedule", "contract", "mirror", "account"]),
  similes: z.array(z.string()).min(1),

  risk: RiskSchema,
  costTier: CostTierSchema,

  hedera: z.object({
    service: HederaServiceSchema,
    sdkClass: z.string(),
    sdkImports: z.array(z.string()),
    networkCallType: NetworkCallTypeSchema,
    requiresSigning: z.boolean(),
    requiredKeys: z.array(KeyRequirementSchema),
    estimatedFeeHbar: z.number(),
    mirrorEndpoint: z.string().optional(),
  }),

  sdkMethods: z.array(SdkMethodCallSchema),
  computedFields: z.array(ComputedFieldSchema).optional(),
  implicitBehaviors: z.array(ImplicitBehaviorSchema).optional(),

  inputs: z.array(InputFieldSchema).min(0),
  preflightChecks: z.array(PreflightCheckSchema),
  successData: z.array(DataFieldSchema),
  errorMap: z.array(ErrorMapEntrySchema).min(1),

  requiresConfirmation: z.boolean(),
  hasSimulation: z.boolean(),
  irreversible: z.boolean(),
});

export type ActionSpec = z.infer<typeof ActionSpecSchema>;

export function validateSpec(spec: unknown): { ok: true; spec: ActionSpec } | { ok: false; errors: string[] } {
  const result = ActionSpecSchema.safeParse(spec);
  if (result.success) return { ok: true, spec: result.data };
  return { ok: false, errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}
