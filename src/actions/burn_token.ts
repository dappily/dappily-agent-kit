import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TokenBurnTransaction,
  PrivateKey,
  Status,
} from "@hashgraph/sdk";

const burnTokenAction: Action = {
  name: "BURN_TOKEN",
  similes: [
    "burn token",
    "burn tokens",
    "decrease supply",
    "destroy tokens",
    "reduce supply",
  ],
  description:
    "Burn fungible tokens, permanently reducing the total supply. The tokens are burned from the treasury account. The token must have been created with a supply key. By default, the agent's operator key is used to sign.",
  examples: [
    [
      {
        input: {
          tokenId: "0.0.99999",
          amount: 1000,
        },
        output: {
          ok: true,
          summary: "Burned 1,000 of token 0.0.99999",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            tokenId: "0.0.99999",
            amountBurned: 1000,
            newTotalSupply: "9000",
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Burn 1,000 tokens from the treasury supply",
      },
    ],
  ],
  schema: z.object({
    tokenId: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Invalid Hedera Token ID format (must be 0.0.X)")
      .describe("The token ID to burn (e.g. 0.0.99999)"),
    amount: z
      .number()
      .int()
      .positive()
      .describe("Amount of tokens to burn (in smallest unit)"),
    memo: z
      .string()
      .max(100)
      .optional()
      .describe("Optional memo for the transaction"),
    supplyPrivateKey: z
      .string()
      .optional()
      .describe("⚠️ Supply key for the token (only needed if different from operator key)"),
  }),
  requiresConfirmation: true,
  simulate: async (agent, input) => {
    const warnings: string[] = [];

    if (input.amount >= 1_000_000) {
      warnings.push(
        `Large burn: ${input.amount.toLocaleString()} units. This is permanent and irreversible.`
      );
    }

    // Always warn — burns are destructive
    warnings.push("⚠️ Token burns are irreversible. Supply cannot be recovered.");

    return {
      summary: `Burn ${input.amount.toLocaleString()} of token ${input.tokenId}`,
      estimatedFeeHbar: 0.001,
      warnings,
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const tx = new TokenBurnTransaction()
        .setTokenId(input.tokenId)
        .setAmount(input.amount);

      if (input.memo) {
        tx.setTransactionMemo(input.memo);
      }

      // Freeze before signing
      const frozenTx = await tx.freezeWith(agent.client as any);

      // Sign with custom supply key if provided
      if (input.supplyPrivateKey) {
        const supplyKey = PrivateKey.fromString(input.supplyPrivateKey);
        await frozenTx.sign(supplyKey);
      }

      const response = await frozenTx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        const statusStr = receipt.status.toString();

        if (statusStr.includes("INSUFFICIENT_TOKEN_BALANCE")) {
          return {
            ok: false,
            error: "INSUFFICIENT_TOKEN_BALANCE",
            details: `Cannot burn ${input.amount.toLocaleString()} tokens — the treasury does not hold enough. Check the current supply.`,
          };
        }

        return {
          ok: false,
          error: statusStr,
          details: `Burn failed with status: ${statusStr}`,
        };
      }

      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: `Burned ${input.amount.toLocaleString()} of token ${input.tokenId}`,
        txId,
        receipt: {
          status: receipt.status.toString(),
        },
        data: {
          tokenId: input.tokenId,
          amountBurned: input.amount,
          newTotalSupply: receipt.totalSupply?.toString() ?? "unknown",
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Catch insufficient balance at SDK level too
      if (message.includes("INSUFFICIENT_TOKEN_BALANCE")) {
        return {
          ok: false,
          error: "INSUFFICIENT_TOKEN_BALANCE",
          details: `Cannot burn ${input.amount.toLocaleString()} tokens — the treasury does not hold enough.`,
        };
      }

      const knownErrors: Record<string, string> = {
        TOKEN_HAS_NO_SUPPLY_KEY:
          "This token was created without a supply key. Burning is permanently disabled.",
        INVALID_SIGNATURE:
          "Transaction signature is invalid. The supply key doesn't match.",
        INVALID_TOKEN_ID:
          "The token ID does not exist on this network.",
        TOKEN_WAS_DELETED:
          "This token has been deleted.",
        INSUFFICIENT_PAYER_BALANCE:
          "Not enough HBAR to cover the transaction fee.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "BURN_TOKEN_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default burnTokenAction;
