/**
 * 🦞 Dappily Agent Kit — HCS Integration Test (Testnet)
 */
import { HederaAgentKit } from "./agent";
import {
  createTopicAction,
  submitMessageAction,
  getTopicInfoAction,
  deleteTopicAction,
} from "./actions";
import { ActionResult } from "./types/action";

const OPERATOR_ID = "0.0.7420047";
const OPERATOR_KEY = "302e020100300506032b657004220420f9e59afd0ba5ebf0f3ffcaa24b246c68d1eaab41fa20291d991e4dd94a4a614c";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}`); failed++; }
}

function section(title: string) { console.log(`\n═══ ${title} ═══`); }

function expectOk(label: string, result: ActionResult): result is ActionResult & { ok: true } {
  if (result.ok) { console.log(`  ✅ ${label}`); passed++; return true; }
  else { console.log(`  ❌ ${label} → ${result.error}: ${result.details}`); failed++; return false; }
}

async function main() {
  console.log("🦞 Dappily Agent Kit — HCS Integration Test\n");

  const agent = new HederaAgentKit(OPERATOR_ID, OPERATOR_KEY, "testnet");
  console.log(`Operator: ${OPERATOR_ID} on testnet`);

  // 1. Create topic
  section("1. CREATE_TOPIC");
  const createResult = await createTopicAction.handler(agent, {
    memo: "dappily-agent-kit HCS test",
  });
  let topicId: string | null = null;
  if (expectOk("Topic created", createResult)) {
    topicId = createResult.data.topicId;
    assert("Has topicId", typeof topicId === "string" && topicId.startsWith("0.0."));
    assert("Has txId", typeof createResult.txId === "string");
    assert("Receipt SUCCESS", createResult.receipt?.status === "SUCCESS");
    assert("Has admin key", createResult.data.hasAdminKey === true);
    console.log(`  📊 Topic ID: ${topicId}`);
    console.log(`  📊 Explorer: ${createResult.data.explorerUrl}`);
  }

  // 2. Submit messages
  if (topicId) {
    section("2. SUBMIT_MESSAGE (3 messages)");

    for (let i = 1; i <= 3; i++) {
      const msg = `Message #${i} from Dappily Agent Kit — ${new Date().toISOString()}`;
      const submitResult = await submitMessageAction.handler(agent, {
        topicId,
        message: msg,
      });
      if (expectOk(`Message #${i} submitted`, submitResult)) {
        assert(`Seq #${i}`, submitResult.data.sequenceNumber === String(i));
        console.log(`  📊 Seq: ${submitResult.data.sequenceNumber}, txId: ${submitResult.txId}`);
      }
    }
  }

  // 3. Get topic info
  if (topicId) {
    section("3. GET_TOPIC_INFO");
    const infoResult = await getTopicInfoAction.handler(agent, { topicId });
    if (expectOk("Topic info retrieved", infoResult)) {
      assert("Correct topicId", infoResult.data.topicId === topicId);
      assert("Memo matches", infoResult.data.memo === "dappily-agent-kit HCS test");
      assert("Sequence number is 3", infoResult.data.sequenceNumber === "3");
      assert("Has admin key", infoResult.data.hasAdminKey === true);
      assert("Has expiration", infoResult.data.expirationTime !== null);
      console.log(`  📊 Messages: ${infoResult.data.sequenceNumber}`);
      console.log(`  📊 Expires: ${infoResult.data.expirationTime}`);
    }
  }

  // 4. Delete topic
  if (topicId) {
    section("4. DELETE_TOPIC");
    const deleteResult = await deleteTopicAction.handler(agent, { topicId });
    if (expectOk("Topic deleted", deleteResult)) {
      assert("Has txId", typeof deleteResult.txId === "string");
      assert("Receipt SUCCESS", deleteResult.receipt?.status === "SUCCESS");
      console.log(`  📊 Deleted topic ${topicId}`);
    }
  }

  // 5. Verify deletion
  if (topicId) {
    section("5. Verify deletion (expect failure)");
    const postDeleteInfo = await getTopicInfoAction.handler(agent, { topicId });
    assert("Query fails after deletion", postDeleteInfo.ok === false);
    if (!postDeleteInfo.ok) {
      console.log(`  📊 Error: ${postDeleteInfo.error}`);
    }
  }

  section("RESULTS");
  console.log(`\n  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  Total:   ${passed + failed}`);
  console.log(`\n🦞 HCS integration test complete.`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error("💀", err); process.exit(1); });
