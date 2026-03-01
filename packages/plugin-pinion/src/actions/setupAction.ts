import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { ethers } from 'ethers';
import { PinionService, PinionClientWrapper } from '../services/PinionService.ts';

const PINION_API_URL = process.env.PINION_API_URL || 'https://pinionos.com/skill';

/**
 * PINION_SETUP — configure the Pinion wallet at runtime.
 * Supports 'import' (provide private key) or 'generate' (create new wallet).
 */
export const setupAction: Action = {
    name: 'PINION_SETUP',
    similes: ['CONFIGURE_PINION', 'IMPORT_WALLET', 'GENERATE_WALLET', 'SETUP_WALLET'],
    description:
        'Configure the Pinion wallet. Import an existing private key or generate a new wallet. Required before calling any paid Pinion skill if PINION_PRIVATE_KEY is not set in env.',

    validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        return (
            text.includes('setup pinion') ||
            text.includes('configure pinion') ||
            text.includes('import wallet') ||
            text.includes('import key') ||
            text.includes('generate wallet') ||
            text.includes('create wallet') ||
            text.includes('pinion setup') ||
            text.includes('new wallet') ||
            text.includes('setup wallet')
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
            if (!service) throw new Error('PinionService not available');

            const text = message.content.text || '';
            const network = runtime.getSetting('PINION_NETWORK') || process.env.PINION_NETWORK || 'base';

            // Check if user wants to generate
            if (
                text.toLowerCase().includes('generate') ||
                text.toLowerCase().includes('create') ||
                text.toLowerCase().includes('new wallet')
            ) {
                const wallet = ethers.Wallet.createRandom();
                const client = new PinionClientWrapper({
                    privateKey: wallet.privateKey,
                    apiUrl: PINION_API_URL,
                    network,
                });
                service.setClient(client);

                const response = [
                    '✅ New Pinion wallet generated:',
                    `  Address:     ${wallet.address}`,
                    `  Private key: ${wallet.privateKey}`,
                    '',
                    '⚠️  Save the private key somewhere safe — this is shown only once.',
                    'Fund with ETH (gas) and USDC on Base before using paid skills.',
                    'Set PINION_PRIVATE_KEY in your .env to persist across sessions.',
                ].join('\n');

                if (callback) await callback({ text: response, actions: ['PINION_SETUP'], source: message.content.source });
                return { text: response, success: true, data: { address: wallet.address, privateKey: wallet.privateKey } };
            }

            // Import mode — extract 0x key from message
            const keyMatch = text.match(/0x[0-9a-fA-F]{64}/);
            if (keyMatch) {
                try {
                    const client = new PinionClientWrapper({
                        privateKey: keyMatch[0],
                        apiUrl: PINION_API_URL,
                        network,
                    });
                    service.setClient(client);
                    const response = `✅ Pinion wallet configured: ${client.address}\nReady to use all Pinion skills. Make sure this wallet has ETH (gas) and USDC on Base.`;
                    if (callback) await callback({ text: response, actions: ['PINION_SETUP'], source: message.content.source });
                    return { text: response, success: true, data: { address: client.address } };
                } catch (e: any) {
                    throw new Error(`Invalid private key: ${e.message}`);
                }
            }

            const response = [
                '🔧 Pinion Setup',
                '',
                'To import an existing wallet, include your private key (0x...):',
                '  "setup pinion with key 0xYOUR_KEY"',
                '',
                'To generate a new wallet:',
                '  "generate a new pinion wallet"',
            ].join('\n');
            if (callback) await callback({ text: response, actions: ['PINION_SETUP'], source: message.content.source });
            return { text: response, success: true, data: {} };
        } catch (error) {
            logger.error({ error }, '[PINION_SETUP] error');
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'generate a new pinion wallet', actions: [] } },
            { name: '{{agentName}}', content: { text: '✅ New Pinion wallet generated: 0xABC...', actions: ['PINION_SETUP'] } },
        ],
        [
            { name: '{{userName}}', content: { text: 'setup pinion with key 0xABC123...', actions: [] } },
            { name: '{{agentName}}', content: { text: '✅ Pinion wallet configured: 0x123...', actions: ['PINION_SETUP'] } },
        ],
    ],
};
