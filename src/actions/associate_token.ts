import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TokenAssociateTransaction,
  AccountId,
  PrivateKey,
  Status,
} from "@hashgraph/sdk";

const associateTokenAction: Action = {
  name: "ASSOCIATE_TOKEN",
  similes: [
    "associate token",
    "link token",
    "add token",
    "enable token",
    "opt in token",
    "connect token",
  ],
  description:
    "Associate a token with a Hedera account so it can receive that token. On Hedera, accounts must explicitly opt-in to receive tokens. If no accountId is provided, associates with the agent's operator account. For third-party accounts, a private key is required (short-term; wallet signing planned).",
  examples: [
    [
      {
        input: {
          tokenId: "0.0.99999",
        },
        output: {
          ok: true,
          summary: "Associated token 0.0.99999 with account 0.0.12345",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            tokenId: "0.0.99999",
            accountId: "0.0.12345",
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Associate a token with the agent's own account",
      },
    ],
    [
      {
        input: {
          tokenId: "0.0.99999",
          accountId: "0.0.54321",
          accountPrivateKey: "302e020100300506...hex...",
        },
        output: {
          ok: true,
          summary: "Associated token 0.0.99999 with account 0.0.54321",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            tokenId: "0.0.99999",
            accountId: "0.0.54321",
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation:
          "Associate a token with a third-party account using their private key",
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
      .describe("The token ID to associate (e.g. 0.0.99999)"),
    accountId: z
      .string()
      .regex(
        /^\d+\.\d+\.\d+$/,
        "Invalid Hedera Account ID format (must be 0.0.X)"
      )
      .optional()
      .describe(
        "The account to associate the token with. Defaults to the agent's operator account."
      ),
    accountPrivateKey: z
      .string()
      .optional()
      .describe(
        "⚠️ Private key of the target account (required for third-party accounts). Will be replaced by wallet signing in a future version."
      ),
  }),
  requiresConfirmation: true,
  simulate: async (agent, input) => {
    const targetAccount = input.accountId || agent.accountId.toString();
    const isThirdParty = input.accountId && input.accountId !== agent.accountId.toString();
    const warnings: string[] = [];

    if (isThirdParty && !input.accountPrivateKey) {
      warnings.push(
        "Third-party account requires a private key. The transaction will fail without it."
      );
    }

    return {
      summary: `Associate token ${input.tokenId} with account ${targetAccount}`,
      estimatedFeeHbar: 0.05,
      warnings,
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const targetAccountId = input.accountId
        ? AccountId.fromString(input.accountId)
        : agent.accountId;

      const isThirdParty =
        input.accountId &&
        input.accountId !== agent.accountId.toString();

      // If third-party account but no key provided, fail early with guidance
      if (isThirdParty && !input.accountPrivateKey) {
        return {
          ok: false,
          error: "SIGNATURE_REQUIRED",
          details: `Account ${input.accountId} is not the agent's operator. Provide 'accountPrivateKey' or have the account owner sign via a wallet.`,
        };
      }

      const tx = new TokenAssociateTransaction()
        .setAccountId(targetAccountId)
        .setTokenIds([input.tokenId]);

      // Freeze the transaction before signing
      const frozenTx = await tx.freezeWith(agent.client as any);

      // Sign with the target account's key
      if (isThirdParty && input.accountPrivateKey) {
        const thirdPartyKey = PrivateKey.fromString(input.accountPrivateKey);
        await frozenTx.sign(thirdPartyKey);
      }

      const response = await frozenTx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        return {
          ok: false,
          error: receipt.status.toString(),
          details: `Token association failed with status: ${receipt.status.toString()}`,
        };
      }

      const txId = response.transactionId.toString();

      return {
        ok: true,
        summary: `Associated token ${input.tokenId} with account ${targetAccountId.toString()}`,
        txId,
        receipt: {
          status: receipt.status.toString(),
        },
        data: {
          tokenId: input.tokenId,
          accountId: targetAccountId.toString(),
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const knownErrors: Record<string, string> = {
        TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT:
          "This token is already associated with this account.",
        INVALID_ACCOUNT_ID:
          "The account ID does not exist on this network.",
        INVALID_TOKEN_ID:
          "The token ID does not exist on this network.",
        TOKENS_PER_ACCOUNT_LIMIT_EXCEEDED:
          "This account has reached its maximum token association limit.",
        INVALID_SIGNATURE:
          "Transaction signature is invalid. Check the private key provided.",
        INSUFFICIENT_PAYER_BALANCE:
          "Not enough HBAR to cover the transaction fee.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "ASSOCIATE_TOKEN_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default associateTokenAction;
