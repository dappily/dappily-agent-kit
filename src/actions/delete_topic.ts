import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TopicDeleteTransaction,
  PrivateKey,
  Status,
} from "@hashgraph/sdk";

const deleteTopicAction: Action = {
  name: "DELETE_TOPIC",
  similes: [
    "delete topic",
    "remove topic",
    "close topic",
    "destroy topic",
  ],
  description:
    "Delete a Hedera Consensus Service (HCS) topic. Requires the admin key. This is irreversible — the topic will no longer accept messages and its data becomes inaccessible via the SDK.",
  examples: [
    [
      {
        input: {
          topicId: "0.0.77777",
        },
        output: {
          ok: true,
          summary: "Deleted topic 0.0.77777",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            topicId: "0.0.77777",
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Delete a topic using the operator's admin key",
      },
    ],
  ],
  schema: z.object({
    topicId: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Invalid Hedera Topic ID format (must be 0.0.X)")
      .describe("The topic ID to delete"),
    adminPrivateKey: z
      .string()
      .optional()
      .describe("⚠️ Admin key (only if different from operator key)"),
  }),
  requiresConfirmation: true,
  simulate: async (_agent, input) => {
    return {
      summary: `Delete topic ${input.topicId}`,
      estimatedFeeHbar: 0.005,
      warnings: [
        "⚠️ Topic deletion is irreversible. The topic will no longer accept messages.",
      ],
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const tx = new TopicDeleteTransaction()
        .setTopicId(input.topicId);

      const frozenTx = await tx.freezeWith(agent.client as any);

      if (input.adminPrivateKey) {
        const adminKey = PrivateKey.fromString(input.adminPrivateKey);
        await frozenTx.sign(adminKey);
      }

      const response = await frozenTx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        return {
          ok: false,
          error: receipt.status.toString(),
          details: `Topic deletion failed with status: ${receipt.status.toString()}`,
        };
      }

      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: `Deleted topic ${input.topicId}`,
        txId,
        receipt: { status: receipt.status.toString() },
        data: {
          topicId: input.topicId,
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const knownErrors: Record<string, string> = {
        INVALID_TOPIC_ID: "The topic ID does not exist on this network.",
        UNAUTHORIZED: "The provided key is not the admin key for this topic.",
        INVALID_SIGNATURE: "Transaction signature is invalid. Check the admin key.",
        INSUFFICIENT_PAYER_BALANCE: "Not enough HBAR to cover the transaction fee.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "DELETE_TOPIC_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default deleteTopicAction;
