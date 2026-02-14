import { z } from "zod";
import { Action, ActionResult } from "../types/action";
import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  PrivateKey,
  Status,
} from "@hashgraph/sdk";

const createNftCollectionAction: Action = {
  name: "CREATE_NFT_COLLECTION",
  similes: [
    "create nft collection",
    "create nft",
    "launch nft",
    "deploy nft",
    "new nft collection",
    "nft collection",
    "make nft",
  ],
  description:
    "Create a new NFT collection (NonFungibleUnique token) on the Hedera Token Service. The operator key is used as admin and supply key by default. Max supply can optionally be capped.",
  examples: [
    [
      {
        input: {
          name: "Dappily Genesis",
          symbol: "DGEN",
          memo: "The first Dappily NFT collection",
        },
        output: {
          ok: true,
          summary: "Created NFT collection DGEN (0.0.88888)",
          txId: "0.0.12345@1700000000.000000000",
          receipt: { status: "SUCCESS" },
          data: {
            tokenId: "0.0.88888",
            name: "Dappily Genesis",
            symbol: "DGEN",
            type: "NON_FUNGIBLE_UNIQUE",
            treasury: "0.0.12345",
            maxSupply: "unlimited",
            hasAdminKey: true,
            hasSupplyKey: true,
            explorerUrl: "https://hashscan.io/testnet/transaction/...",
          },
        },
        explanation: "Create an NFT collection with unlimited supply",
      },
    ],
  ],
  schema: z.object({
    name: z
      .string()
      .min(1)
      .max(100)
      .describe("The human-readable name of the NFT collection"),
    symbol: z
      .string()
      .min(1)
      .max(100)
      .describe("The ticker symbol for the collection (e.g. 'DGEN')"),
    maxSupply: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional max supply cap. Omit for unlimited."),
    memo: z
      .string()
      .max(100)
      .optional()
      .describe("Optional memo attached to the collection"),
    adminPrivateKey: z
      .string()
      .optional()
      .describe("⚠️ Admin key (only if different from operator key)"),
    supplyPrivateKey: z
      .string()
      .optional()
      .describe("⚠️ Supply key (only if different from operator key)"),
  }),
  requiresConfirmation: true,
  simulate: async (_agent, input) => {
    return {
      summary: `Create NFT collection "${input.name}" (${input.symbol})${input.maxSupply ? `, max supply: ${input.maxSupply}` : ", unlimited supply"}`,
      estimatedFeeHbar: 1,
      warnings: [],
    };
  },
  handler: async (agent, input): Promise<ActionResult> => {
    try {
      const adminKey = input.adminPrivateKey
        ? PrivateKey.fromString(input.adminPrivateKey).publicKey
        : agent.privateKey.publicKey;

      const supplyKey = input.supplyPrivateKey
        ? PrivateKey.fromString(input.supplyPrivateKey).publicKey
        : agent.privateKey.publicKey;

      const tx = new TokenCreateTransaction()
        .setTokenName(input.name)
        .setTokenSymbol(input.symbol)
        .setTokenType(TokenType.NonFungibleUnique)
        .setDecimals(0)
        .setInitialSupply(0)
        .setTreasuryAccountId(agent.accountId)
        .setAdminKey(adminKey)
        .setSupplyKey(supplyKey);

      if (input.maxSupply) {
        tx.setSupplyType(TokenSupplyType.Finite);
        tx.setMaxSupply(input.maxSupply);
      } else {
        tx.setSupplyType(TokenSupplyType.Infinite);
      }

      if (input.memo) {
        tx.setTokenMemo(input.memo);
      }

      // Freeze, sign with custom keys if needed, execute
      const frozenTx = await tx.freezeWith(agent.client as any);

      if (input.adminPrivateKey) {
        await frozenTx.sign(PrivateKey.fromString(input.adminPrivateKey));
      }
      if (input.supplyPrivateKey && input.supplyPrivateKey !== input.adminPrivateKey) {
        await frozenTx.sign(PrivateKey.fromString(input.supplyPrivateKey));
      }

      const response = await frozenTx.execute(agent.client as any);
      const receipt = await response.getReceipt(agent.client as any);

      if (receipt.status !== Status.Success) {
        return {
          ok: false,
          error: receipt.status.toString(),
          details: `NFT collection creation failed with status: ${receipt.status.toString()}`,
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
        summary: `Created NFT collection ${input.symbol} (${tokenId.toString()})`,
        txId,
        receipt: { status: receipt.status.toString() },
        data: {
          tokenId: tokenId.toString(),
          name: input.name,
          symbol: input.symbol,
          type: "NON_FUNGIBLE_UNIQUE",
          treasury: agent.accountId.toString(),
          maxSupply: input.maxSupply?.toString() ?? "unlimited",
          hasAdminKey: true,
          hasSupplyKey: true,
          explorerUrl: agent.getExplorerUrl(txId),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const knownErrors: Record<string, string> = {
        INSUFFICIENT_PAYER_BALANCE:
          "Not enough HBAR to cover the NFT collection creation fee (~1 HBAR).",
        INVALID_TOKEN_SYMBOL: "Token symbol is invalid.",
        INVALID_TOKEN_NAME: "Token name is invalid.",
        INVALID_SIGNATURE:
          "Transaction signature is invalid. Check your keys.",
        INVALID_ACCOUNT_ID:
          "The account ID does not exist on this network.",
        TOKEN_WAS_DELETED: "This token has been deleted.",
      };

      const errorCode = Object.keys(knownErrors).find((code) =>
        message.includes(code)
      );

      return {
        ok: false,
        error: errorCode || "CREATE_NFT_COLLECTION_FAILED",
        details: errorCode ? knownErrors[errorCode] : message,
      };
    }
  },
};

export default createNftCollectionAction;
