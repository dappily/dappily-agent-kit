/**
 * Example: Full NFT lifecycle
 * Create collection → Mint NFTs → Burn one
 *
 * Usage:
 *   OPERATOR_ID=0.0.XXXXX OPERATOR_KEY=302e... npx ts-node examples/nft-lifecycle.ts
 */
import {
  HederaAgentKit,
  createNftCollectionAction,
  mintNftAction,
  burnNftAction,
} from "../src";

async function main() {
  const agent = new HederaAgentKit(
    process.env.OPERATOR_ID!,
    process.env.OPERATOR_KEY!,
    "testnet"
  );

  // 1. Create NFT collection
  console.log("🎨 Creating NFT collection...");
  const create = await createNftCollectionAction.handler(agent, {
    name: "Example NFTs",
    symbol: "ENFT",
    memo: "Created with dappily-agent-kit",
  });

  if (!create.ok) {
    console.error(`❌ Create failed: ${create.error}`);
    return;
  }

  const tokenId = create.data.tokenId;
  console.log(`✅ Collection created: ${tokenId}`);
  console.log(`   Explorer: ${create.data.explorerUrl}\n`);

  // 2. Mint 3 NFTs with metadata
  console.log("⛏️ Minting 3 NFTs...");
  const metadata = [
    Buffer.from("NFT #1 — Hello World").toString("base64"),
    Buffer.from("NFT #2 — Dappily Rocks").toString("base64"),
    Buffer.from("NFT #3 — To Be Burned").toString("base64"),
  ];

  const mint = await mintNftAction.handler(agent, { tokenId, metadata });

  if (mint.ok) {
    console.log(`✅ Minted serials: ${mint.data.serials.join(", ")}\n`);
  } else {
    console.error(`❌ Mint failed: ${mint.error}\n`);
    return;
  }

  // 3. Burn serial #3
  console.log("🔥 Burning serial #3...");
  const burn = await burnNftAction.handler(agent, { tokenId, serial: 3 });

  if (burn.ok) {
    console.log(`✅ Burned serial #3. txId: ${burn.txId}\n`);
  } else {
    console.error(`❌ Burn failed: ${burn.error}\n`);
  }

  console.log("🦞 NFT lifecycle complete.");
}

main();
