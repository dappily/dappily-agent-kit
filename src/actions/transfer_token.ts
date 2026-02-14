import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TransferTransaction,
  AccountId,
  TokenId,
  AccountBalanceQuery,
  Status,
} from "@hashgraph/sdk";

const transferTokenAction: Action = {
  name: "TRANSFER_TOKEN",
  similes: [
    "send token",
    "transfer token",
    "pay token",
    "send fungible",
    "token transfer",
    "move token",
  ],
  description:
    "Transfer fungible tokens (HTS) from the agent's account (or a specified sender) to a recipient. The recipient must have previously associated the token, or you'll get a clear error with instructions.",
  examples: [
    [
      {
        input: {
          tokenId: "0.0.99999",
          to: "0.0.54321",
          amount: 500,
        },
        output: {
          ok: true,
          summary: "Transferred 500 of token 0.0.99999 to 0.0.54321",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            tokenId: "0.0.99999",
            from: "0.0.12345",
            to: "0.0.54321",
            amount: 500,
            memo: null,
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Transfer 500 fungible tokens from agent to a recipient",
      },
    ],
  ],
  schema: z.object({
    tokenId: z
      .string()
      .regex(
        /^\d+\.\d+\.\d+$/,
        "Invalid Hedera Token ID format (must be 0.0.X)"
      )
      .describe("The token ID to transfer (e.g. 0.0.99999)"),
    to: z
      .string()
      .regex(
        /^\d+\.\d+\.\d+$/,
        "Invalid Hedera Account ID format (must be 0.0.X)"
      )
      .describe("The recipient's Hedera Account ID"),
    amount: z
      .number()
      .int()
      .positive()
      .describe("Amount of tokens to transfer (in smallest unit)"),
    fromAccountId: z
      .string()
      .regex(
        /^\d+\.\d+\.\d+$/,
        "Invalid Hedera Account ID format (must be 0.0.X)"
      )
      .optional()
      .describe("Sender account ID. Defaults to the agent's operator account."),
    memo: z
      .string()
      .max(100)
      .optional()
      .describe("Optional memo for the transaction"),
  }),
  requiresConfirmation: true,
  simulate: async (agent, input) => {
    const from = input.fromAccountId || agent.accountId.toString();
    const warnings: string[] = [];

    if (input.amount >= 1_000_000) {
      warnings.push(
        `Large token transfer: ${input.amount.toLocaleString()} units. Please double-check.`
      );
    }

    return {
      summary: `Transfer ${input.amount.toLocaleString()} of token ${input.tokenId} from ${from} to ${input.to}`,
      estimatedFeeHbar: 0.001,
      warnings,
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const tokenId = TokenId.fromString(input.tokenId);
      const recipient = AccountId.fromString(input.to);
      const sender = input.fromAccountId
        ? AccountId.fromString(input.fromAccountId)
        : agent.accountId;

      // ── Pre-flight: check if recipient has the token associated ──
      try {
        const recipientBalance = await new AccountBalanceQuery()
          .setAccountId(recipient)
          .execute(agent.client as any);

        // If tokens map exists, check if our token is in it
        if (recipientBalance.tokens) {
          const balanceJson = recipientBalance.toJSON();
          const hasToken = balanceJson.tokens.some(
            (t) => t.tokenId === input.tokenId
          );

          if (!hasToken) {
            return {
              ok: false,
              error: "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT",
              details: `Account ${input.to} has not associated token ${input.tokenId}. The recipient must run ASSOCIATE_TOKEN first before they can receive this token.`,
            };
          }
        }
      } catch {
        // Balance query failed — proceed anyway and let the transfer
        // return the real error from the network.
      }

      // ── Execute transfer ──
      const tx = new TransferTransaction()
        .addTokenTransfer(tokenId, sender, -input.amount)
        .addTokenTransfer(tokenId, recipient, input.amount);

      if (input.memo) {
        tx.setTransactionMemo(input.memo);
      }

      const response = await tx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        // Map specific receipt failures
        const statusStr = receipt.status.toString();

        if (statusStr.includes("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT")) {
          return {
            ok: false,
            error: "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT",
            details: `Account ${input.to} has not associated token ${input.tokenId}. Run ASSOCIATE_TOKEN for this account first.`,
          };
        }

        return {
          ok: false,
          error: statusStr,
          details: `Token transfer failed with status: ${statusStr}`,
        };
      }

      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: `Transferred ${input.amount.toLocaleString()} of token ${input.tokenId} to ${input.to}`,
        txId,
        receipt: {
          status: receipt.status.toString(),
        },
        data: {
          tokenId: input.tokenId,
          from: sender.toString(),
          to: input.to,
          amount: input.amount,
          memo: input.memo || null,
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Catch the association error at the network/SDK level too
      if (message.includes("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT")) {
        return {
          ok: false,
          error: "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT",
          details: `Account ${input.to} has not associated token ${input.tokenId}. Run ASSOCIATE_TOKEN for this account first.`,
        };
      }

      const knownErrors: Record<string, string> = {
        INSUFFICIENT_TOKEN_BALANCE:
          "The sender does not have enough of this token.",
        INVALID_ACCOUNT_ID:
          "The account ID does not exist on this network.",
        INVALID_TOKEN_ID:
          "The token ID does not exist on this network.",
        INVALID_SIGNATURE:
          "Transaction signature is invalid. Check your private key.",
        INSUFFICIENT_PAYER_BALANCE:
          "Not enough HBAR to cover the transaction fee.",
        ACCOUNT_FROZEN_FOR_TOKEN:
          "This account is frozen for this token and cannot send or receive it.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "TRANSFER_TOKEN_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default transferTokenAction;
