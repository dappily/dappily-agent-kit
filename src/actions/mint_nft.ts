import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TokenMintTransaction,
  PrivateKey,
  Status,
} from "@hashgraph/sdk";

// HTS limit: 100 bytes per NFT metadata
const MAX_METADATA_BYTES = 100;
// Sane per-transaction cap
const MAX_NFTS_PER_TX = 10;

/**
 * Decode a base64 string to Uint8Array.
 * Accepts raw base64 or "b64:..." prefix.
 */
function decodeMetadata(input: string): Uint8Array {
  const raw = input.startsWith("b64:") ? input.slice(4) : input;
  return Buffer.from(raw, "base64");
}

const mintNftAction: Action = {
  name: "MINT_NFT",
  similes: [
    "mint nft",
    "mint nfts",
    "create nft",
    "issue nft",
    "add nft",
    "nft mint",
  ],
  description:
    "Mint one or more NFTs in an existing collection. Each NFT gets its own metadata (base64-encoded, max 100 bytes each). Returns the serial numbers of the newly minted NFTs. The token must have a supply key.",
  examples: [
    [
      {
        input: {
          tokenId: "0.0.88888",
          metadata: ["SGVsbG8gV29ybGQ=", "RGFwcGlseSBORlQ="],
        },
        output: {
          ok: true,
          summary: "Minted 2 NFTs in collection 0.0.88888 (serials: 1, 2)",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            tokenId: "0.0.88888",
            serials: [1, 2],
            count: 2,
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Mint 2 NFTs with base64-encoded metadata",
      },
    ],
  ],
  schema: z.object({
    tokenId: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Invalid Hedera Token ID format (must be 0.0.X)")
      .describe("The NFT collection token ID"),
    metadata: z
      .array(z.string())
      .min(1)
      .max(MAX_NFTS_PER_TX)
      .describe(
        `Array of base64-encoded metadata strings (1-${MAX_NFTS_PER_TX} per transaction, max ${MAX_METADATA_BYTES} bytes each)`
      ),
    memo: z
      .string()
      .max(100)
      .optional()
      .describe("Optional transaction memo"),
    supplyPrivateKey: z
      .string()
      .optional()
      .describe("⚠️ Supply key (only if different from operator key)"),
  }),
  requiresConfirmation: true,
  simulate: async (_agent, input) => {
    const warnings: string[] = [];
    const count = input.metadata.length;

    if (count > MAX_NFTS_PER_TX) {
      warnings.push(
        `Minting ${count} NFTs exceeds the recommended ${MAX_NFTS_PER_TX} per transaction. Consider batching.`
      );
    }

    return {
      summary: `Mint ${count} NFT${count > 1 ? "s" : ""} in collection ${input.tokenId}`,
      estimatedFeeHbar: 0.02 * count,
      warnings,
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    // ── Pre-flight: validate metadata sizes ──
    const decodedMetadata: Uint8Array[] = [];
    for (let i = 0; i < input.metadata.length; i++) {
      const bytes = decodeMetadata(input.metadata[i]);
      if (bytes.length > MAX_METADATA_BYTES) {
        return {
          ok: false,
          error: "METADATA_TOO_LARGE",
          details: `Metadata at index ${i} is ${bytes.length} bytes (max ${MAX_METADATA_BYTES}). Shorten it or use an IPFS CID hash instead.`,
        };
      }
      if (bytes.length === 0) {
        return {
          ok: false,
          error: "METADATA_EMPTY",
          details: `Metadata at index ${i} decoded to 0 bytes. Provide valid base64-encoded content.`,
        };
      }
      decodedMetadata.push(bytes);
    }

    try {
      const tx = new TokenMintTransaction()
        .setTokenId(input.tokenId)
        .setMetadata(decodedMetadata);

      if (input.memo) {
        tx.setTransactionMemo(input.memo);
      }

      const frozenTx = await tx.freezeWith(agent.client as any);

      if (input.supplyPrivateKey) {
        const supplyKey = PrivateKey.fromString(input.supplyPrivateKey);
        await frozenTx.sign(supplyKey);
      }

      const response = await frozenTx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        return {
          ok: false,
          error: receipt.status.toString(),
          details: `NFT mint failed with status: ${receipt.status.toString()}`,
        };
      }

      const serials = (receipt.serials || []).map((s) => Number(s.toString()));
      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: `Minted ${serials.length} NFT${serials.length > 1 ? "s" : ""} in collection ${input.tokenId} (serials: ${serials.join(", ")})`,
        txId,
        receipt: { status: receipt.status.toString() },
        data: {
          tokenId: input.tokenId,
          serials,
          count: serials.length,
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const knownErrors: Record<string, string> = {
        TOKEN_HAS_NO_SUPPLY_KEY:
          "This collection has no supply key. NFT minting is permanently disabled.",
        INVALID_SIGNATURE:
          "Transaction signature is invalid. The supply key doesn't match.",
        INVALID_TOKEN_ID:
          "The token ID does not exist on this network.",
        TOKEN_WAS_DELETED:
          "This collection has been deleted.",
        TOKEN_MAX_SUPPLY_REACHED:
          "This collection has reached its maximum supply cap.",
        MAX_NFTS_IN_PRICE_REGIME_HAVE_BEEN_MINTED:
          "Network-level NFT minting limit reached for this price regime.",
        INSUFFICIENT_PAYER_BALANCE:
          "Not enough HBAR to cover the mint fee.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "MINT_NFT_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default mintNftAction;
