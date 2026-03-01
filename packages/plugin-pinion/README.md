# @elizaos/plugin-pinion

ElizaOS plugin for [Pinion OS](https://pinionos.com) — x402 micropayment blockchain AI skills on Base.

Each skill costs **$0.01 USDC** on Base, handled automatically via the [x402 protocol](https://x402.org). Once you have an unlimited API key ($100 USDC one-time), all calls are free.

## Architecture

```
ElizaOS Agent
    ↓
plugin-pinion (this package)
    ↓  (ethers v6, x402 EIP-3009 signing)
pinionos.com/skill  (x402 skill server)
    ↓
Base L2 / USDC settlement
```

## Install

```bash
# From the eliza-main root
bun install
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PINION_PRIVATE_KEY` | yes* | — | `0x...` hex private key with ETH + USDC on Base |
| `PINION_API_KEY` | no | — | `pk_...` unlimited API key (bypasses per-call payments) |
| `PINION_API_URL` | no | `https://pinionos.com/skill` | Custom skill server URL |
| `PINION_NETWORK` | no | `base` | `base` or `base-sepolia` |

\*Or configure at runtime via the `PINION_SETUP` action.

## Add to your agent config

```typescript
import { pinionPlugin } from '@elizaos/plugin-pinion';

export default {
  plugins: [pinionPlugin],
  // ...
};
```

Or in your `.env`:

```
PINION_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

## Available Actions

| Action | Trigger example | Cost |
|---|---|---|
| `PINION_SETUP` | "setup pinion with key 0x..." or "generate a new pinion wallet" | Free |
| `PINION_BALANCE` | "check balance 0x1234..." | $0.01 |
| `PINION_PRICE` | "what is the ETH price?" | $0.01 |
| `PINION_TX` | "decode tx 0xabc..." | $0.01 |
| `PINION_WALLET` | "generate a new wallet via pinion" | $0.01 |
| `PINION_CHAT` | "ask pinion: what is x402?" | $0.01 |
| `PINION_SEND` | "send 0.1 ETH to 0xRecipient..." | $0.01 |
| `PINION_TRADE` | "swap 10 USDC for ETH" | $0.01 |
| `PINION_FUND` | "how do I fund my wallet?" | $0.01 |
| `PINION_BROADCAST` | "broadcast {\"to\":\"0x...\", ...}" | $0.01 |
| `PINION_UNLIMITED` | "buy pinion unlimited plan" | $100.00 |
| `PINION_UNLIMITED_VERIFY` | "verify api key pk_abc..." | Free |
| `PINION_PAY_SERVICE` | "pay service https://example.com GET" | variable |

## Provider

`PINION_PROVIDER` is injected into every agent turn, giving the LLM context about:
- Wallet address and configuration status
- Network (base / base-sepolia)
- Pay mode (per-call x402 vs. unlimited API key)
- Session spend and call count

## Spend Limits

The plugin tracks cumulative USDC spend per session via `SpendTracker`. Budget enforcement is coming in a future action (`PINION_SPEND_LIMIT`). For now the tracker is available on the `PinionService` instance:

```typescript
const service = runtime.getService<PinionService>('pinion');
service.spendTracker.setLimit('1.00'); // limit to $1.00
```

## Building Your Own Skills

The `pinion-os-main` package also ships a skill server framework. See `c:\Users\Omen\Desktop\pinion-os-main\examples\custom-skill.ts` for an example.

```typescript
import { createSkillServer, skill } from 'pinion-os-main/server';

const server = createSkillServer({ payTo: '0xYOUR_WALLET', network: 'base' });

server.add(skill('analyze', {
  price: '$0.02',
  endpoint: '/analyze/:address',
  handler: async (req, res) => res.json({ score: 42 }),
}));

server.listen(4020);
```

## License

MIT
