import { Client, AccountId, PrivateKey } from "@hashgraph/sdk";

export class HederaAgentKit {
  public client: Client;
  public accountId: AccountId;
  public privateKey: PrivateKey;
  public network: "mainnet" | "testnet" | "previewnet";

  constructor(
    accountId: string,
    privateKey: string,
    network: "mainnet" | "testnet" | "previewnet"
  ) {
    this.network = network;
    this.accountId = AccountId.fromString(accountId);
    this.privateKey = PrivateKey.fromString(privateKey);

    if (network === "mainnet") {
      this.client = Client.forMainnet();
    } else if (network === "previewnet") {
      this.client = Client.forPreviewnet();
    } else {
      this.client = Client.forTestnet();
    }

    this.client.setOperator(this.accountId, this.privateKey);
  }

  /**
   * Returns the explorer URL for a transaction ID
   */
  getExplorerUrl(txId: string): string {
    const formattedTxId = txId.replace(/@/g, "-").replace(/\./g, "-");
    const baseUrl = this.network === "mainnet" 
      ? "https://hashscan.io/mainnet/transaction/"
      : "https://hashscan.io/testnet/transaction/";
    return `${baseUrl}${formattedTxId}`;
  }
}
