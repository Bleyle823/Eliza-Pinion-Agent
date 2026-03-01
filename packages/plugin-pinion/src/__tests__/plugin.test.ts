import { describe, it, expect, mock } from 'bun:test';
import { pinionPlugin } from '../index.ts';
import { PinionService } from '../services/PinionService.ts';

// Mock @elizaos/core
mock.module('@elizaos/core', () => ({
    Service: class { },
    logger: {
        info: () => { },
        debug: () => { },
        warn: () => { },
        error: () => { },
    },
}));

describe('Pinion Plugin', () => {
    it('should have the correct name and structure', () => {
        expect(pinionPlugin.name).toBe('plugin-pinion');
        expect(pinionPlugin.services).toContain(PinionService);
        expect(pinionPlugin.actions).toHaveLength(13);
    });

    it('should initialize with config', async () => {
        const config = {
            PINION_PRIVATE_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234',
        };
        if (pinionPlugin.init) {
            await pinionPlugin.init(config);
        }
        expect(process.env.PINION_PRIVATE_KEY).toBe(config.PINION_PRIVATE_KEY);
    });

    describe('PinionService', () => {
        it('should start and configure client', async () => {
            const mockRuntime = {
                getSetting: (key: string) => (key === 'PINION_PRIVATE_KEY' ? '0x1234567890123456789012345678901234567890123456789012345678901234' : null),
                getService: () => null,
            } as any;

            const service = await PinionService.start(mockRuntime);
            expect(service.isConfigured).toBe(true);
            expect(service.walletAddress).toBeDefined();
        });

        it('should handle missing private key gracefully', async () => {
            delete process.env.PINION_PRIVATE_KEY;
            delete process.env.PINION_API_KEY;
            const mockRuntime = {
                getSetting: () => null,
                getService: () => null,
            } as any;

            const service = await PinionService.start(mockRuntime);
            expect(service.isConfigured).toBe(false);
            expect(service.walletAddress).toBeNull();
        });
    });

    describe('pinionProvider', () => {
        it('should return context including wallet address', async () => {
            const mockRuntime = {
                getService: () => ({
                    isConfigured: true,
                    walletAddress: '0x123...',
                    network: 'base',
                    hasApiKey: false,
                    spendTracker: { getStatus: () => ({ spent: '0', maxBudget: 'unlimited', callCount: 0, isLimited: false }) }
                }),
            } as any;

            const providers = pinionPlugin.providers;
            if (!providers) throw new Error('Providers not defined');

            const result = await providers[0].get(mockRuntime, {} as any, {} as any);
            expect(result.text).toContain('Pinion OS Status');
            expect(result.text).toContain('0x123...');
        });
    });
});
