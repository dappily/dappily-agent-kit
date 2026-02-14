# 🦞 Dappily Agent Kit

**Type what you want. Dappily safely compiles it into a verified Hedera action.**

15 testnet-verified actions + an AI-powered action synthesis pipeline. Describe a Hedera action in plain English → the system generates a validated spec → produces type-safe TypeScript → compiles it → verifies it on testnet → promotes it to your codebase. The AI never writes code. It fills a constrained form. Everything else is deterministic.

## What's New in 0.5.0: The Architect

The Forge now includes an **AI spec architect**. Describe what you want in English → get a testnet-verified Hedera action.

```bash
# Describe what you want
npx ts-node src/forge/architect/specCommand.ts "create a token called DEMO with 1M supply"

# → LLM picks actionKind: create_token
# → Zod validates the plan
# → Deterministic spec v4 generated
# → Ready for sandbox + promote
```

The LLM never sees the Hedera SDK. It picks from 15 known action lanes and identifies inputs. Everything structural comes from testnet-proven reference specs.

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

## The Forge: AI-Constrained Action Synthesis

The Forge is a pipeline that turns plain English into verified Hedera actions.

### How It Works

1. **Describe** — Tell the architect what you want in English
2. **Plan** — LLM produces an ActionPlan (Zod-validated, safe-set gated)
3. **Spec** — Deterministic conversion to ActionSpec v4 from reference templates
4. **Generate** — Template fill produces TypeScript code (no AI here)
5. **Compile** — `tsc --strict` verifies type safety
6. **Test** — Sandbox runs against Hedera testnet
7. **Promote** — Passes → copied to `src/actions/` with registry update

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
# AI Architect — describe what you want
npm run forge:spec -- "send HBAR to another wallet"
npm run forge:spec -- "create a token called DEMO"
npm run forge:spec -- "burn an NFT" --i-understand    # destructive actions require flag

# Validate all specs
npm run forge:validate

# Generate an action from a spec
npm run forge:generate -- specs/create_token.spec.json output.ts

# Sandbox — compile check (default) or full testnet
npm run forge:sandbox -- path/to/spec.json             # dry-run
npm run forge:sandbox -- path/to/spec.json --live       # testnet

# Promote — sandbox (live) → copy to actions → update registry
npm run forge:promote -- path/to/spec.json
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
│   └── forge/                # Action Synthesis Pipeline
│       ├── actionSpec.ts     # Spec schema (Zod, v4)
│       ├── generator.ts      # Deterministic code generator
│       ├── sandbox.ts        # Compile + testnet verification
│       ├── promote.ts        # Promotion gate (testnet receipt required)
│       ├── architect/        # AI spec architect
│       │   ├── specCommand.ts   # CLI entry point
│       │   ├── actionPlan.ts    # ActionPlan schema + safe set
│       │   ├── planToSpec.ts    # Deterministic plan → spec converter
│       │   └── prompt.ts        # System prompt + few-shot examples
│       └── specs/            # 15 reference specs
├── examples/
├── dist/
└── package.json
```

## Roadmap

- [x] 15 actions across HTS, NFT, HCS — all testnet-verified
- [x] Deterministic action generator (Forge)
- [x] 15 reference specs (v4 format)
- [x] Sandbox runner (automated generate → compile → testnet)
- [x] AI Spec Architect (English → ActionPlan → Spec → Code)
- [x] Promotion gate (testnet receipt required)
- [ ] Mirror Node queries
- [ ] Framework adapters (Vercel AI, LangChain, MCP)
- [ ] Wallet signing interface

## License

MIT — see [LICENSE](./LICENSE).

---

Built by [Dappily](https://dappily.io) 🦞
