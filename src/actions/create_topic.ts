import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TopicCreateTransaction,
  PrivateKey,
  Status,
} from "@hashgraph/sdk";

const createTopicAction: Action = {
  name: "CREATE_TOPIC",
  similes: [
    "create topic",
    "new topic",
    "create channel",
    "consensus topic",
    "hcs topic",
    "message topic",
  ],
  description:
    "Create a new topic on the Hedera Consensus Service (HCS). Topics act as message streams — any account (or only authorized ones if a submit key is set) can publish messages. The operator key is used as admin key by default.",
  examples: [
    [
      {
        input: {
          memo: "dappily-agent-kit event log",
        },
        output: {
          ok: true,
          summary: "Created topic 0.0.77777",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            topicId: "0.0.77777",
            memo: "dappily-agent-kit event log",
            hasAdminKey: true,
            hasSubmitKey: false,
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Create an open topic (anyone can submit messages)",
      },
    ],
  ],
  schema: z.object({
    memo: z
      .string()
      .max(100)
      .optional()
      .describe("Short description of the topic's purpose"),
    requireSubmitKey: z
      .boolean()
      .optional()
      .default(false)
      .describe("If true, only the operator (or provided key) can submit messages. Default: open to all."),
    adminPrivateKey: z
      .string()
      .optional()
      .describe("⚠️ Admin key (only if different from operator key)"),
    submitPrivateKey: z
      .string()
      .optional()
      .describe("⚠️ Submit key (only if different from operator key). Only used if requireSubmitKey is true."),
  }),
  requiresConfirmation: false,
  simulate: async (_agent, input) => {
    return {
      summary: `Create HCS topic${input.memo ? `: "${input.memo}"` : ""}${input.requireSubmitKey ? " (restricted submit)" : " (open submit)"}`,
      estimatedFeeHbar: 0.01,
      warnings: [],
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const adminKey = input.adminPrivateKey
        ? PrivateKey.fromString(input.adminPrivateKey).publicKey
        : agent.privateKey.publicKey;

      const tx = new TopicCreateTransaction()
        .setAdminKey(adminKey);

      if (input.requireSubmitKey) {
        const submitKey = input.submitPrivateKey
          ? PrivateKey.fromString(input.submitPrivateKey).publicKey
          : agent.privateKey.publicKey;
        tx.setSubmitKey(submitKey);
      }

      if (input.memo) {
        tx.setTopicMemo(input.memo);
      }

      const frozenTx = await tx.freezeWith(agent.client as any);

      if (input.adminPrivateKey) {
        await frozenTx.sign(PrivateKey.fromString(input.adminPrivateKey));
      }

      const response = await frozenTx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        return {
          ok: false,
          error: receipt.status.toString(),
          details: `Topic creation failed with status: ${receipt.status.toString()}`,
        };
      }

      const topicId = receipt.topicId;
      if (!topicId) {
        return {
          ok: false,
          error: "NO_TOPIC_ID",
          details: "Transaction succeeded but no topic ID was returned.",
        };
      }

      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: `Created topic ${topicId.toString()}`,
        txId,
        receipt: { status: receipt.status.toString() },
        data: {
          topicId: topicId.toString(),
          memo: input.memo || null,
          hasAdminKey: true,
          hasSubmitKey: !!input.requireSubmitKey,
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const knownErrors: Record<string, string> = {
        INVALID_SIGNATURE: "Transaction signature is invalid. Check your keys.",
        INSUFFICIENT_PAYER_BALANCE: "Not enough HBAR to cover the transaction fee.",
        AUTORENEW_DURATION_NOT_IN_RANGE: "The auto-renew duration is outside the allowed range.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "CREATE_TOPIC_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default createTopicAction;
