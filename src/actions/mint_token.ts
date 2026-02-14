import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TokenMintTransaction,
  PrivateKey,
  Status,
} from "@hashgraph/sdk";

const mintTokenAction: Action = {
  name: "MINT_TOKEN",
  similes: [
    "mint token",
    "mint tokens",
    "increase supply",
    "create more tokens",
    "add supply",
  ],
  description:
    "Mint additional fungible tokens, increasing the total supply. The token must have been created with a supply key. By default, the agent's operator key is used to sign. For tokens where the supply key differs, provide it via supplyPrivateKey.",
  examples: [
    [
      {
        input: {
          tokenId: "0.0.99999",
          amount: 5000,
        },
        output: {
          ok: true,
          summary: "Minted 5,000 of token 0.0.99999",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            tokenId: "0.0.99999",
            amountMinted: 5000,
            newTotalSupply: "15000",
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Mint 5,000 additional tokens using the operator's supply key",
      },
    ],
  ],
  schema: z.object({
    tokenId: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Invalid Hedera Token ID format (must be 0.0.X)")
      .describe("The token ID to mint (e.g. 0.0.99999)"),
    amount: z
      .number()
      .int()
      .positive()
      .describe("Amount of tokens to mint (in smallest unit)"),
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
    return {
      summary: `Mint ${input.amount.toLocaleString()} of token ${input.tokenId}`,
      estimatedFeeHbar: 0.001,
      warnings: input.amount >= 1_000_000_000
        ? [`Very large mint: ${input.amount.toLocaleString()} units. Double-check this is intentional.`]
        : [],
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const tx = new TokenMintTransaction()
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
        return {
          ok: false,
          error: receipt.status.toString(),
          details: `Mint failed with status: ${receipt.status.toString()}`,
        };
      }

      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: `Minted ${input.amount.toLocaleString()} of token ${input.tokenId}`,
        txId,
        receipt: {
          status: receipt.status.toString(),
        },
        data: {
          tokenId: input.tokenId,
          amountMinted: input.amount,
          newTotalSupply: receipt.totalSupply?.toString() ?? "unknown",
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const knownErrors: Record<string, string> = {
        TOKEN_HAS_NO_SUPPLY_KEY:
          "This token was created without a supply key. Minting is permanently disabled.",
        INVALID_SIGNATURE:
          "Transaction signature is invalid. The supply key doesn't match.",
        INVALID_TOKEN_ID:
          "The token ID does not exist on this network.",
        TOKEN_WAS_DELETED:
          "This token has been deleted and can no longer be minted.",
        INSUFFICIENT_PAYER_BALANCE:
          "Not enough HBAR to cover the transaction fee.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "MINT_TOKEN_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default mintTokenAction;
