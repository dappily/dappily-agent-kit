// ── Dappily Agent Kit ──────────────────────────────────────────
// Solana Agent Kit-style actions for Hedera (HTS + NFTs).
// https://github.com/user/dappily-agent-kit

// Core
export { HederaAgentKit } from "./agent";

// Actions — registry
export {
  actions,
  getActionByName,
  findActionBySimile,
} from "./actions";

// Actions — named exports
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
} from "./actions";

// Types
export type {
  Action,
  ActionResult,
  ActionSuccess,
  ActionFailure,
  ActionExample,
  SimulationResult,
  Handler,
} from "./types/action";

// Forge (Self-Forging system)
export {
  ActionSpecSchema,
  validateSpec,
  generateAction,
  SPEC_VERSION,
} from "./forge";
export type { ActionSpec } from "./forge";
