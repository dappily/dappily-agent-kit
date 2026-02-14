# 🦞 Dappily Agent Kit

**AI agent toolkit for Hedera — 15 actions + self-forging action generator.**

Give any AI agent the ability to interact with the Hedera network. Define actions as JSON specs, generate working TypeScript automatically.

## What's New in 0.3.0: The Forge

The kit now includes a **deterministic action generator**. Write a JSON spec → get a working, type-safe Hedera action with zero manual code.

```typescript
import { validateSpec, generateAction } from "dappily-agent-kit";
import * as fs from "fs";

// Load a spec
const spec = JSON.parse(fs.readFileSync("my_action.spec.json", "utf-8"));

// Validate against the schema
const result = validateSpec(spec);
if (!result.ok) throw new Error(result.errors.join("\n"));

// Generate TypeScript code
const code = generateAction(result.spec);
fs.writeFileSync("src/actions/my_action.ts", code);
// → Compiles. Runs on testnet. Zero edits needed.
```

**Proven on testnet:** The generator produces actions that compile with `tsc --strict` and execute real transactions on Hedera testnet — token creation, HBAR transfers, consensus queries — all without a single manual fix.

## Testnet-Verified Actions

| # | Action | Domain | Testnet Proof |
|---|--------|--------|---------------|
| 1 | `GET_BALANCE` | Core | ✅ Live query |
| 2 | `HBAR_TRANSFER` | Core | ✅ Receipt: SUCCESS |
| 3 | `CREATE_TOKEN` | HTS Fungible | ✅ Token created |
| 4 | `ASSOCIATE_TOKEN` | HTS Fungible | ✅ |
| 5 | `TRANSFER_TOKEN` | HTS Fungible | ✅ |
| 6 | `MINT_TOKEN` | HTS Fungible | ✅ Supply verified |
| 7 | `BURN_TOKEN` | HTS Fungible | ✅ Supply verified |
| 8 | `CREATE_NFT_COLLECTION` | HTS NFT | ✅ Collection created |
| 9 | `MINT_NFT` | HTS NFT | ✅ Serials [1,2,3] |
| 10 | `TRANSFER_NFT` | HTS NFT | ✅ |
| 11 | `BURN_NFT` | HTS NFT | ✅ Serial destroyed |
| 12 | `CREATE_TOPIC` | HCS | ✅ Topic created |
| 13 | `SUBMIT_MESSAGE` | HCS | ✅ 3 messages, seq verified |
| 14 | `GET_TOPIC_INFO` | HCS | ✅ Memo + seq + keys |
| 15 | `DELETE_TOPIC` | HCS | ✅ Deleted + verified |

## Quickstart

```bash
npm install dappily-agent-kit @hashgraph/sdk
```

```typescript
import { HederaAgentKit, getBalanceAction, createTokenAction } from "dappily-agent-kit";

const agent = new HederaAgentKit("0.0.YOUR_ACCOUNT", "YOUR_KEY", "testnet");

// Check balance
const bal = await getBalanceAction.handler(agent, {});
if (bal.ok) console.log(bal.data.hbarBalance);

// Create a token
const token = await createTokenAction.handler(agent, {
  name: "My Token", symbol: "MTK", initialSupply: 1000000, decimals: 2,
});
if (token.ok) console.log(token.data.tokenId);
```

## Standardized Output

Every action returns:

```typescript
// Success
{ ok: true, summary: "...", txId: "...", receipt: { status: "SUCCESS" }, data: { ... } }

// Failure
{ ok: false, error: "INSUFFICIENT_PAYER_BALANCE", details: "..." }
```

## The Forge: Self-Forging Actions

The Forge is a deterministic code generator that turns JSON specs into working Hedera actions.

### How It Works

1. **Spec** — A JSON file describing the action: inputs, SDK methods, transforms, error maps
2. **Validate** — Zod schema ensures the spec is machine-correct
3. **Generate** — Deterministic template fill produces TypeScript code
4. **Compile** — `tsc --strict` verifies type safety
5. **Test** — Run against Hedera testnet to verify real execution

### Spec Format (v4)

```json
{
  "specVersion": 4,
  "name": "MY_ACTION",
  "category": "fungible",
  "risk": "write",
  "costTier": "medium",
  "hedera": {
    "sdkClass": "TokenCreateTransaction",
    "sdkImports": ["TokenCreateTransaction", "Status"],
    "networkCallType": "transaction"
  },
  "sdkMethods": [
    { "method": "setTokenName", "args": [{ "from": "input.name" }] }
  ],
  "inputs": [
    { "name": "name", "type": "string", "required": true, "describe": "Token name" }
  ],
  "successData": [...],
  "errorMap": [...]
}
```

### CLI

```bash
# Validate all specs
npm run forge:validate

# Generate an action from a spec
npm run forge:generate -- specs/create_token.spec.json output.ts
```

### 15 Reference Specs

The kit includes specs for all 15 built-in actions in `src/forge/specs/`. These serve as the pattern library — examples of every structural pattern:

- **Queries** (free, no signing): `get_balance`, `get_topic_info`
- **Simple transactions**: `create_token`, `create_topic`, `delete_topic`, `mint_token`, `burn_token`, `associate_token`, `mint_nft`, `burn_nft`, `submit_message`, `create_nft_collection`
- **Multi-arg transfers**: `hbar_transfer`, `transfer_token`, `transfer_nft`

## Action Discovery

```typescript
import { actions, getActionByName, findActionBySimile } from "dappily-agent-kit";

actions.forEach(a => console.log(a.name));
getActionByName("HBAR_TRANSFER");
findActionBySimile("send some hbar"); // → hbarTransferAction
```

## Examples

See [`examples/`](./examples):

- `balance.ts` — Check account balance
- `fungible-lifecycle.ts` — Create → Mint → Transfer → Burn
- `nft-lifecycle.ts` — Create collection → Mint → Burn
- `hcs-lifecycle.ts` — Create topic → Submit messages → Query → Delete

## Security

⚠️ Private keys in action inputs are supported for **development/testing only**. For production, use environment variables or wallet signing.

## Architecture

```
dappily-agent-kit/
├── src/
│   ├── index.ts              # Public API
│   ├── agent/                # HederaAgentKit
│   ├── actions/              # 15 built-in actions
│   ├── types/                # ActionResult types
│   └── forge/                # Self-Forging system
│       ├── actionSpec.ts     # Spec schema (Zod, v4)
│       ├── generator.ts      # Deterministic code generator
│       └── specs/            # 15 reference specs
├── examples/
├── dist/
└── package.json
```

## Roadmap

- [x] 15 actions across HTS, NFT, HCS — all testnet-verified
- [x] Deterministic action generator (Forge)
- [x] 15 reference specs (v4 format)
- [ ] Sandbox runner (automated generate → compile → testnet)
- [ ] Prompt → Spec (LLM generates specs, generator does the rest)
- [ ] Mirror Node queries
- [ ] Framework adapters (Vercel AI, LangChain, MCP)
- [ ] Wallet signing interface

## License

MIT — see [LICENSE](./LICENSE).

---

Built by [Dappily](https://dappily.io) 🦞
