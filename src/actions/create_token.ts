import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  Status,
} from "@hashgraph/sdk";

const createTokenAction: Action = {
  name: "CREATE_TOKEN",
  similes: [
    "create token",
    "launch token",
    "deploy token",
    "make token",
    "new token",
    "mint token",
    "token factory",
  ],
  description:
    "Create a new fungible token on the Hedera Token Service (HTS). The agent's operator account is used as the treasury by default. The operator key is set as both admin key and supply key, enabling future mint/burn operations.",
  examples: [
    [
      {
        input: {
          name: "Dappily Coin",
          symbol: "DAPP",
          initialSupply: 1000000,
          decimals: 2,
          memo: "The Dappily utility token",
        },
        output: {
          ok: true,
          summary: "Created token DAPP (0.0.99999) with initial supply 1,000,000",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            tokenId: "0.0.99999",
            name: "Dappily Coin",
            symbol: "DAPP",
            decimals: 2,
            initialSupply: 1000000,
            treasury: "0.0.12345",
            hasAdminKey: true,
            hasSupplyKey: true,
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Create a fungible token with 2 decimal places and 1M initial supply",
      },
    ],
  ],
  schema: z.object({
    name: z
      .string()
      .min(1)
      .max(100)
      .describe("The human-readable name of the token (e.g. 'Dappily Coin')"),
    symbol: z
      .string()
      .min(1)
      .max(100)
      .describe("The ticker symbol for the token (e.g. 'DAPP')"),
    decimals: z
      .number()
      .int()
      .min(0)
      .max(18)
      .optional()
      .default(0)
      .describe("Number of decimal places (default 0, max 18)"),
    initialSupply: z
      .number()
      .int()
      .min(0)
      .describe("Initial supply of the token (in the smallest unit)"),
    memo: z
      .string()
      .max(100)
      .optional()
      .describe("Optional memo attached to the token"),
  }),
  requiresConfirmation: true,
  simulate: async (agent, input) => {
    return {
      summary: `Create token "${input.name}" (${input.symbol}) with supply ${input.initialSupply.toLocaleString()} and ${input.decimals ?? 0} decimals`,
      estimatedFeeHbar: 1, // Token creation costs ~1 HBAR
      warnings: [],
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const decimals = input.decimals ?? 0;

      const tx = new TokenCreateTransaction()
        .setTokenName(input.name)
        .setTokenSymbol(input.symbol)
        .setDecimals(decimals)
        .setInitialSupply(input.initialSupply)
        .setTreasuryAccountId(agent.accountId)
        .setAdminKey(agent.privateKey.publicKey)
        .setSupplyKey(agent.privateKey.publicKey)
        .setTokenType(TokenType.FungibleCommon)
        .setSupplyType(TokenSupplyType.Infinite);

      if (input.memo) {
        tx.setTokenMemo(input.memo);
      }

      const response = await tx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        return {
          ok: false,
          error: receipt.status.toString(),
          details: `Token creation failed with status: ${receipt.status.toString()}`,
        };
      }

      const tokenId = receipt.tokenId;
      if (!tokenId) {
        return {
          ok: false,
          error: "NO_TOKEN_ID",
          details: "Transaction succeeded but no token ID was returned.",
        };
      }

      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: `Created token ${input.symbol} (${tokenId.toString()}) with initial supply ${input.initialSupply.toLocaleString()}`,
        txId,
        receipt: {
          status: receipt.status.toString(),
        },
        data: {
          tokenId: tokenId.toString(),
          name: input.name,
          symbol: input.symbol,
          decimals,
          initialSupply: input.initialSupply,
          treasury: agent.accountId.toString(),
          hasAdminKey: true,
          hasSupplyKey: true,
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const knownErrors: Record<string, string> = {
        INSUFFICIENT_PAYER_BALANCE:
          "Not enough HBAR to cover the token creation fee (~1 HBAR).",
        INVALID_TOKEN_SYMBOL: "Token symbol is invalid.",
        INVALID_TOKEN_NAME: "Token name is invalid.",
        TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT:
          "This token is already associated with the treasury.",
        TOKENS_PER_ACCOUNT_LIMIT_EXCEEDED:
          "The treasury account has reached its token association limit.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "CREATE_TOKEN_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default createTokenAction;
