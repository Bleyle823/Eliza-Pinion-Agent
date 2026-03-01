import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService } from '../services/PinionService.ts';

/**
 * PINION_UNLIMITED_VERIFY — check if an unlimited API key is valid.
 * Free — no x402 cost.
 */
export const unlimitedVerifyAction: Action = {
    name: 'PINION_UNLIMITED_VERIFY',
    similes: ['CHECK_API_KEY', 'VERIFY_PLAN', 'CHECK_UNLIMITED'],
    description: 'Check if a Pinion unlimited API key (pk_...) is valid. Returns associated address and plan details. Free — no x402 cost.',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        const service = runtime.getService<PinionService>(PinionService.serviceType);
        const hasPk = /pk_[a-zA-Z0-9]+/.test(message.content.text || '');
        return (
            !!service &&
            (text.includes('verify') || text.includes('check')) &&
            (text.includes('api key') || text.includes('unlimited') || hasPk)
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

            const keyMatch = (message.content.text || '').match(/pk_[a-zA-Z0-9]+/);
            if (!keyMatch) throw new Error('No API key (pk_...) found in message.');
            const key = keyMatch[0];

            logger.info(`[PINION_UNLIMITED_VERIFY] verifying key ${key.slice(0, 8)}...`);
            const result = await service.client!.unlimitedVerify(key);

            const response = result.valid
                ? [
                    `✅ API key is valid`,
                    result.address ? `  Address: ${result.address}` : '',
                    result.plan ? `  Plan:    ${result.plan}` : '',
                    result.since ? `  Since:   ${result.since}` : '',
                ].filter(Boolean).join('\n')
                : `❌ API key is invalid: ${result.error || 'unknown reason'}`;

            if (callback) await callback({ text: response, actions: ['PINION_UNLIMITED_VERIFY'], source: message.content.source });
            return { text: response, success: true, data: result };
        } catch (error) {
            logger.error({ error }, '[PINION_UNLIMITED_VERIFY] error');
            const msg = `❌ Verify failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'verify api key pk_abc123', actions: [] } },
            { name: '{{agentName}}', content: { text: '✅ API key is valid. Plan: unlimited', actions: ['PINION_UNLIMITED_VERIFY'] } },
        ],
    ],
};
