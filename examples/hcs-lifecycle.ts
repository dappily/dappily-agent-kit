/**
 * Example: Full HCS (Hedera Consensus Service) lifecycle
 * Create topic → Submit messages → Query info → Delete
 *
 * Usage:
 *   OPERATOR_ID=0.0.XXXXX OPERATOR_KEY=302e... npx ts-node examples/hcs-lifecycle.ts
 */
import {
  HederaAgentKit,
  createTopicAction,
  submitMessageAction,
  getTopicInfoAction,
  deleteTopicAction,
} from "../src";

async function main() {
  const agent = new HederaAgentKit(
    process.env.OPERATOR_ID!,
    process.env.OPERATOR_KEY!,
    "testnet"
  );

  // 1. Create topic
  console.log("📡 Creating HCS topic...");
  const create = await createTopicAction.handler(agent, {
    memo: "My agent's event log",
  });

  if (!create.ok) {
    console.error(`❌ Create failed: ${create.error}`);
    return;
  }

  const topicId = create.data.topicId;
  console.log(`✅ Created: ${topicId}`);
  console.log(`   Explorer: ${create.data.explorerUrl}\n`);

  // 2. Submit messages
  const messages = [
    "Agent started",
    "Processing user request...",
    JSON.stringify({ event: "task_complete", status: "ok", ts: Date.now() }),
  ];

  for (const msg of messages) {
    console.log(`📨 Submitting: "${msg.slice(0, 50)}..."`);
    const submit = await submitMessageAction.handler(agent, { topicId, message: msg });
    if (submit.ok) {
      console.log(`   ✅ Seq #${submit.data.sequenceNumber}\n`);
    } else {
      console.error(`   ❌ ${submit.error}\n`);
    }
  }

  // 3. Query topic info
  console.log("🔍 Querying topic info...");
  const info = await getTopicInfoAction.handler(agent, { topicId });
  if (info.ok) {
    console.log(`   Messages: ${info.data.sequenceNumber}`);
    console.log(`   Memo: ${info.data.memo}`);
    console.log(`   Expires: ${info.data.expirationTime}\n`);
  }

  // 4. Clean up
  console.log("🗑️ Deleting topic...");
  const del = await deleteTopicAction.handler(agent, { topicId });
  if (del.ok) {
    console.log(`✅ Deleted. txId: ${del.txId}\n`);
  }

  console.log("🦞 HCS lifecycle complete.");
}

main();
