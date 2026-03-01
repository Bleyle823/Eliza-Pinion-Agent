import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService } from '../services/PinionService.ts';

/**
 * PINION_SEND — construct an unsigned ETH or USDC transfer transaction on Base.
 * Use PINION_BROADCAST to sign and execute it. Costs $0.01 USDC via x402.
 */
export const sendAction: Action = {
    name: 'PINION_SEND',
    similes: ['SEND_ETH', 'SEND_USDC', 'TRANSFER_TOKEN', 'BUILD_TRANSFER'],
    description:
        'Construct an unsigned ETH or USDC transfer transaction on Base. Returns unsigned tx — use PINION_BROADCAST to execute. Costs $0.01 USDC via x402.',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        const hasKeyword =
            text.includes('send') || text.includes('transfer') || text.includes('move') || text.includes('pay');
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
            const addressMatch = text.match(/0x[0-9a-fA-F]{40}/);
            if (!addressMatch) throw new Error('No recipient address found.');
            const to = addressMatch[0];

            const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(ETH|USDC)/i);
            if (!amountMatch) throw new Error('Could not parse amount and token. Example: "send 0.1 ETH to 0x..."');
            const amount = amountMatch[1];
            const token = amountMatch[2].toUpperCase() as 'ETH' | 'USDC';

            const COST = '10000';
            if (!service.spendTracker.canSpend(COST)) {
                const st = service.spendTracker.getStatus();
                const msg = `💸 Spend limit reached: $${st.spent} of $${st.maxBudget}.`;
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('spend limit reached') };
            }

            logger.info(`[PINION_SEND] building ${amount} ${token} → ${to}`);
            const result = await service.client!.send(to, amount, token);
            if (result.paidAmount !== '0') service.spendTracker.recordSpend(result.paidAmount);

            const d = result.data;
            const response = [
                `📤 Unsigned ${token} transfer built:`,
                `  To:      ${d.tx.to}`,
                `  Amount:  ${d.amount} ${d.token}`,
                `  Network: ${d.network}`,
                `  Note:    ${d.note}`,
                '',
                'Use **PINION_BROADCAST** with this tx object to sign and send.',
            ].join('\n');

            if (callback) await callback({ text: response, actions: ['PINION_SEND'], source: message.content.source });
            return { text: response, success: true, data: d };
        } catch (error) {
            logger.error({ error }, '[PINION_SEND] error');
            const msg = `❌ Send failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'send 0.1 ETH to 0xRecipient...', actions: [] } },
            { name: '{{agentName}}', content: { text: '📤 Unsigned ETH transfer built...', actions: ['PINION_SEND'] } },
        ],
    ],
};
