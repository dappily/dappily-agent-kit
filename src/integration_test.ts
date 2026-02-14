/**
 * 🦞 Dappily Agent Kit — REAL Integration Test (Testnet)
 * 
 * This runs actual transactions against Hedera testnet.
 * Requires a funded testnet account.
 */

import { HederaAgentKit } from "./agent";
import {
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
} from "./actions";
import { ActionResult } from "./types/action";

// ── Testnet Credentials ────────────────────────────────────────
const OPERATOR_ID = "0.0.7420047";
const OPERATOR_KEY = "302e020100300506032b657004220420f9e59afd0ba5ebf0f3ffcaa24b246c68d1eaab41fa20291d991e4dd94a4a614c";

// ── Helpers ────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n═══ ${title} ═══`);
}

function expectOk(label: string, result: ActionResult): result is ActionResult & { ok: true } {
  if (result.ok) {
    console.log(`  ✅ ${label}`);
    passed++;
    return true;
  } else {
    console.log(`  ❌ ${label} → ${result.error}: ${result.details}`);
    failed++;
    return false;
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log("🦞 Dappily Agent Kit — REAL Integration Test (Testnet)\n");

  const agent = new HederaAgentKit(OPERATOR_ID, OPERATOR_KEY, "testnet");
  console.log(`Operator: ${OPERATOR_ID} on testnet\n`);

  // ── 1. GET_BALANCE ───────────────────────────────────────────
  section("1. GET_BALANCE (own account)");
  const balResult = await getBalanceAction.handler(agent, {});
  if (expectOk("Balance query succeeded", balResult)) {
    console.log(`  📊 HBAR: ${balResult.data.hbarBalance}`);
    console.log(`  📊 Tokens: ${balResult.data.tokens.length}`);
    assert("Has non-zero balance", !balResult.data.hbarBalance.startsWith("0 "));
  }

  // ── 2. HBAR_TRANSFER (self-transfer to prove it works) ──────
  section("2. HBAR_TRANSFER (send 1 HBAR to self)");
  const xferResult = await hbarTransferAction.handler(agent, {
    to: OPERATOR_ID,  // send to self — safe, proves the path
    amount: 1,
    memo: "dappily-agent-kit integration test",
  });
  if (expectOk("Transfer succeeded", xferResult)) {
    assert("Has txId", typeof xferResult.txId === "string" && xferResult.txId.length > 0);
    assert("Receipt status is SUCCESS", xferResult.receipt?.status === "SUCCESS");
    assert("Has explorerUrl", typeof xferResult.data.explorerUrl === "string");
    console.log(`  📊 txId: ${xferResult.txId}`);
    console.log(`  📊 Explorer: ${xferResult.data.explorerUrl}`);
  }

  // ── 3. CREATE_TOKEN (fungible) ──────────────────────────────
  section("3. CREATE_TOKEN (fungible)");
  const createResult = await createTokenAction.handler(agent, {
    name: "Dappily Test Token",
    symbol: "DTT",
    initialSupply: 10000,
    decimals: 2,
    memo: "Integration test token",
  });
  let fungibleTokenId: string | null = null;
  if (expectOk("Token creation succeeded", createResult)) {
    fungibleTokenId = createResult.data.tokenId;
    assert("Has tokenId", typeof fungibleTokenId === "string" && fungibleTokenId.startsWith("0.0."));
    assert("Has txId", typeof createResult.txId === "string");
    assert("Receipt status is SUCCESS", createResult.receipt?.status === "SUCCESS");
    assert("Data has correct name", createResult.data.name === "Dappily Test Token");
    assert("Data has correct symbol", createResult.data.symbol === "DTT");
    assert("Data has correct decimals", createResult.data.decimals === 2);
    assert("Data has correct initialSupply", createResult.data.initialSupply === 10000);
    assert("Data has treasury", createResult.data.treasury === OPERATOR_ID);
    console.log(`  📊 Token ID: ${fungibleTokenId}`);
    console.log(`  📊 Explorer: ${createResult.data.explorerUrl}`);
  }

  // ── 4. MINT_TOKEN (increase supply) ─────────────────────────
  if (fungibleTokenId) {
    section("4. MINT_TOKEN (mint 5000 more)");
    const mintResult = await mintTokenAction.handler(agent, {
      tokenId: fungibleTokenId,
      amount: 5000,
    });
    if (expectOk("Mint succeeded", mintResult)) {
      assert("Has txId", typeof mintResult.txId === "string");
      assert("Receipt status is SUCCESS", mintResult.receipt?.status === "SUCCESS");
      assert("Amount minted is 5000", mintResult.data.amountMinted === 5000);
      assert("New total supply is 15000", mintResult.data.newTotalSupply === "15000");
      console.log(`  📊 New total supply: ${mintResult.data.newTotalSupply}`);
    }
  }

  // ── 5. BURN_TOKEN (reduce supply) ───────────────────────────
  if (fungibleTokenId) {
    section("5. BURN_TOKEN (burn 1000)");
    const burnResult = await burnTokenAction.handler(agent, {
      tokenId: fungibleTokenId,
      amount: 1000,
    });
    if (expectOk("Burn succeeded", burnResult)) {
      assert("Has txId", typeof burnResult.txId === "string");
      assert("Receipt status is SUCCESS", burnResult.receipt?.status === "SUCCESS");
      assert("Amount burned is 1000", burnResult.data.amountBurned === 1000);
      assert("New total supply is 14000", burnResult.data.newTotalSupply === "14000");
      console.log(`  📊 New total supply: ${burnResult.data.newTotalSupply}`);
    }
  }

  // ── 6. TRANSFER_TOKEN (to self — token already associated) ──
  if (fungibleTokenId) {
    section("6. TRANSFER_TOKEN (send 100 tokens to self)");
    const tokenXferResult = await transferTokenAction.handler(agent, {
      tokenId: fungibleTokenId,
      to: OPERATOR_ID,  // self-transfer — already associated as treasury
      amount: 100,
      memo: "Integration test token transfer",
    });
    if (expectOk("Token transfer succeeded", tokenXferResult)) {
      assert("Has txId", typeof tokenXferResult.txId === "string");
      assert("Receipt status is SUCCESS", tokenXferResult.receipt?.status === "SUCCESS");
      assert("Data has correct amount", tokenXferResult.data.amount === 100);
      console.log(`  📊 txId: ${tokenXferResult.txId}`);
    }
  }

  // ── 7. CREATE_NFT_COLLECTION ────────────────────────────────
  section("7. CREATE_NFT_COLLECTION");
  const createNftResult = await createNftCollectionAction.handler(agent, {
    name: "Dappily Genesis",
    symbol: "DGEN",
    memo: "Integration test NFT collection",
  });
  let nftTokenId: string | null = null;
  if (expectOk("NFT collection created", createNftResult)) {
    nftTokenId = createNftResult.data.tokenId;
    assert("Has tokenId", typeof nftTokenId === "string" && nftTokenId.startsWith("0.0."));
    assert("Type is NON_FUNGIBLE_UNIQUE", createNftResult.data.type === "NON_FUNGIBLE_UNIQUE");
    assert("Has treasury", createNftResult.data.treasury === OPERATOR_ID);
    assert("Max supply is unlimited", createNftResult.data.maxSupply === "unlimited");
    console.log(`  📊 Collection ID: ${nftTokenId}`);
    console.log(`  📊 Explorer: ${createNftResult.data.explorerUrl}`);
  }

  // ── 8. MINT_NFT (mint 3 NFTs) ──────────────────────────────
  if (nftTokenId) {
    section("8. MINT_NFT (3 NFTs)");
    const metadata = [
      Buffer.from("Dappily NFT #1").toString("base64"),
      Buffer.from("Dappily NFT #2").toString("base64"),
      Buffer.from("Dappily NFT #3").toString("base64"),
    ];
    const mintNftResult = await mintNftAction.handler(agent, {
      tokenId: nftTokenId,
      metadata,
    });
    if (expectOk("NFT mint succeeded", mintNftResult)) {
      assert("Has txId", typeof mintNftResult.txId === "string");
      assert("Receipt status is SUCCESS", mintNftResult.receipt?.status === "SUCCESS");
      assert("Got 3 serials back", mintNftResult.data.serials.length === 3);
      assert("Serials are [1, 2, 3]", JSON.stringify(mintNftResult.data.serials) === "[1,2,3]");
      assert("Count is 3", mintNftResult.data.count === 3);
      console.log(`  📊 Serials: ${mintNftResult.data.serials.join(", ")}`);
    }
  }

  // ── 9. BURN_NFT (burn serial #3) ───────────────────────────
  if (nftTokenId) {
    section("9. BURN_NFT (serial #3)");
    const burnNftResult = await burnNftAction.handler(agent, {
      tokenId: nftTokenId,
      serial: 3,
    });
    if (expectOk("NFT burn succeeded", burnNftResult)) {
      assert("Has txId", typeof burnNftResult.txId === "string");
      assert("Receipt status is SUCCESS", burnNftResult.receipt?.status === "SUCCESS");
      assert("Serial is 3", burnNftResult.data.serial === 3);
      console.log(`  📊 Burned serial #3`);
    }
  }

  // ── 10. Final balance check ─────────────────────────────────
  section("10. Final GET_BALANCE (verify tokens show up)");
  const finalBal = await getBalanceAction.handler(agent, {});
  if (expectOk("Final balance query succeeded", finalBal)) {
    console.log(`  📊 HBAR: ${finalBal.data.hbarBalance}`);
    console.log(`  📊 Tokens: ${finalBal.data.tokens.length}`);
    if (fungibleTokenId) {
      const dtt = finalBal.data.tokens.find((t: any) => t.tokenId === fungibleTokenId);
      if (dtt) {
        console.log(`  📊 DTT balance: ${dtt.balance}`);
        assert("DTT token appears in balance", true);
      } else {
        assert("DTT token appears in balance", false);
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────
  section("RESULTS");
  console.log(`\n  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  Total:   ${passed + failed}`);
  console.log(`\n🦞 Integration test complete.`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("💀 Unhandled error:", err);
  process.exit(1);
});
