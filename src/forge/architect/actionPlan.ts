import { z } from "zod";

/**
 * ACTION_KINDS — maps 1:1 to our 15 reference specs.
 * Each kind has a deterministic template in planToSpec().
 */
export const ACTION_KINDS = [
  // Core
  "get_balance",
  "hbar_transfer",
  // Fungible HTS
  "create_token",
  "associate_token",
  "transfer_token",
  "mint_token",
  "burn_token",
  // NFT HTS
  "create_nft_collection",
  "mint_nft",
  "transfer_nft",
  "burn_nft",
  // HCS
  "create_topic",
  "submit_message",
  "get_topic_info",
  "delete_topic",
] as const;

/**
 * SAFE_SET — actions that run without --i-understand.
 * Excludes destructive ops (burns, deletes).
 */
export const SAFE_SET: readonly string[] = [
  "get_balance",
  "hbar_transfer",
  "create_token",
  "associate_token",
  "transfer_token",
  "mint_token",
  "create_nft_collection",
  "mint_nft",
  "transfer_nft",
  "create_topic",
  "submit_message",
  "get_topic_info",
];

export const ActionPlanSchema = z.object({
  actionKind: z.enum(ACTION_KINDS),
  label: z.string().min(3).max(80),
  description: z.string().min(10).max(300),
  inputs: z.array(z.object({
    name: z.string(),
    type: z.enum(["string", "number", "boolean", "string[]"]),
    description: z.string(),
    required: z.boolean().default(true),
    defaultValue: z.any().optional(),
  })).min(0),
  notes: z.string().nullable().optional(),
});

export type ActionPlan = z.infer<typeof ActionPlanSchema>;
