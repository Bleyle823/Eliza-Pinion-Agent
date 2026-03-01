import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService } from '../services/PinionService.ts';

/**
 * PINION_BROADCAST — sign and broadcast a transaction on Base.
 * Costs $0.01 USDC via x402.
 */
export const broadcastAction: Action = {
    name: 'PINION_BROADCAST',
    similes: ['SUBMIT_TRANSACTION', 'EXECUTE_TX', 'SEND_TRANSACTION', 'BROADCAST_TX'],
    description:
        'Sign and broadcast a transaction on Base using the configured wallet. Pass the unsigned tx from PINION_SEND or PINION_TRADE. Costs $0.01 USDC via x402.',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        const service = runtime.getService<PinionService>(PinionService.serviceType);
        return (
            !!service &&
            (text.includes('broadcast') ||
                text.includes('submit tx') ||
                text.includes('send transaction') ||
                text.includes('execute tx') ||
                text.includes('execute transaction'))
        );
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

            // Try to extract a JSON tx object from message
            const jsonMatch = message.content.text?.match(/\{[\s\S]*"to"[\s\S]*\}/);
            let tx: any;
            if (jsonMatch) {
                try {
                    tx = JSON.parse(jsonMatch[0]);
                } catch {
                    throw new Error('Could not parse transaction JSON from message.');
                }
            } else {
                // Try to get tx from action data in memory (chained from PINION_SEND)
                throw new Error(
                    'No transaction object found. Run PINION_SEND or PINION_TRADE first, then provide the tx JSON in your message.',
                );
            }

            if (!tx.to) throw new Error('Transaction must have a "to" field.');

            const COST = '10000';
            if (!service.spendTracker.canSpend(COST)) {
                const st = service.spendTracker.getStatus();
                const msg = `💸 Spend limit reached: $${st.spent} of $${st.maxBudget}.`;
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('spend limit reached') };
            }

            logger.info(`[PINION_BROADCAST] broadcasting to ${tx.to}`);
            const result = await service.client!.broadcast(tx);
            if (result.paidAmount !== '0') service.spendTracker.recordSpend(result.paidAmount);

            const d = result.data;
            const response = [
                `✅ Transaction broadcast!`,
                `  Hash:    ${d.txHash}`,
                `  From:    ${d.from}`,
                `  To:      ${d.to}`,
                `  Network: ${d.network}`,
                `  Explorer: ${d.explorer}`,
            ].join('\n');

            if (callback) await callback({ text: response, actions: ['PINION_BROADCAST'], source: message.content.source });
            return { text: response, success: true, data: d };
        } catch (error) {
            logger.error({ error }, '[PINION_BROADCAST] error');
            const msg = `❌ Broadcast failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'broadcast {"to":"0x...","value":"0x38D7EA4C68000"}', actions: [] } },
            { name: '{{agentName}}', content: { text: '✅ Transaction broadcast! Hash: 0x...', actions: ['PINION_BROADCAST'] } },
        ],
    ],
};
