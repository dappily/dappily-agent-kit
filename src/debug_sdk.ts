import { Client, TransferTransaction, PrivateKey, AccountId } from "@hashgraph/sdk";

async function main() {
  console.log("Debugging SDK...");
  const client = Client.forTestnet();
  client.setOperator(AccountId.fromString("0.0.12345"), PrivateKey.generateED25519());

  const tx = new TransferTransaction()
    .addHbarTransfer("0.0.12345", -1)
    .addHbarTransfer("0.0.54321", 1);

  try {
    // Test 1: Standard call
    // @ts-ignore
    await tx.execute(client);
    console.log("Standard call compiled (runtime might fail, that's expected)");
  } catch (e) {
    console.log("Standard call runtime error:", (e as Error).message);
  }

  try {
    // Test 2: With timeout
    // @ts-ignore
    await tx.execute(client, 10);
    console.log("Timeout call compiled");
  } catch (e) {
    console.log("Timeout call runtime error:", (e as Error).message);
  }
}

main();
