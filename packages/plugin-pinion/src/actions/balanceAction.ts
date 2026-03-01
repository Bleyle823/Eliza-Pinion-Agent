import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService } from '../services/PinionService.ts';

/**
 * PINION_BALANCE — get ETH and USDC balances for any address on Base.
 * Costs $0.01 USDC via x402.
 */
export const balanceAction: Action = {
    name: 'PINION_BALANCE',
    similes: ['CHECK_BALANCE', 'WALLET_BALANCE', 'GET_BALANCE', 'ETH_BALANCE'],
    description:
        'Get ETH and USDC balances for any Ethereum address on Base. Costs $0.01 USDC via x402 micropayment.',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        const hasKeyword =
            text.includes('balance') ||
            text.includes('how much') ||
            text.includes('eth') ||
            text.includes('usdc') ||
            text.includes('wallet') ||
            text.includes('money') ||
            text.includes('funds') ||
            text.includes('crypto');
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
                const msg = '⚠️ Pinion wallet not configured. Use PINION_SETUP or set PINION_PRIVATE_KEY.';
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('wallet not configured') };
            }

            const addressMatch = (message.content.text || '').match(/0x[0-9a-fA-F]{40}/);
            const address = addressMatch ? addressMatch[0] : service.walletAddress;
            if (!address) throw new Error('No valid Ethereum address found in message or service.');

            const client = service.client!;

            // Check spend limit
            const COST = '10000';
            if (!service.spendTracker.canSpend(COST)) {
                const st = service.spendTracker.getStatus();
                const msg = `💸 Spend limit reached: $${st.spent} of $${st.maxBudget} budget (${st.callCount} calls).`;
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('spend limit reached') };
            }

            logger.info(`[PINION_BALANCE] checking ${address}`);
            const result = await client.balance(address);

            if (result.paidAmount !== '0') service.spendTracker.recordSpend(result.paidAmount);

            const d = result.data;
            const response = [
                `💰 Balance for ${d.address}`,
                `  Network: ${d.network}`,
                `  ETH:     ${d.balances.ETH}`,
                `  USDC:    ${d.balances.USDC}`,
                `  As of:   ${d.timestamp}`,
                result.paidAmount !== '0' ? `\n  (paid ${result.paidAmount} wei USDC via x402)` : '',
            ].join('\n');

            if (callback) await callback({ text: response, actions: ['PINION_BALANCE'], source: message.content.source });
            return { text: response, success: true, data: d };
        } catch (error) {
            logger.error({ error }, '[PINION_BALANCE] error');
            const msg = `❌ Balance check failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'check balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', actions: [] } },
            { name: '{{agentName}}', content: { text: '💰 Balance for 0xd8dA...', actions: ['PINION_BALANCE'] } },
        ],
    ],
};
