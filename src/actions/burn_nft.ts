import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TokenBurnTransaction,
  PrivateKey,
  Status,
} from "@hashgraph/sdk";

const burnNftAction: Action = {
  name: "BURN_NFT",
  similes: [
    "burn nft",
    "destroy nft",
    "delete nft",
    "remove nft",
    "nft burn",
  ],
  description:
    "Permanently burn an NFT by serial number from the treasury account. This is irreversible. The collection must have a supply key. The NFT must be owned by the treasury.",
  examples: [
    [
      {
        input: {
          tokenId: "0.0.88888",
          serial: 3,
        },
        output: {
          ok: true,
          summary: "Burned NFT 0.0.88888 #3",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            tokenId: "0.0.88888",
            serial: 3,
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Permanently burn NFT serial #3 from the treasury",
      },
    ],
  ],
  schema: z.object({
    tokenId: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Invalid Hedera Token ID format (must be 0.0.X)")
      .describe("The NFT collection token ID"),
    serial: z
      .number()
      .int()
      .positive()
      .describe("The serial number of the NFT to burn"),
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
    return {
      summary: `Burn NFT ${input.tokenId} #${input.serial}`,
      estimatedFeeHbar: 0.001,
      warnings: [
        "⚠️ NFT burns are irreversible. This serial number will be permanently destroyed.",
      ],
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const tx = new TokenBurnTransaction()
        .setTokenId(input.tokenId)
        .setSerials([input.serial]);

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
          details: `NFT burn failed with status: ${receipt.status.toString()}`,
        };
      }

      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: `Burned NFT ${input.tokenId} #${input.serial}`,
        txId,
        receipt: { status: receipt.status.toString() },
        data: {
          tokenId: input.tokenId,
          serial: input.serial,
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const knownErrors: Record<string, string> = {
        TOKEN_HAS_NO_SUPPLY_KEY:
          "This collection has no supply key. Burning is permanently disabled.",
        INVALID_SIGNATURE:
          "Transaction signature is invalid. The supply key doesn't match.",
        INVALID_TOKEN_ID:
          "The token ID does not exist on this network.",
        INVALID_NFT_ID:
          "The specified NFT serial does not exist in this collection.",
        SENDER_DOES_NOT_OWN_NFT_SERIAL_NO:
          "The treasury does not own this NFT serial. Only treasury-held NFTs can be burned.",
        TOKEN_WAS_DELETED:
          "This collection has been deleted.",
        INSUFFICIENT_PAYER_BALANCE:
          "Not enough HBAR to cover the transaction fee.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "BURN_NFT_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default burnNftAction;
