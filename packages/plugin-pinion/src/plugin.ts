import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';

import { PinionService } from './services/PinionService.ts';
import { pinionProvider } from './providers/pinionProvider.ts';

// Actions
import { setupAction } from './actions/setupAction.ts';
import { balanceAction } from './actions/balanceAction.ts';
import { priceAction } from './actions/priceAction.ts';
import { txAction } from './actions/txAction.ts';
import { walletAction } from './actions/walletAction.ts';
import { chatAction } from './actions/chatAction.ts';
import { sendAction } from './actions/sendAction.ts';
import { tradeAction } from './actions/tradeAction.ts';
import { fundAction } from './actions/fundAction.ts';
import { broadcastAction } from './actions/broadcastAction.ts';
import { unlimitedAction } from './actions/unlimitedAction.ts';
import { unlimitedVerifyAction } from './actions/unlimitedVerifyAction.ts';
import { payServiceAction } from './actions/payServiceAction.ts';

const configSchema = z.object({
    PINION_PRIVATE_KEY: z.string().optional(),
    PINION_API_KEY: z.string().optional(),
    PINION_API_URL: z.string().optional(),
    PINION_NETWORK: z.string().optional().default('base'),
});

export const pinionPlugin: Plugin = {
    name: 'plugin-pinion',
    description:
        'Pinion OS plugin for ElizaOS — x402 micropayment blockchain AI skills on Base. balance, price, tx, wallet, chat, send, trade, fund, broadcast, unlimited.',

    config: {
        PINION_PRIVATE_KEY: process.env.PINION_PRIVATE_KEY,
        PINION_API_KEY: process.env.PINION_API_KEY,
        PINION_API_URL: process.env.PINION_API_URL,
        PINION_NETWORK: process.env.PINION_NETWORK,
    },

    async init(config: Record<string, string>) {
        logger.debug('[plugin-pinion] initializing');
        try {
            const validated = await configSchema.parseAsync(config);
            for (const [k, v] of Object.entries(validated)) {
                if (v) process.env[k] = v;
            }
            if (!validated.PINION_PRIVATE_KEY && !validated.PINION_API_KEY) {
                logger.warn(
                    '[plugin-pinion] Neither PINION_PRIVATE_KEY nor PINION_API_KEY is set. ' +
                    'Use the PINION_SETUP action to configure a wallet at runtime.',
                );
            }
        } catch (error) {
            if (error instanceof z.ZodError) {
                throw new Error(`[plugin-pinion] Invalid config: ${error.issues.map((e) => e.message).join(', ')}`);
            }
            throw error;
        }
    },

    services: [PinionService],

    actions: [
        setupAction,
        balanceAction,
        priceAction,
        txAction,
        walletAction,
        chatAction,
        sendAction,
        tradeAction,
        fundAction,
        broadcastAction,
        unlimitedAction,
        unlimitedVerifyAction,
        payServiceAction,
    ],

    providers: [pinionProvider],
};

export default pinionPlugin;
