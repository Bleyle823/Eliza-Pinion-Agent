import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService } from '../services/PinionService.ts';

/**
 * PINION_FUND — get wallet balance and funding instructions for a Base address.
 * Costs $0.01 USDC via x402.
 */
export const fundAction: Action = {
    name: 'PINION_FUND',
    similes: ['FUNDING_INSTRUCTIONS', 'HOW_TO_FUND', 'DEPOSIT_INFO'],
    description:
        'Get wallet balance and funding instructions (ETH + USDC) for a Base address. Costs $0.01 USDC via x402.',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        const service = runtime.getService<PinionService>(PinionService.serviceType);
        return (
            !!service &&
            (text.includes('fund') || text.includes('deposit') || text.includes('how to get') || text.includes('funding'))
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

            const addressMatch = (message.content.text || '').match(/0x[0-9a-fA-F]{40}/);
            const address = addressMatch?.[0]; // optional — defaults to own wallet

            const COST = '10000';
            if (!service.spendTracker.canSpend(COST)) {
                const st = service.spendTracker.getStatus();
                const msg = `💸 Spend limit reached: $${st.spent} of $${st.maxBudget}.`;
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('spend limit reached') };
            }

            logger.info(`[PINION_FUND] checking ${address || 'own wallet'}`);
            const result = await service.client!.fund(address);
            if (result.paidAmount !== '0') service.spendTracker.recordSpend(result.paidAmount);

            const d = result.data;
            const steps = d.funding.steps.map((s: string, i: number) => `  ${i + 1}. ${s}`).join('\n');
            const response = [
                `💳 Funding info for ${d.address}`,
                `  Network: ${d.network} (chainId: ${d.chainId})`,
                `  ETH:     ${d.balances.ETH}`,
                `  USDC:    ${d.balances.USDC}`,
                `  Deposit: ${d.depositAddress}`,
                '',
                `Recommended minimum: ETH ${d.funding.minimumRecommended.ETH} | USDC ${d.funding.minimumRecommended.USDC}`,
                `Bridge: ${d.funding.bridgeUrl}`,
                '',
                'Steps:',
                steps,
            ].join('\n');

            if (callback) await callback({ text: response, actions: ['PINION_FUND'], source: message.content.source });
            return { text: response, success: true, data: d };
        } catch (error) {
            logger.error({ error }, '[PINION_FUND] error');
            const msg = `❌ Fund info failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'how do I fund my wallet?', actions: [] } },
            { name: '{{agentName}}', content: { text: '💳 Funding info for 0x...', actions: ['PINION_FUND'] } },
        ],
    ],
};
