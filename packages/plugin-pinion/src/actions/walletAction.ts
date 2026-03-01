import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService } from '../services/PinionService.ts';

/**
 * PINION_WALLET — generate a fresh Base wallet keypair.
 * Costs $0.01 USDC via x402.
 */
export const walletAction: Action = {
    name: 'PINION_WALLET',
    similes: ['CREATE_KEYPAIR', 'NEW_KEYPAIR', 'GENERATE_KEYPAIR'],
    description: 'Generate a fresh Ethereum wallet keypair for the Base network via Pinion. Costs $0.01 USDC via x402.',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        const service = runtime.getService<PinionService>(PinionService.serviceType);
        const isSetup = text.includes('setup') || text.includes('configure');
        return (
            !!service &&
            !isSetup &&
            (text.includes('generate') || text.includes('create') || text.includes('new')) &&
            (text.includes('wallet') || text.includes('keypair') || text.includes('address'))
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

            const COST = '10000';
            if (!service.spendTracker.canSpend(COST)) {
                const st = service.spendTracker.getStatus();
                const msg = `💸 Spend limit reached: $${st.spent} of $${st.maxBudget}.`;
                if (callback) await callback({ text: msg, source: message.content.source });
                return { text: msg, success: false, error: new Error('spend limit reached') };
            }

            logger.info('[PINION_WALLET] generating new wallet via Pinion');
            const result = await service.client!.wallet();
            if (result.paidAmount !== '0') service.spendTracker.recordSpend(result.paidAmount);

            const d = result.data;
            const response = [
                '🔑 New wallet generated:',
                `  Address:     ${d.address}`,
                `  Private key: ${d.privateKey}`,
                `  Network:     ${d.network} (chainId: ${d.chainId})`,
                `  Note:        ${d.note}`,
                '',
                '⚠️  Save the private key — it is shown only once.',
            ].join('\n');

            if (callback) await callback({ text: response, actions: ['PINION_WALLET'], source: message.content.source });
            return { text: response, success: true, data: d };
        } catch (error) {
            logger.error({ error }, '[PINION_WALLET] error');
            const msg = `❌ Wallet generation failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'generate a new wallet via pinion', actions: [] } },
            { name: '{{agentName}}', content: { text: '🔑 New wallet generated: Address: 0x...', actions: ['PINION_WALLET'] } },
        ],
    ],
};
