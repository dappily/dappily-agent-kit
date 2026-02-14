import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TransferTransaction,
  Hbar,
  AccountId,
  Status,
} from "@hashgraph/sdk";

const hbarTransferAction: Action = {
  name: "HBAR_TRANSFER",
  similes: [
    "send hbar",
    "pay hbar",
    "transfer hbar",
    "send money",
    "transfer funds",
    "tip hbar",
  ],
  description: "Send HBAR (native cryptocurrency) to another Hedera account.",
  examples: [
    [
      {
        input: {
          to: "0.0.12345",
          amount: 10,
          memo: "Payment for services",
        },
        output: {
          ok: true,
          summary: "Sent 10 HBAR to 0.0.12345",
          txId: "0.0.98765@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            from: "0.0.98765",
            to: "0.0.12345",
            amount: 10,
            memo: "Payment for services",
            explorerUrl:
              "https://hashscan.io/testnet/transaction/0-0-98765-1700000000-000000000",
          },
        },
        explanation: "Send 10 HBAR to account 0.0.12345 with a memo",
      },
    ],
  ],
  schema: z.object({
    to: z
      .string()
      .regex(
        /^\d+\.\d+\.\d+$/,
        "Invalid Hedera Account ID format (must be 0.0.X)"
      )
      .describe("The recipient's Hedera Account ID (e.g. 0.0.12345)"),
    amount: z.number().positive().describe("Amount of HBAR to send"),
    memo: z
      .string()
      .max(100)
      .optional()
      .describe("Optional memo for the transaction"),
  }),
  requiresConfirmation: true,
  simulate: async (agent, input) => {
    return {
      summary: `Send ${input.amount} HBAR from ${agent.accountId.toString()} to ${input.to}`,
      estimatedFeeHbar: 0.0001,
      warnings:
        input.amount >= 100
          ? [`Large transfer: ${input.amount} HBAR. Please double-check.`]
          : [],
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const recipient = AccountId.fromString(input.to);
      const amount = new Hbar(input.amount);

      const tx = new TransferTransaction()
        .addHbarTransfer(agent.accountId, amount.negated())
        .addHbarTransfer(recipient, amount);

      if (input.memo) {
        tx.setTransactionMemo(input.memo);
      }

      const response = await tx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        return {
          ok: false,
          error: receipt.status.toString(),
          details: `Transaction ${response.transactionId.toString()} failed with status: ${receipt.status.toString()}`,
        };
      }

      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: `Sent ${input.amount} HBAR to ${input.to}`,
        txId,
        receipt: {
          status: receipt.status.toString(),
        },
        data: {
          from: agent.accountId.toString(),
          to: input.to,
          amount: input.amount,
          memo: input.memo || null,
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);

      // Parse known Hedera error codes
      const knownErrors: Record<string, string> = {
        INSUFFICIENT_PAYER_BALANCE:
          "The sending account does not have enough HBAR.",
        INVALID_ACCOUNT_ID:
          "The recipient account ID does not exist on this network.",
        ACCOUNT_DELETED: "The recipient account has been deleted.",
        INVALID_SIGNATURE:
          "Transaction signature is invalid. Check your private key.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "TRANSFER_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default hbarTransferAction;
