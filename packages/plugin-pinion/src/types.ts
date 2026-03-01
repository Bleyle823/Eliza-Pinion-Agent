// Re-export all Pinion types for internal use
// These are the exact interfaces from pinion-os-main/src/client/types.ts

export interface PinionConfig {
    privateKey: string;
    apiUrl?: string;
    network?: string;
    apiKey?: string;
}

export interface SkillResponse<T = any> {
    status: number;
    data: T;
    paidAmount: string;
    responseTimeMs: number;
}

export interface BalanceResult {
    address: string;
    network: string;
    balances: { ETH: string; USDC: string };
    timestamp: string;
}

export interface TxResult {
    hash: string;
    network: string;
    from: string;
    to: string;
    value: string;
    gasUsed: string;
    status: string;
    blockNumber: number | null;
    timestamp: string;
}

export interface PriceResult {
    token: string;
    network: string;
    priceUSD: number;
    change24h: string | null;
    timestamp: string;
}

export interface WalletResult {
    address: string;
    privateKey: string;
    network: string;
    chainId: number;
    note: string;
    timestamp: string;
}

export interface ChatResult {
    response: string;
}

export interface UnsignedTx {
    to: string;
    value: string;
    data: string;
    chainId: number;
}

export interface SendResult {
    tx: UnsignedTx;
    token: string;
    amount: string;
    network: string;
    note: string;
    timestamp: string;
}

export interface TradeResult {
    swap: UnsignedTx;
    approve?: UnsignedTx;
    srcToken: string;
    dstToken: string;
    amount: string;
    network: string;
    router: string;
    note: string;
    timestamp: string;
}

export interface FundResult {
    address: string;
    network: string;
    chainId: number;
    balances: { ETH: string; USDC: string };
    depositAddress: string;
    funding: {
        steps: string[];
        minimumRecommended: { ETH: string; USDC: string };
        bridgeUrl: string;
    };
    timestamp: string;
}

export interface BroadcastResult {
    txHash: string;
    from: string;
    to: string;
    network: string;
    chainId: number;
    explorer: string;
    note: string;
    timestamp: string;
}

export interface PayServiceResult {
    status: number;
    data: any;
    url: string;
    method: string;
    paidAmount: string;
    responseTimeMs: number;
}

export interface UnlimitedResult {
    message: string;
    apiKey: string;
    address: string;
    plan: string;
    price?: string;
    note?: string;
    timestamp?: string;
}

export interface UnlimitedVerifyResult {
    valid: boolean;
    address?: string;
    since?: string;
    plan?: string;
    error?: string;
}

export interface SpendStatus {
    maxBudget: string;
    spent: string;
    remaining: string;
    callCount: number;
    isLimited: boolean;
}
