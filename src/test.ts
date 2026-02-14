import { HederaAgentKit } from "./agent";
import {
  actions,
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
  getActionByName,
  findActionBySimile,
} from "./actions";
import { PrivateKey } from "@hashgraph/sdk";
import { ActionResult } from "./types/action";

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

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log("🦞 Dappily Agent Kit — Full Test Suite\n");

  const dummyKey = PrivateKey.generateED25519().toString();
  const dummyId = "0.0.12345";
  const agent = new HederaAgentKit(dummyId, dummyKey, "testnet");
  console.log(`Agent initialized: ${dummyId} on testnet`);

  // ── Registry Tests ───────────────────────────────────────────
  section("Action Registry");
  assert("All 11 actions registered", actions.length === 11);
  assert("Lookup by name works", getActionByName("HBAR_TRANSFER")?.name === "HBAR_TRANSFER");
  assert("Lookup by name (missing) returns undefined", getActionByName("NOPE") === undefined);
  assert("Simile match: 'check balance'", findActionBySimile("check balance")?.name === "GET_BALANCE");
  assert("Simile match: 'send token'", findActionBySimile("send token")?.name === "TRANSFER_TOKEN");
  assert("Simile match: 'launch token'", findActionBySimile("launch token")?.name === "CREATE_TOKEN");

  // ── GET_BALANCE ──────────────────────────────────────────────
  section("GET_BALANCE — Schema");
  assert("Empty input (own account)", (() => { try { getBalanceAction.schema.parse({}); return true; } catch { return false; } })());
  assert("Specific account", (() => { try { getBalanceAction.schema.parse({ accountId: "0.0.54321" }); return true; } catch { return false; } })());
  assert("Bad format rejected", (() => { try { getBalanceAction.schema.parse({ accountId: "bad" }); return false; } catch { return true; } })());

  section("GET_BALANCE — Handler");
  const balResult = await getBalanceAction.handler(agent, {});
  assert("Returns ok (free query, hits testnet)", balResult.ok === true);
  if (balResult.ok) {
    assert("Has accountId in data", typeof balResult.data.accountId === "string");
    assert("Has hbarBalance in data", typeof balResult.data.hbarBalance === "string");
    assert("Has tokens array in data", Array.isArray(balResult.data.tokens));
    console.log(`  📊 Balance: ${balResult.data.hbarBalance}`);
  }

  // ── HBAR_TRANSFER ────────────────────────────────────────────
  section("HBAR_TRANSFER — Schema");
  assert("Valid input", (() => { try { hbarTransferAction.schema.parse({ to: "0.0.54321", amount: 10 }); return true; } catch { return false; } })());
  assert("With memo", (() => { try { hbarTransferAction.schema.parse({ to: "0.0.54321", amount: 10, memo: "test" }); return true; } catch { return false; } })());
  assert("Negative amount rejected", (() => { try { hbarTransferAction.schema.parse({ to: "0.0.54321", amount: -1 }); return false; } catch { return true; } })());
  assert("Bad account rejected", (() => { try { hbarTransferAction.schema.parse({ to: "bad", amount: 10 }); return false; } catch { return true; } })());

  section("HBAR_TRANSFER — Simulation");
  const simSmall = await hbarTransferAction.simulate!(agent, { to: "0.0.54321", amount: 10 });
  assert("Small transfer: no warnings", simSmall.warnings!.length === 0);
  const simLarge = await hbarTransferAction.simulate!(agent, { to: "0.0.54321", amount: 500 });
  assert("Large transfer: has warning", simLarge.warnings!.length > 0);

  section("HBAR_TRANSFER — Handler (expect failure: dummy key)");
  const xferResult = await hbarTransferAction.handler(agent, { to: "0.0.54321", amount: 10 });
  assert("Returns ok=false (dummy key)", xferResult.ok === false);
  if (!xferResult.ok) {
    assert("Has error code", typeof xferResult.error === "string");
    console.log(`  📊 Error: ${xferResult.error} — ${xferResult.details}`);
  }

  // ── CREATE_TOKEN ─────────────────────────────────────────────
  section("CREATE_TOKEN — Schema");
  assert("Valid input", (() => { try { createTokenAction.schema.parse({ name: "Test", symbol: "TST", initialSupply: 1000 }); return true; } catch { return false; } })());
  assert("With decimals", (() => { try { createTokenAction.schema.parse({ name: "Test", symbol: "TST", initialSupply: 1000, decimals: 8 }); return true; } catch { return false; } })());
  assert("Missing name rejected", (() => { try { createTokenAction.schema.parse({ symbol: "TST", initialSupply: 1000 }); return false; } catch { return true; } })());
  assert("Decimals > 18 rejected", (() => { try { createTokenAction.schema.parse({ name: "T", symbol: "T", initialSupply: 1, decimals: 19 }); return false; } catch { return true; } })());

  section("CREATE_TOKEN — Handler (expect failure: dummy key)");
  const createResult = await createTokenAction.handler(agent, {
    name: "Dappily Test Token",
    symbol: "DTT",
    initialSupply: 10000,
    decimals: 2,
  });
  assert("Returns ok=false (dummy key)", createResult.ok === false);
  if (!createResult.ok) {
    console.log(`  📊 Error: ${createResult.error} — ${createResult.details}`);
  }

  // ── ASSOCIATE_TOKEN ──────────────────────────────────────────
  section("ASSOCIATE_TOKEN — Schema");
  assert("Valid input (own account)", (() => { try { associateTokenAction.schema.parse({ tokenId: "0.0.99999" }); return true; } catch { return false; } })());
  assert("Valid input (third party)", (() => { try { associateTokenAction.schema.parse({ tokenId: "0.0.99999", accountId: "0.0.54321", accountPrivateKey: "somekey" }); return true; } catch { return false; } })());
  assert("Bad tokenId rejected", (() => { try { associateTokenAction.schema.parse({ tokenId: "bad" }); return false; } catch { return true; } })());

  section("ASSOCIATE_TOKEN — Handler (third party, no key → early fail)");
  const assocNoKey = await associateTokenAction.handler(agent, {
    tokenId: "0.0.99999",
    accountId: "0.0.54321",
  });
  assert("Returns ok=false", assocNoKey.ok === false);
  if (!assocNoKey.ok) {
    assert("Error is SIGNATURE_REQUIRED", assocNoKey.error === "SIGNATURE_REQUIRED");
    console.log(`  📊 ${assocNoKey.details}`);
  }

  section("ASSOCIATE_TOKEN — Handler (own account, expect network failure)");
  const assocOwn = await associateTokenAction.handler(agent, {
    tokenId: "0.0.99999",
  });
  assert("Returns ok=false (dummy key)", assocOwn.ok === false);
  if (!assocOwn.ok) {
    console.log(`  📊 Error: ${assocOwn.error} — ${assocOwn.details}`);
  }

  // ── TRANSFER_TOKEN ───────────────────────────────────────────
  section("TRANSFER_TOKEN — Schema");
  assert("Valid input", (() => { try { transferTokenAction.schema.parse({ tokenId: "0.0.99999", to: "0.0.54321", amount: 100 }); return true; } catch { return false; } })());
  assert("With memo", (() => { try { transferTokenAction.schema.parse({ tokenId: "0.0.99999", to: "0.0.54321", amount: 100, memo: "test" }); return true; } catch { return false; } })());
  assert("Zero amount rejected", (() => { try { transferTokenAction.schema.parse({ tokenId: "0.0.99999", to: "0.0.54321", amount: 0 }); return false; } catch { return true; } })());

  section("TRANSFER_TOKEN — Simulation");
  const tokenSimSmall = await transferTokenAction.simulate!(agent, { tokenId: "0.0.99999", to: "0.0.54321", amount: 100 });
  assert("Small transfer: no warnings", tokenSimSmall.warnings!.length === 0);
  const tokenSimLarge = await transferTokenAction.simulate!(agent, { tokenId: "0.0.99999", to: "0.0.54321", amount: 5_000_000 });
  assert("Large transfer: has warning", tokenSimLarge.warnings!.length > 0);

  section("TRANSFER_TOKEN — Handler (expect pre-flight or network failure)");
  const tokenXferResult = await transferTokenAction.handler(agent, {
    tokenId: "0.0.99999",
    to: "0.0.54321",
    amount: 100,
  });
  assert("Returns ok=false", tokenXferResult.ok === false);
  if (!tokenXferResult.ok) {
    console.log(`  📊 Error: ${tokenXferResult.error} — ${tokenXferResult.details}`);
  }

  // ── MINT_TOKEN ────────────────────────────────────────────────
  section("MINT_TOKEN — Schema");
  assert("Valid input", (() => { try { mintTokenAction.schema.parse({ tokenId: "0.0.99999", amount: 5000 }); return true; } catch { return false; } })());
  assert("With memo + supplyKey", (() => { try { mintTokenAction.schema.parse({ tokenId: "0.0.99999", amount: 100, memo: "minting", supplyPrivateKey: "abc" }); return true; } catch { return false; } })());
  assert("Zero amount rejected", (() => { try { mintTokenAction.schema.parse({ tokenId: "0.0.99999", amount: 0 }); return false; } catch { return true; } })());
  assert("Missing tokenId rejected", (() => { try { mintTokenAction.schema.parse({ amount: 100 }); return false; } catch { return true; } })());

  section("MINT_TOKEN — Simulation");
  const mintSim = await mintTokenAction.simulate!(agent, { tokenId: "0.0.99999", amount: 500 });
  assert("Normal mint: no large-mint warning", mintSim.warnings!.length === 0);
  const mintSimLarge = await mintTokenAction.simulate!(agent, { tokenId: "0.0.99999", amount: 2_000_000_000 });
  assert("Huge mint: has warning", mintSimLarge.warnings!.length > 0);

  section("MINT_TOKEN — Handler (expect failure: dummy key)");
  const mintResult = await mintTokenAction.handler(agent, {
    tokenId: "0.0.99999",
    amount: 5000,
  });
  assert("Returns ok=false (dummy key)", mintResult.ok === false);
  if (!mintResult.ok) {
    assert("Has error code", typeof mintResult.error === "string");
    console.log(`  📊 Error: ${mintResult.error} — ${mintResult.details}`);
  }

  // ── BURN_TOKEN ───────────────────────────────────────────────
  section("BURN_TOKEN — Schema");
  assert("Valid input", (() => { try { burnTokenAction.schema.parse({ tokenId: "0.0.99999", amount: 1000 }); return true; } catch { return false; } })());
  assert("With supplyKey", (() => { try { burnTokenAction.schema.parse({ tokenId: "0.0.99999", amount: 100, supplyPrivateKey: "abc" }); return true; } catch { return false; } })());
  assert("Negative amount rejected", (() => { try { burnTokenAction.schema.parse({ tokenId: "0.0.99999", amount: -10 }); return false; } catch { return true; } })());

  section("BURN_TOKEN — Simulation");
  const burnSim = await burnTokenAction.simulate!(agent, { tokenId: "0.0.99999", amount: 100 });
  assert("Always warns about irreversibility", burnSim.warnings!.some(w => w.includes("irreversible")));
  const burnSimLarge = await burnTokenAction.simulate!(agent, { tokenId: "0.0.99999", amount: 5_000_000 });
  assert("Large burn: extra warning", burnSimLarge.warnings!.length >= 2);

  section("BURN_TOKEN — Handler (expect failure: dummy key)");
  const burnResult = await burnTokenAction.handler(agent, {
    tokenId: "0.0.99999",
    amount: 1000,
  });
  assert("Returns ok=false (dummy key)", burnResult.ok === false);
  if (!burnResult.ok) {
    assert("Has error code", typeof burnResult.error === "string");
    console.log(`  📊 Error: ${burnResult.error} — ${burnResult.details}`);
  }

  // ── CREATE_NFT_COLLECTION ─────────────────────────────────────
  section("CREATE_NFT_COLLECTION — Schema");
  assert("Valid input", (() => { try { createNftCollectionAction.schema.parse({ name: "Test NFTs", symbol: "TNFT" }); return true; } catch { return false; } })());
  assert("With maxSupply", (() => { try { createNftCollectionAction.schema.parse({ name: "Test", symbol: "T", maxSupply: 100 }); return true; } catch { return false; } })());
  assert("Missing name rejected", (() => { try { createNftCollectionAction.schema.parse({ symbol: "T" }); return false; } catch { return true; } })());

  section("CREATE_NFT_COLLECTION — Handler (expect failure: dummy key)");
  const createNftResult = await createNftCollectionAction.handler(agent, {
    name: "Dappily Genesis",
    symbol: "DGEN",
    memo: "Test collection",
  });
  assert("Returns ok=false (dummy key)", createNftResult.ok === false);
  if (!createNftResult.ok) {
    console.log(`  📊 Error: ${createNftResult.error} — ${createNftResult.details}`);
  }

  // ── MINT_NFT ─────────────────────────────────────────────────
  section("MINT_NFT — Schema");
  assert("Valid input (1 NFT)", (() => { try { mintNftAction.schema.parse({ tokenId: "0.0.88888", metadata: ["SGVsbG8="] }); return true; } catch { return false; } })());
  assert("Valid input (multiple)", (() => { try { mintNftAction.schema.parse({ tokenId: "0.0.88888", metadata: ["SGVsbG8=", "V29ybGQ="] }); return true; } catch { return false; } })());
  assert("Empty metadata array rejected", (() => { try { mintNftAction.schema.parse({ tokenId: "0.0.88888", metadata: [] }); return false; } catch { return true; } })());
  assert("Missing tokenId rejected", (() => { try { mintNftAction.schema.parse({ metadata: ["SGVsbG8="] }); return false; } catch { return true; } })());

  section("MINT_NFT — Pre-flight: metadata too large");
  // Create a base64 string that decodes to >100 bytes
  const bigMetadata = Buffer.from("x".repeat(150)).toString("base64");
  const mintTooLargeResult = await mintNftAction.handler(agent, {
    tokenId: "0.0.88888",
    metadata: [bigMetadata],
  });
  assert("Returns ok=false", mintTooLargeResult.ok === false);
  if (!mintTooLargeResult.ok) {
    assert("Error is METADATA_TOO_LARGE", mintTooLargeResult.error === "METADATA_TOO_LARGE");
    console.log(`  📊 ${mintTooLargeResult.details}`);
  }

  section("MINT_NFT — Handler (expect failure: dummy key)");
  const mintNftResult = await mintNftAction.handler(agent, {
    tokenId: "0.0.88888",
    metadata: ["SGVsbG8gV29ybGQ="],
  });
  assert("Returns ok=false (dummy key)", mintNftResult.ok === false);
  if (!mintNftResult.ok) {
    console.log(`  📊 Error: ${mintNftResult.error} — ${mintNftResult.details}`);
  }

  // ── TRANSFER_NFT ─────────────────────────────────────────────
  section("TRANSFER_NFT — Schema");
  assert("Valid input", (() => { try { transferNftAction.schema.parse({ tokenId: "0.0.88888", serial: 1, to: "0.0.54321" }); return true; } catch { return false; } })());
  assert("Serial 0 rejected", (() => { try { transferNftAction.schema.parse({ tokenId: "0.0.88888", serial: 0, to: "0.0.54321" }); return false; } catch { return true; } })());
  assert("Bad recipient rejected", (() => { try { transferNftAction.schema.parse({ tokenId: "0.0.88888", serial: 1, to: "bad" }); return false; } catch { return true; } })());

  section("TRANSFER_NFT — Handler (expect pre-flight or network failure)");
  const transferNftResult = await transferNftAction.handler(agent, {
    tokenId: "0.0.88888",
    serial: 1,
    to: "0.0.54321",
  });
  assert("Returns ok=false", transferNftResult.ok === false);
  if (!transferNftResult.ok) {
    console.log(`  📊 Error: ${transferNftResult.error} — ${transferNftResult.details}`);
  }

  // ── BURN_NFT ─────────────────────────────────────────────────
  section("BURN_NFT — Schema");
  assert("Valid input", (() => { try { burnNftAction.schema.parse({ tokenId: "0.0.88888", serial: 3 }); return true; } catch { return false; } })());
  assert("Serial 0 rejected", (() => { try { burnNftAction.schema.parse({ tokenId: "0.0.88888", serial: 0 }); return false; } catch { return true; } })());
  assert("Missing tokenId rejected", (() => { try { burnNftAction.schema.parse({ serial: 1 }); return false; } catch { return true; } })());

  section("BURN_NFT — Simulation");
  const burnNftSim = await burnNftAction.simulate!(agent, { tokenId: "0.0.88888", serial: 3 });
  assert("Always warns about irreversibility", burnNftSim.warnings!.some(w => w.includes("irreversible")));

  section("BURN_NFT — Handler (expect failure: dummy key)");
  const burnNftResult = await burnNftAction.handler(agent, {
    tokenId: "0.0.88888",
    serial: 3,
  });
  assert("Returns ok=false (dummy key)", burnNftResult.ok === false);
  if (!burnNftResult.ok) {
    console.log(`  📊 Error: ${burnNftResult.error} — ${burnNftResult.details}`);
  }

  // ── Output Shape Verification ────────────────────────────────
  section("Output Shape Consistency");
  const allResults: ActionResult[] = [
    balResult, xferResult, createResult, assocNoKey, assocOwn, tokenXferResult,
    mintResult, burnResult, createNftResult, mintTooLargeResult, mintNftResult,
    transferNftResult, burnNftResult,
  ];
  for (const r of allResults) {
    if (r.ok) {
      assert(`Success shape has summary`, typeof r.summary === "string");
      assert(`Success shape has data`, typeof r.data === "object");
    } else {
      assert(`Failure shape has error`, typeof r.error === "string");
    }
  }

  // ── Summary ──────────────────────────────────────────────────
  section("RESULTS");
  console.log(`\n  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  Total:   ${passed + failed}`);
  console.log(`\n🦞 Test suite complete.`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("💀 Unhandled error:", err);
  process.exit(1);
});
