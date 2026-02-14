/**
 * Example: Full fungible token lifecycle
 * Create → Mint → Transfer (to self) → Burn
 *
 * Usage:
 *   OPERATOR_ID=0.0.XXXXX OPERATOR_KEY=302e... npx ts-node examples/fungible-lifecycle.ts
 */
import {
  HederaAgentKit,
  createTokenAction,
  mintTokenAction,
  transferTokenAction,
  burnTokenAction,
} from "../src";

async function main() {
  const agent = new HederaAgentKit(
    process.env.OPERATOR_ID!,
    process.env.OPERATOR_KEY!,
    "testnet"
  );

  // 1. Create token
  console.log("🪙 Creating token...");
  const create = await createTokenAction.handler(agent, {
    name: "Example Token",
    symbol: "EXT",
    initialSupply: 1000,
    decimals: 0,
    memo: "Created with dappily-agent-kit",
  });

  if (!create.ok) {
    console.error(`❌ Create failed: ${create.error}`);
    return;
  }

  const tokenId = create.data.tokenId;
  console.log(`✅ Created: ${tokenId}`);
  console.log(`   Explorer: ${create.data.explorerUrl}\n`);

  // 2. Mint more
  console.log("⛏️ Minting 500 more...");
  const mint = await mintTokenAction.handler(agent, { tokenId, amount: 500 });

  if (mint.ok) {
    console.log(`✅ Minted. New supply: ${mint.data.newTotalSupply}\n`);
  } else {
    console.error(`❌ Mint failed: ${mint.error}\n`);
  }

  // 3. Transfer to self (proves the path)
  console.log("📤 Transferring 100 to self...");
  const xfer = await transferTokenAction.handler(agent, {
    tokenId,
    to: process.env.OPERATOR_ID!,
    amount: 100,
  });

  if (xfer.ok) {
    console.log(`✅ Transferred. txId: ${xfer.txId}\n`);
  } else {
    console.error(`❌ Transfer failed: ${xfer.error}\n`);
  }

  // 4. Burn
  console.log("🔥 Burning 200...");
  const burn = await burnTokenAction.handler(agent, { tokenId, amount: 200 });

  if (burn.ok) {
    console.log(`✅ Burned. New supply: ${burn.data.newTotalSupply}\n`);
  } else {
    console.error(`❌ Burn failed: ${burn.error}\n`);
  }

  console.log("🦞 Fungible lifecycle complete.");
}

main();
