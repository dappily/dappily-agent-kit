// ── Dappily Agent Kit: Action Registry ──────────────────────────
// All actions are exported here for easy consumption by agent runners.

// Core
import getBalanceAction from "./get_balance";
import hbarTransferAction from "./transfer";

// Fungible Tokens (HTS)
import createTokenAction from "./create_token";
import associateTokenAction from "./associate_token";
import transferTokenAction from "./transfer_token";
import mintTokenAction from "./mint_token";
import burnTokenAction from "./burn_token";

// NFTs (HTS)
import createNftCollectionAction from "./create_nft_collection";
import mintNftAction from "./mint_nft";
import transferNftAction from "./transfer_nft";
import burnNftAction from "./burn_nft";

// Consensus Service (HCS)
import createTopicAction from "./create_topic";
import submitMessageAction from "./submit_message";
import getTopicInfoAction from "./get_topic_info";
import deleteTopicAction from "./delete_topic";

import { Action } from "../types/action";

// Master list — order matters for display, not execution
export const actions: Action[] = [
  // Core
  getBalanceAction,
  hbarTransferAction,
  // Fungible
  createTokenAction,
  associateTokenAction,
  transferTokenAction,
  mintTokenAction,
  burnTokenAction,
  // NFT
  createNftCollectionAction,
  mintNftAction,
  transferNftAction,
  burnNftAction,
  // HCS
  createTopicAction,
  submitMessageAction,
  getTopicInfoAction,
  deleteTopicAction,
];

// Named exports for direct imports
export {
  getBalanceAction,
  hbarTransferAction,
  createTokenAction,
  associateTokenAction,
  transferTokenAction,
  mintTokenAction,
  burnTokenAction,
  createNftCollectionAction,
  mintNftAction,
  transferNftAction,
  burnNftAction,
  createTopicAction,
  submitMessageAction,
  getTopicInfoAction,
  deleteTopicAction,
};

// Lookup by name
export function getActionByName(name: string): Action | undefined {
  return actions.find((a) => a.name === name);
}

// Fuzzy match by simile — scores by how many simile words appear in the query
export function findActionBySimile(query: string): Action | undefined {
  const q = query.toLowerCase();
  let bestAction: Action | undefined;
  let bestScore = 0;

  for (const action of actions) {
    for (const simile of action.similes) {
      const sWords = simile.toLowerCase().split(/\s+/);
      const matched = sWords.filter((w) => q.includes(w)).length;
      const score = matched / sWords.length; // % of simile words found in query
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }
  }

  // Require at least 50% word overlap to count as a match
  return bestScore >= 0.5 ? bestAction : undefined;
}
