import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TransferTransaction,
  AccountId,
  TokenId,
  AccountBalanceQuery,
  PrivateKey,
  Status,
} from "@hashgraph/sdk";

const transferNftAction: Action = {
  name: "TRANSFER_NFT",
  similes: [
    "transfer nft",
    "send nft",
    "give nft",
    "move nft",
    "nft transfer",
  ],
  description:
    "Transfer an NFT (by serial number) to another Hedera account. The recipient must have the NFT collection associated first. The sender defaults to the agent's operator account.",
  examples: [
    [
      {
        input: {
          tokenId: "0.0.88888",
          serial: 1,
          to: "0.0.54321",
        },
        output: {
          ok: true,
          summary: "Transferred NFT 0.0.88888 #1 to 0.0.54321",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            tokenId: "0.0.88888",
            serial: 1,
            from: "0.0.12345",
            to: "0.0.54321",
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Transfer NFT serial #1 to another account",
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
      .describe("The serial number of the NFT to transfer"),
    to: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Invalid Hedera Account ID format (must be 0.0.X)")
      .describe("The recipient's Hedera Account ID"),
    fromAccountId: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Invalid Hedera Account ID format (must be 0.0.X)")
      .optional()
      .describe("Sender account ID. Defaults to the agent's operator account."),
    memo: z
      .string()
      .max(100)
      .optional()
      .describe("Optional transaction memo"),
    senderPrivateKey: z
      .string()
      .optional()
      .describe("⚠️ Sender's private key (only if different from operator key)"),
  }),
  requiresConfirmation: true,
  simulate: async (agent, input) => {
    const from = input.fromAccountId || agent.accountId.toString();
    return {
      summary: `Transfer NFT ${input.tokenId} #${input.serial} from ${from} to ${input.to}`,
      estimatedFeeHbar: 0.001,
      warnings: [],
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const tokenId = TokenId.fromString(input.tokenId);
      const recipient = AccountId.fromString(input.to);
      const sender = input.fromAccountId
        ? AccountId.fromString(input.fromAccountId)
        : agent.accountId;

      // ── Pre-flight: check if recipient has the collection associated ──
      try {
        const recipientBalance = await new AccountBalanceQuery()
          .setAccountId(recipient)
          .execute(agent.client as any);

        if (recipientBalance.tokens) {
          const balanceJson = recipientBalance.toJSON();
          const hasToken = balanceJson.tokens.some(
            (t) => t.tokenId === input.tokenId
          );

          if (!hasToken) {
            return {
              ok: false,
              error: "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT",
              details: `Account ${input.to} has not associated NFT collection ${input.tokenId}. The recipient must run ASSOCIATE_TOKEN first.`,
            };
          }
        }
      } catch {
        // Balance query failed — proceed and let the network return the real error
      }

      // ── Execute transfer ──
      const tx = new TransferTransaction()
        .addNftTransfer(tokenId, input.serial, sender, recipient);

      if (input.memo) {
        tx.setTransactionMemo(input.memo);
      }

      const frozenTx = await tx.freezeWith(agent.client as any);

      if (input.senderPrivateKey) {
        const senderKey = PrivateKey.fromString(input.senderPrivateKey);
        await frozenTx.sign(senderKey);
      }

      const response = await frozenTx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        const statusStr = receipt.status.toString();

        if (statusStr.includes("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT")) {
          return {
            ok: false,
            error: "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT",
            details: `Account ${input.to} has not associated NFT collection ${input.tokenId}. Run ASSOCIATE_TOKEN first.`,
          };
        }

        return {
          ok: false,
          error: statusStr,
          details: `NFT transfer failed with status: ${statusStr}`,
        };
      }

      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: `Transferred NFT ${input.tokenId} #${input.serial} to ${input.to}`,
        txId,
        receipt: { status: receipt.status.toString() },
        data: {
          tokenId: input.tokenId,
          serial: input.serial,
          from: sender.toString(),
          to: input.to,
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT")) {
        return {
          ok: false,
          error: "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT",
          details: `Account ${input.to} has not associated NFT collection ${input.tokenId}. Run ASSOCIATE_TOKEN first.`,
        };
      }

      const knownErrors: Record<string, string> = {
        INVALID_SIGNATURE:
          "Transaction signature is invalid. Check the sender's key.",
        INVALID_ACCOUNT_ID:
          "The account ID does not exist on this network.",
        INVALID_TOKEN_ID:
          "The token ID does not exist on this network.",
        INVALID_NFT_ID:
          "The specified NFT serial does not exist in this collection.",
        SENDER_DOES_NOT_OWN_NFT_SERIAL_NO:
          "The sender does not own this NFT serial number.",
        ACCOUNT_DELETED:
          "The recipient account has been deleted.",
        ACCOUNT_FROZEN_FOR_TOKEN:
          "This account is frozen for this NFT collection.",
        INSUFFICIENT_PAYER_BALANCE:
          "Not enough HBAR to cover the transaction fee.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "TRANSFER_NFT_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default transferNftAction;
