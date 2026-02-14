import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import { TopicInfoQuery } from "@hashgraph/sdk";

const getTopicInfoAction: Action = {
  name: "GET_TOPIC_INFO",
  similes: [
    "topic info",
    "get topic",
    "check topic",
    "topic details",
    "topic status",
    "hcs info",
  ],
  description:
    "Query information about a Hedera Consensus Service (HCS) topic — its memo, sequence number, admin/submit keys, and expiration. This is a free query (no transaction fee).",
  examples: [
    [
      {
        input: {
          topicId: "0.0.77777",
        },
        output: {
          ok: true,
          summary: "Topic 0.0.77777: 42 messages, memo: \"event log\"",
          data: {
            topicId: "0.0.77777",
            memo: "event log",
            sequenceNumber: "42",
            hasAdminKey: true,
            hasSubmitKey: false,
            expirationTime: "2027-02-14T00:00:00.000Z",
          },
        },
        explanation: "Get info about an existing topic",
      },
    ],
  ],
  schema: z.object({
    topicId: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "Invalid Hedera Topic ID format (must be 0.0.X)")
      .describe("The topic ID to query"),
  }),
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const info = await new TopicInfoQuery()
        .setTopicId(input.topicId)
        .execute(agent.client as any);

      return {
        ok: true,
        summary: `Topic ${info.topicId.toString()}: ${info.sequenceNumber.toString()} messages${info.topicMemo ? `, memo: "${info.topicMemo}"` : ""}`,
        data: {
          topicId: info.topicId.toString(),
          memo: info.topicMemo || null,
          sequenceNumber: info.sequenceNumber.toString(),
          hasAdminKey: info.adminKey !== null,
          hasSubmitKey: info.submitKey !== null,
          expirationTime: info.expirationTime?.toDate().toISOString() ?? null,
          autoRenewPeriod: info.autoRenewPeriod?.seconds?.toString() ?? null,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const knownErrors: Record<string, string> = {
        INVALID_TOPIC_ID: "The topic ID does not exist on this network.",
        TOPIC_EXPIRED: "This topic has expired.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "GET_TOPIC_INFO_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default getTopicInfoAction;
