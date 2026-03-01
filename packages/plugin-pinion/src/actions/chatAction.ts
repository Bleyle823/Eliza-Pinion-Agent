import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService } from '../services/PinionService.ts';

/**
 * PINION_CHAT — chat with the Pinion AI agent about x402, on-chain data, or the Pinion protocol.
 * Costs $0.01 USDC via x402.
 */
export const chatAction: Action = {
    name: 'PINION_CHAT',
    similes: ['ASK_PINION', 'PINION_AGENT', 'ONCHAIN_AI'],
    description:
        'Chat with the Pinion AI agent about x402, on-chain data, or the Pinion protocol. Costs $0.01 USDC via x402.',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const service = runtime.getService<PinionService>(PinionService.serviceType);
        return !!service;
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

            const COST = '10000';
            if (!service.spendTracker.canSpend(COST)) {
                const st = service.spendTracker.getStatus();
                const msg = `💸 Spend limit reached: $${st.spent} of $${st.maxBudget}.`;
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('spend limit reached') };
            }

            // Strip trigger prefix
            let userMessage = message.content.text || '';
            userMessage = userMessage
                .replace(/ask pinion:?\s*/i, '')
                .replace(/pinion chat:?\s*/i, '')
                .replace(/pinion:\s*/i, '')
                .trim();

            logger.info(`[PINION_CHAT] message: "${userMessage.slice(0, 60)}..."`);
            const result = await service.client!.chat(userMessage);
            if (result.paidAmount !== '0') service.spendTracker.recordSpend(result.paidAmount);

            const response = `🤖 Pinion: ${result.data.response}`;
            if (callback) await callback({ text: response, actions: ['PINION_CHAT'], source: message.content.source });
            return { text: response, success: true, data: result.data };
        } catch (error) {
            logger.error({ error }, '[PINION_CHAT] error');
            const msg = `❌ Pinion chat failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'ask pinion: what is x402?', actions: [] } },
            { name: '{{agentName}}', content: { text: '🤖 Pinion: x402 is a payment protocol...', actions: ['PINION_CHAT'] } },
        ],
    ],
};
