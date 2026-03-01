import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService } from '../services/PinionService.ts';

const SUPPORTED_TOKENS = ['ETH', 'USDC', 'WETH', 'DAI', 'USDT', 'CBETH'];

/**
 * PINION_PRICE — get the current USD price for a token on Base.
 * Costs $0.01 USDC via x402.
 */
export const priceAction: Action = {
    name: 'PINION_PRICE',
    similes: ['TOKEN_PRICE', 'ETH_PRICE', 'CRYPTO_PRICE', 'GET_PRICE', 'COIN_PRICE'],
    description:
        'Get current USD price for a token on Base (ETH, USDC, WETH, DAI, USDT, CBETH). Costs $0.01 USDC via x402.',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        const hasKeyword =
            text.includes('price') ||
            text.includes('how much') ||
            text.includes('cost') ||
            text.includes('usd') ||
            text.includes('worth') ||
            text.includes('value') ||
            text.includes('market');
        const hasToken = SUPPORTED_TOKENS.some((t) => text.includes(t.toLowerCase()));
        const service = runtime.getService<PinionService>(PinionService.serviceType);
        return !!service && (hasKeyword || hasToken);
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State | undefined,
        _options: any,
        callback?: HandlerCallback,
    ): Promise<ActionResult> => {
        try {
            const service = runtime.getService<PinionService>(PinionService.serviceType);
            if (!service?.isConfigured) {
                const msg = '⚠️ Pinion wallet not configured. Use PINION_SETUP or set PINION_PRIVATE_KEY.';
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('wallet not configured') };
            }

            const text = (message.content.text || '').toUpperCase();
            const token = SUPPORTED_TOKENS.find((t) => text.includes(t)) || 'ETH';

            const COST = '10000';
            if (!service.spendTracker.canSpend(COST)) {
                const st = service.spendTracker.getStatus();
                const msg = `💸 Spend limit reached: $${st.spent} of $${st.maxBudget}.`;
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('spend limit reached') };
            }

            logger.info(`[PINION_PRICE] fetching price for ${token}`);
            const result = await service.client!.price(token);
            if (result.paidAmount !== '0') service.spendTracker.recordSpend(result.paidAmount);

            const d = result.data;
            const change = d.change24h != null ? ` (${d.change24h} 24h)` : '';
            const response = `📈 ${d.token} price: $${d.priceUSD.toFixed(2)} USD${change}\n  Network: ${d.network} | As of: ${d.timestamp}`;

            if (callback) await callback({ text: response, actions: ['PINION_PRICE'], source: message.content.source });
            return { text: response, success: true, data: d };
        } catch (error) {
            logger.error({ error }, '[PINION_PRICE] error');
            const msg = `❌ Price check failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'what is the ETH price?', actions: [] } },
            { name: '{{agentName}}', content: { text: '📈 ETH price: $2650.00 USD', actions: ['PINION_PRICE'] } },
        ],
        [
            { name: '{{userName}}', content: { text: 'how much is USDC?', actions: [] } },
            { name: '{{agentName}}', content: { text: '📈 USDC price: $1.00 USD', actions: ['PINION_PRICE'] } },
        ],
    ],
};
