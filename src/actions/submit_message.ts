import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TopicMessageSubmitTransaction,
  PrivateKey,
  Status,
} from "@hashgraph/sdk";

const submitMessageAction: Action = {
  name: "SUBMIT_MESSAGE",
  similes: [
    "submit message",
    "send message",
    "post message",
    "publish message",
    "hcs message",
    "topic message",
    "consensus message",
  ],
  description:
    "Submit a message to a Hedera Consensus Service (HCS) topic. Messages are immutably recorded with a consensus timestamp and sequence number. If the topic has a submit key, the corresponding key must be provided.",
  examples: [
    [
      {
        input: {
          topicId: "0.0.77777",
          message: "Hello from Dappily Agent Kit!",
        },
        output: {
          ok: true,
          summary: "Submitted message to topic 0.0.77777 (seq #42)",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            topicId: "0.0.77777",
            sequenceNumber: "42",
            message: "Hello from Dappily Agent Kit!",
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Submit a text message to an open topic",
      },
    ],
  ],
  schema: z.object({
    topicId: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Invalid Hedera Topic ID format (must be 0.0.X)")
      .describe("The topic ID to submit the message to"),
    message: z
      .string()
      .min(1)
      .describe("The message content (text or base64-encoded binary)"),
    submitPrivateKey: z
      .string()
      .optional()
      .describe("⚠️ Submit key (required if the topic has a submit key and it differs from operator key)"),
    memo: z
      .string()
      .max(100)
      .optional()
      .describe("Optional transaction memo"),
  }),
  requiresConfirmation: false,
  simulate: async (_agent, input) => {
    const msgPreview = input.message.length > 50
      ? input.message.slice(0, 50) + "..."
      : input.message;
    return {
      summary: `Submit message to topic ${input.topicId}: "${msgPreview}"`,
      estimatedFeeHbar: 0.0001,
      warnings: input.message.length > 1024
        ? ["Message exceeds 1KB. Large messages are split into chunks automatically, but cost more."]
        : [],
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(input.topicId)
        .setMessage(input.message);

      if (input.memo) {
        tx.setTransactionMemo(input.memo);
      }

      const frozenTx = await tx.freezeWith(agent.client as any);

      if (input.submitPrivateKey) {
        const submitKey = PrivateKey.fromString(input.submitPrivateKey);
        await frozenTx.sign(submitKey);
      }

      const response = await frozenTx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        return {
          ok: false,
          error: receipt.status.toString(),
          details: `Message submission failed with status: ${receipt.status.toString()}`,
        };
      }

      const txId = response.transactionId.toString();
      const sequenceNumber = receipt.topicSequenceNumber?.toString() ?? "unknown";

      return {
        ok: true,
        summary: `Submitted message to topic ${input.topicId} (seq #${sequenceNumber})`,
        txId,
        receipt: { status: receipt.status.toString() },
        data: {
          topicId: input.topicId,
          sequenceNumber,
          message: input.message,
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const knownErrors: Record<string, string> = {
        INVALID_TOPIC_ID: "The topic ID does not exist on this network.",
        TOPIC_EXPIRED: "This topic has expired and no longer accepts messages.",
        INVALID_SIGNATURE: "Transaction signature is invalid. This topic likely requires a submit key.",
        INSUFFICIENT_PAYER_BALANCE: "Not enough HBAR to cover the transaction fee.",
        INVALID_CHUNK_NUMBER: "Message chunking error. Try a smaller message.",
        MESSAGE_SIZE_TOO_LARGE: "Message exceeds the maximum allowed size.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "SUBMIT_MESSAGE_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default submitMessageAction;
