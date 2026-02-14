import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import { AccountBalanceQuery, AccountId } from "@hashgraph/sdk";

const getBalanceAction: Action = {
  name: "GET_BALANCE",
  similes: [
    "check balance",
    "get balance",
    "account balance",
    "how much hbar",
    "show balance",
    "wallet balance",
  ],
  description:
    "Get the HBAR and token balances for a Hedera account. If no account ID is provided, returns the agent's own balance.",
  examples: [
    [
      {
        input: {},
        output: {
          ok: true,
          summary: "Balance for 0.0.12345: 150.5 ℏ",
          data: {
            accountId: "0.0.12345",
            hbarBalance: "150.5",
            tokens: [],
          },
        },
        explanation:
          "Get the agent's own balance when no accountId is specified",
      },
    ],
    [
      {
        input: { accountId: "0.0.98765" },
        output: {
          ok: true,
          summary: "Balance for 0.0.98765: 42.0 ℏ",
          data: {
            accountId: "0.0.98765",
            hbarBalance: "42.0",
            tokens: [
              { tokenId: "0.0.55555", balance: "1000", decimals: 2 },
            ],
          },
        },
        explanation: "Get balance for a specific account, including tokens",
      },
    ],
  ],
  schema: z.object({
    accountId: z
      .string()
      .regex(
        /^\d+\.\d+\.\d+$/,
        "Invalid Hedera Account ID format (must be 0.0.X)"
      )
      .optional()
      .describe(
        "The Hedera Account ID to check (e.g. 0.0.12345). Defaults to the agent's own account."
      ),
  }),
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const targetId = input.accountId
        ? AccountId.fromString(input.accountId)
        : agent.accountId;

      const balance = await new AccountBalanceQuery()
        .setAccountId(targetId)
        .execute(agent.client as any);

      // Build token list from the balance map
      const tokens: { tokenId: string; balance: string; decimals: number }[] =
        [];
      if (balance.tokens) {
        const tokenJson = balance.toJSON().tokens;
        for (const t of tokenJson) {
          tokens.push({
            tokenId: t.tokenId,
            balance: t.balance,
            decimals: t.decimals,
          });
        }
      }

      const hbarStr = balance.hbars.toString();
      const accountStr = targetId.toString();

      return {
        ok: true,
        summary: `Balance for ${accountStr}: ${hbarStr}`,
        data: {
          accountId: accountStr,
          hbarBalance: hbarStr,
          tokens,
        },
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);

      // Parse known Hedera error codes
      const knownErrors: Record<string, string> = {
        INVALID_ACCOUNT_ID: "The account ID does not exist on this network.",
        ACCOUNT_DELETED: "This account has been deleted.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "BALANCE_QUERY_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default getBalanceAction;
