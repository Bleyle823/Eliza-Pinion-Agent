import { Service, type IAgentRuntime, logger } from '@elizaos/core';
import { ethers } from 'ethers';

// Constants from pinion-os-main/src/shared/constants.ts
const PINION_API_URL = 'https://pinionos.com/skill';
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_NAME = "USD Coin";
const USDC_VERSION = "2";
const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

function getChainId(network: string): number {
    if (network === "base-sepolia" || network === "eip155:84532") return BASE_SEPOLIA_CHAIN_ID;
    if (network === "base" || network === "eip155:8453") return BASE_CHAIN_ID;
    return BASE_CHAIN_ID;
}

function generateNonce(): string {
    const bytes = ethers.randomBytes(32);
    return ethers.hexlify(bytes);
}

/**
 * Sign an x402 payment using ethers Wallet.
 * Inlined from pinion-os-main to ensure plugin self-containment.
 */
export async function signX402Payment(
    wallet: ethers.Wallet,
    requirements: any,
    x402Version: number,
): Promise<string> {
    const nonce = generateNonce();
    const nowSec = Math.floor(Date.now() / 1000);
    const validAfter = (nowSec - 600).toString();
    const validBefore = (nowSec + (requirements.maxTimeoutSeconds || 900)).toString();
    const chainId = getChainId(requirements.network);

    const domain: ethers.TypedDataDomain = {
        name: requirements.extra?.name || USDC_NAME,
        version: requirements.extra?.version || USDC_VERSION,
        chainId,
        verifyingContract: requirements.asset || USDC_ADDRESS,
    };

    const types = {
        TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
        ],
    };

    const value = {
        from: wallet.address,
        to: requirements.payTo,
        value: requirements.maxAmountRequired,
        validAfter,
        validBefore,
        nonce,
    };

    const signature = await wallet.signTypedData(domain, types, value);

    const payload = {
        x402Version,
        scheme: requirements.scheme,
        network: requirements.network,
        payload: {
            signature,
            authorization: {
                from: wallet.address,
                to: requirements.payTo,
                value: requirements.maxAmountRequired,
                validAfter,
                validBefore,
                nonce,
            },
        },
    };

    return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function parsePaymentRequirements(body: any): { requirements: any; x402Version: number } {
    if (body.accepts && body.accepts.length > 0) {
        return {
            requirements: body.accepts[0],
            x402Version: body.x402Version || 1,
        };
    }
    throw new Error("could not parse payment requirements from 402 response");
}

// SpendTracker — replicates pinion-os-main/src/plugin/limits.ts
export class SpendTracker {
    private maxAtomic: bigint = BigInt(0);
    private spentAtomic: bigint = BigInt(0);
    private calls: number = 0;
    private limited: boolean = false;

    setLimit(maxUsdc: string): void {
        const parsed = parseFloat(maxUsdc);
        if (isNaN(parsed) || parsed < 0) throw new Error('spend limit must be non-negative');
        this.maxAtomic = BigInt(Math.floor(parsed * 1e6));
        this.limited = true;
    }

    clearLimit(): void {
        this.maxAtomic = BigInt(0);
        this.limited = false;
    }

    canSpend(amountAtomic: string): boolean {
        if (!this.limited) return true;
        return (this.spentAtomic + BigInt(amountAtomic)) <= this.maxAtomic;
    }

    recordSpend(amountAtomic: string): void {
        this.spentAtomic += BigInt(amountAtomic);
        this.calls++;
    }

    getStatus() {
        const remaining = this.limited ? this.maxAtomic - this.spentAtomic : BigInt(0);
        return {
            maxBudget: this.limited ? (Number(this.maxAtomic) / 1e6).toFixed(2) : 'unlimited',
            spent: (Number(this.spentAtomic) / 1e6).toFixed(2),
            remaining: this.limited
                ? (Number(remaining > BigInt(0) ? remaining : BigInt(0)) / 1e6).toFixed(2)
                : 'unlimited',
            callCount: this.calls,
            isLimited: this.limited,
        };
    }

    reset(): void {
        this.spentAtomic = BigInt(0);
        this.calls = 0;
    }
}

// PinionClient — thin wrapper using ethers v6 + fetch, matching pinion-os-main API
export class PinionClientWrapper {
    wallet: ethers.Wallet;
    apiUrl: string;
    network: string;
    private _apiKey: string | undefined;

    constructor(config: { privateKey: string; apiUrl?: string; network?: string; apiKey?: string }) {
        this.wallet = new ethers.Wallet(config.privateKey);
        this.apiUrl = (config.apiUrl || PINION_API_URL).replace(/\/$/, '');
        this.network = config.network || 'base';
        this._apiKey = config.apiKey;
    }

    get address(): string {
        return this.wallet.address;
    }

    get signer(): ethers.Wallet {
        return this.wallet;
    }

    setApiKey(key: string): void {
        this._apiKey = key;
    }

    get hasApiKey(): boolean {
        return !!this._apiKey;
    }

    async request<T = any>(method: string, path: string, body?: any): Promise<{ status: number; data: T; paidAmount: string; responseTimeMs: number }> {
        const url = `${this.apiUrl}${path}`;
        const start = Date.now();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };

        if (this._apiKey) {
            headers['X-API-KEY'] = this._apiKey;
        }

        const opts: RequestInit = { method, headers };
        if (body && method === 'POST') {
            opts.body = JSON.stringify(body);
        }

        // With API key: direct request, no x402 flow
        if (this._apiKey) {
            const res = await fetch(url, opts);
            const data = await res.json().catch(() => ({ error: 'non-json response' }));
            return { status: res.status, data, paidAmount: '0', responseTimeMs: Date.now() - start };
        }

        // First request — expect 402
        const initial = await fetch(url, opts);

        if (initial.status !== 402) {
            const data = await initial.json().catch(() => ({ error: 'non-json response' }));
            return { status: initial.status, data, paidAmount: '0', responseTimeMs: Date.now() - start };
        }

        const reqBody = await initial.json();
        const { requirements, x402Version } = parsePaymentRequirements(reqBody);

        const paymentHeader = await signX402Payment(this.wallet, requirements, x402Version);

        const paidHeaders: Record<string, string> = { ...headers, 'X-PAYMENT': paymentHeader };
        const paidOpts: RequestInit = { method, headers: paidHeaders };
        if (body && method === 'POST') paidOpts.body = JSON.stringify(body);

        const paid = await fetch(url, paidOpts);
        const data = await paid.json().catch(() => ({ error: 'non-json response' }));

        return {
            status: paid.status,
            data,
            paidAmount: requirements.maxAmountRequired,
            responseTimeMs: Date.now() - start,
        };
    }

    // Skill method helpers
    async balance(address: string) {
        return this.request('GET', `/balance/${address}`);
    }
    async tx(hash: string) {
        return this.request('GET', `/tx/${hash}`);
    }
    async price(token: string) {
        return this.request('GET', `/price/${token.toUpperCase()}`);
    }
    async wallet() {
        return this.request('GET', '/wallet/generate');
    }
    async chat(message: string, history: Array<{ role: string; content: string }> = []) {
        const messages = [...history, { role: 'user', content: message }];
        return this.request('POST', '/chat', { messages });
    }
    async send(to: string, amount: string, token: 'ETH' | 'USDC') {
        return this.request('POST', '/send', { to, amount, token });
    }
    async trade(src: string, dst: string, amount: string, slippage = 1) {
        return this.request('POST', '/trade', { src, dst, amount, from: this.address, slippage });
    }
    async fund(address?: string) {
        const addr = address || this.address;
        return this.request('GET', `/fund/${addr}`);
    }
    async broadcast(tx: { to: string; data?: string; value?: string; gasLimit?: string }) {
        return this.request('POST', '/broadcast', { tx, privateKey: this.wallet.privateKey });
    }
    async unlimited() {
        return this.request('POST', '/unlimited');
    }
    async unlimitedVerify(key: string) {
        const url = `${this.apiUrl}/unlimited/verify?key=${encodeURIComponent(key)}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        return res.json();
    }
}

/**
 * PinionService — ElizaOS Service that wraps PinionClientWrapper and SpendTracker.
 * Reads PINION_PRIVATE_KEY from runtime settings on start.
 */
export class PinionService extends Service {
    static serviceType = 'pinion';
    capabilityDescription =
        'Provides access to Pinion OS x402 blockchain AI skills (balance, price, tx, wallet, chat, send, trade, fund, broadcast, unlimited).';

    private _client: PinionClientWrapper | null = null;
    readonly spendTracker = new SpendTracker();

    constructor(protected runtime: IAgentRuntime) {
        super(runtime);
    }

    static async start(runtime: IAgentRuntime): Promise<PinionService> {
        logger.info('[PinionService] starting');
        const service = new PinionService(runtime);

        const privateKey =
            runtime.getSetting('PINION_PRIVATE_KEY') || process.env.PINION_PRIVATE_KEY;
        const apiKey = runtime.getSetting('PINION_API_KEY') || process.env.PINION_API_KEY;
        const apiUrl =
            runtime.getSetting('PINION_API_URL') ||
            process.env.PINION_API_URL;
        const network =
            runtime.getSetting('PINION_NETWORK') || process.env.PINION_NETWORK || 'base';

        if (privateKey) {
            try {
                service._client = new PinionClientWrapper({ privateKey, apiUrl, network, apiKey });
                if (apiKey) service._client.setApiKey(apiKey);
                logger.info(`[PinionService] wallet configured: ${service._client.address}`);
            } catch (err) {
                logger.warn('[PinionService] invalid PINION_PRIVATE_KEY — wallet not configured');
            }
        } else {
            logger.warn(
                '[PinionService] PINION_PRIVATE_KEY not set — use PINION_SETUP action to configure',
            );
        }

        return service;
    }

    static async stop(runtime: IAgentRuntime): Promise<void> {
        logger.info('[PinionService] stopping');
        const service = runtime.getService<PinionService>(PinionService.serviceType);
        if (!service) throw new Error('PinionService not found');
        await service.stop();
    }

    async stop(): Promise<void> {
        logger.info('[PinionService] stopped');
    }

    get client(): PinionClientWrapper | null {
        return this._client;
    }

    /** Set the client (used by PINION_SETUP action). */
    setClient(client: PinionClientWrapper): void {
        this._client = client;
    }

    get isConfigured(): boolean {
        return this._client !== null;
    }

    get walletAddress(): string | null {
        return this._client?.address ?? null;
    }

    get network(): string {
        return this._client?.network ?? 'base';
    }

    get hasApiKey(): boolean {
        return this._client?.hasApiKey ?? false;
    }
}
