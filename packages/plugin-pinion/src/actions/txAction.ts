import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService } from '../services/PinionService.ts';

/**
 * PINION_TX — decode a Base transaction.
 * Costs $0.01 USDC via x402.
 */
export const txAction: Action = {
    name: 'PINION_TX',
    similes: ['TRANSACTION_LOOKUP', 'DECODE_TX', 'TX_DETAILS', 'LOOKUP_TRANSACTION'],
    description: 'Get decoded transaction details for any Base transaction hash. Costs $0.01 USDC via x402.',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        const hasKeyword =
            text.includes('transaction') || text.includes('tx') || text.includes('hash') || text.includes('lookup');
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

            const hashMatch = (message.content.text || '').match(/0x[0-9a-fA-F]{64}/);
            if (!hashMatch) throw new Error('No valid transaction hash (0x + 64 hex chars) found.');
            const hash = hashMatch[0];

            const COST = '10000';
            if (!service.spendTracker.canSpend(COST)) {
                const st = service.spendTracker.getStatus();
                const msg = `💸 Spend limit reached: $${st.spent} of $${st.maxBudget}.`;
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('spend limit reached') };
            }

            logger.info(`[PINION_TX] looking up ${hash}`);
            const result = await service.client!.tx(hash);
            if (result.paidAmount !== '0') service.spendTracker.recordSpend(result.paidAmount);

            const d = result.data;
            const response = [
                `🔍 Transaction: ${d.hash}`,
                `  Status:  ${d.status}`,
                `  From:    ${d.from}`,
                `  To:      ${d.to}`,
                `  Value:   ${d.value}`,
                `  Gas:     ${d.gasUsed}`,
                `  Block:   ${d.blockNumber ?? 'pending'}`,
                `  Network: ${d.network}`,
            ].join('\n');

            if (callback) await callback({ text: response, actions: ['PINION_TX'], source: message.content.source });
            return { text: response, success: true, data: d };
        } catch (error) {
            logger.error({ error }, '[PINION_TX] error');
            const msg = `❌ TX lookup failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'decode tx 0xabc123...def456', actions: [] } },
            { name: '{{agentName}}', content: { text: '🔍 Transaction: 0xabc123...', actions: ['PINION_TX'] } },
        ],
    ],
};
