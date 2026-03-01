import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService } from '../services/PinionService.ts';

/**
 * PINION_TRADE — get unsigned swap tx via 1inch on Base.
 * Costs $0.01 USDC via x402.
 */
export const tradeAction: Action = {
    name: 'PINION_TRADE',
    similes: ['SWAP_TOKENS', 'ONEINCH_SWAP', 'DEX_SWAP', 'EXCHANGE_TOKENS'],
    description:
        'Get an unsigned swap transaction via 1inch aggregator on Base. Returns swap + optional approve tx — use PINION_BROADCAST to execute. Costs $0.01 USDC via x402.',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        const hasKeyword =
            text.includes('swap') || text.includes('trade') || text.includes('exchange') || text.includes('convert') || text.includes('buy') || text.includes('sell');
        const service = runtime.getService<PinionService>(PinionService.serviceType);
        return !!service && hasKeyword;
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
                const msg = '⚠️ Pinion wallet not configured. Use PINION_SETUP first.';
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('wallet not configured') };
            }

            const text = message.content.text || '';

            // Parse patterns like "swap 10 USDC for ETH", "trade 0.5 ETH to USDC"
            const swapMatch = text.match(/(\d+(?:\.\d+)?)\s*(ETH|USDC|WETH|DAI|USDT|CBETH)\s+(?:for|to|into)\s+(ETH|USDC|WETH|DAI|USDT|CBETH)/i);
            if (!swapMatch) throw new Error('Could not parse swap. Example: "swap 10 USDC for ETH"');

            const amount = swapMatch[1];
            const src = swapMatch[2].toUpperCase();
            const dst = swapMatch[3].toUpperCase();

            const slippageMatch = text.match(/slippage\s+(\d+(?:\.\d+)?)/i);
            const slippage = slippageMatch ? parseFloat(slippageMatch[1]) : undefined;

            const COST = '10000';
            if (!service.spendTracker.canSpend(COST)) {
                const st = service.spendTracker.getStatus();
                const msg = `💸 Spend limit reached: $${st.spent} of $${st.maxBudget}.`;
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('spend limit reached') };
            }

            logger.info(`[PINION_TRADE] ${amount} ${src} → ${dst}`);
            const result = await service.client!.trade(src, dst, amount, slippage);
            if (result.paidAmount !== '0') service.spendTracker.recordSpend(result.paidAmount);

            const d = result.data;
            const approveNote = d.approve ? '\n  ⚠️ Approve tx also required — broadcast approve first.' : '';
            const response = [
                `🔄 Swap ${d.amount} ${d.srcToken} → ${d.dstToken}`,
                `  Router:  ${d.router}`,
                `  Network: ${d.network}`,
                `  Note:    ${d.note}${approveNote}`,
                '',
                'Use **PINION_BROADCAST** with swap (and approve) tx to execute.',
            ].join('\n');

            if (callback) await callback({ text: response, actions: ['PINION_TRADE'], source: message.content.source });
            return { text: response, success: true, data: d };
        } catch (error) {
            logger.error({ error }, '[PINION_TRADE] error');
            const msg = `❌ Trade failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'swap 10 USDC for ETH', actions: [] } },
            { name: '{{agentName}}', content: { text: '🔄 Swap 10 USDC → ETH via 1inch...', actions: ['PINION_TRADE'] } },
        ],
    ],
};
