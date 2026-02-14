/**
 * Example: Check account balance
 *
 * Usage:
 *   OPERATOR_ID=0.0.XXXXX OPERATOR_KEY=302e... npx ts-node examples/balance.ts
 */
import { HederaAgentKit, getBalanceAction } from "../src";

async function main() {
  const agent = new HederaAgentKit(
    process.env.OPERATOR_ID!,
    process.env.OPERATOR_KEY!,
    "testnet"
  );

  // Check own balance
  const result = await getBalanceAction.handler(agent, {});

  if (result.ok) {
    console.log(`💰 Balance: ${result.data.hbarBalance}`);
    console.log(`🪙 Tokens: ${result.data.tokens.length}`);
    for (const t of result.data.tokens) {
      console.log(`   ${t.tokenId}: ${t.balance} (${t.decimals} decimals)`);
    }
  } else {
    console.error(`❌ ${result.error}: ${result.details}`);
  }
}

main();
