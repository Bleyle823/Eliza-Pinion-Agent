import { type IAgentRuntime, type Memory, type Provider, type ProviderResult, type State } from '@elizaos/core';
import { PinionService } from '../services/PinionService';

/**
 * PINION_PROVIDER — supplies live Pinion wallet/network status to the agent context on every turn.
 * This gives the LLM awareness of whether payments are configured and what the current spend is.
 */
export const pinionProvider: Provider = {
    name: 'PINION_PROVIDER',
    description: 'Provides Pinion OS wallet, network, and session spend status as agent context.',

    get: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state: State | undefined,
    ): Promise<ProviderResult> => {
        const service = runtime.getService<PinionService>(PinionService.serviceType);

        if (!service) {
            return {
                text: '[Pinion] Service not loaded.',
                values: {},
                data: {},
            };
        }

        const wallet = service.walletAddress;
        const configured = service.isConfigured;
        const apiKeyMode = service.hasApiKey;
        const network = service.network;
        const spend = service.spendTracker.getStatus();

        const lines = [
            '## Pinion OS Status',
            `  Wallet:  ${configured ? wallet : 'not configured — use PINION_SETUP'}`,
            `  Network: ${network}`,
            `  Mode:    ${apiKeyMode ? 'unlimited (API key — x402 bypassed)' : 'pay-per-call (x402, $0.01/skill)'}`,
            configured && spend.isLimited
                ? `  Budget:  $${spend.spent} spent of $${spend.maxBudget} (${spend.callCount} calls)`
                : configured
                    ? `  Session: $${spend.spent} spent (${spend.callCount} calls, no budget cap)`
                    : '',
            '### Instructions for Pinion Actions:',
            '- If the user asks for balance (even without an address), use PINION_BALANCE.',
            '- For swaps or trades, use PINION_TRADE.',
            '- For ETH/USDC transfers, use PINION_SEND.',
            '- To look up hash or tx, use PINION_TX.',
            '- To generate new keys via API, use PINION_WALLET.',
            '- To ask technical questions about x402, use PINION_CHAT.',
        ].filter(Boolean).join('\n');

        return {
            text: lines,
            values: {
                pinionWallet: wallet || '',
                pinionConfigured: String(configured),
                pinionNetwork: network,
                pinionApiKeyMode: String(apiKeyMode),
                pinionSpent: spend.spent,
            },
            data: { wallet, configured, apiKeyMode, network, spend },
        };
    },
};
