import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService } from '../services/PinionService.ts';

/**
 * PINION_UNLIMITED — purchase unlimited access to all Pinion skills for $100 USDC.
 * Returns an API key that bypasses per-call x402 payments.
 */
export const unlimitedAction: Action = {
    name: 'PINION_UNLIMITED',
    similes: ['BUY_UNLIMITED', 'GET_API_KEY', 'UPGRADE_PLAN', 'PINION_SUBSCRIBE'],
    description:
        'Purchase unlimited access to all Pinion OS skills for a one-time $100 USDC payment. Returns an API key that bypasses x402 on all future calls.',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        const service = runtime.getService<PinionService>(PinionService.serviceType);
        return (
            !!service &&
            (text.includes('pinion unlimited') ||
                text.includes('buy unlimited') ||
                text.includes('unlimited plan') ||
                text.includes('get api key') ||
                text.includes('pinion api key') ||
                text.includes('pinion subscribe'))
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

            // $100 USDC = 100_000_000 atomic
            const COST = '100000000';
            if (!service.spendTracker.canSpend(COST)) {
                const st = service.spendTracker.getStatus();
                const msg = `💸 Spend limit too low for unlimited ($100 USDC): $${st.spent} of $${st.maxBudget}.`;
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('spend limit too low') };
            }

            logger.info('[PINION_UNLIMITED] purchasing unlimited plan');
            const result = await service.client!.unlimited();
            if (result.paidAmount !== '0') service.spendTracker.recordSpend(result.paidAmount);

            const d = result.data;
            // Auto-apply the API key
            service.client!.setApiKey(d.apiKey);

            const response = [
                '🔓 Pinion Unlimited activated!',
                `  Plan:    ${d.plan}`,
                `  API Key: ${d.apiKey}`,
                `  Address: ${d.address}`,
                d.price ? `  Price:   ${d.price}` : '',
                d.note ? `  Note:    ${d.note}` : '',
                '',
                '✅ API key applied — all future calls are now free (no x402 per-call charge).',
                'Save your API key: set PINION_API_KEY in your .env to persist it.',
            ].filter(Boolean).join('\n');

            if (callback) await callback({ text: response, actions: ['PINION_UNLIMITED'], source: message.content.source });
            return { text: response, success: true, data: d };
        } catch (error) {
            logger.error({ error }, '[PINION_UNLIMITED] error');
            const msg = `❌ Unlimited purchase failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'buy pinion unlimited plan', actions: [] } },
            { name: '{{agentName}}', content: { text: '🔓 Pinion Unlimited activated! API Key: pk_...', actions: ['PINION_UNLIMITED'] } },
        ],
    ],
};
