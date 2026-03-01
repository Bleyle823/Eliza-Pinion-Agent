import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PinionService, signX402Payment, parsePaymentRequirements } from '../services/PinionService.ts';

// Inline payX402Service to avoid module resolution complexity
// Matches pinion-os-main/src/client/x402-generic.ts logic
async function payX402Service(
    wallet: any,
    url: string,
    options: { method?: string; body?: any; maxAmount?: string } = {},
): Promise<{ status: number; data: any; url: string; method: string; paidAmount: string; responseTimeMs: number }> {
    const method = (options.method || 'GET').toUpperCase();
    const start = Date.now();

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };

    const opts: RequestInit = { method, headers };
    if (options.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        opts.body = JSON.stringify(options.body);
    }

    const initial = await fetch(url, opts);

    if (initial.status !== 402) {
        const data = await initial.json().catch(() => ({ error: 'non-json response' }));
        return { status: initial.status, data, url, method, paidAmount: '0', responseTimeMs: Date.now() - start };
    }

    const reqBody = await initial.json();

    // Parse payment requirements and sign
    const { requirements: req, x402Version } = parsePaymentRequirements(reqBody);

    if (options.maxAmount) {
        if (BigInt(req.maxAmountRequired) > BigInt(options.maxAmount)) {
            throw new Error(`x402 payment exceeds max: required ${req.maxAmountRequired} > max ${options.maxAmount}`);
        }
    }

    const paymentHeader = await signX402Payment(wallet, req, x402Version);
    const paidHeaders = { ...headers, 'X-PAYMENT': paymentHeader };
    const paidOpts: RequestInit = { method, headers: paidHeaders };
    if (options.body && ['POST', 'PUT', 'PATCH'].includes(method)) paidOpts.body = JSON.stringify(options.body);
    const paid = await fetch(url, paidOpts);
    const data = await paid.json().catch(() => ({ error: 'non-json response' }));
    return { status: paid.status, data, url, method, paidAmount: req.maxAmountRequired, responseTimeMs: Date.now() - start };
}

/**
 * PINION_PAY_SERVICE — call any x402-paywalled endpoint on the internet.
 * Handles the full 402 → sign → pay → response flow.
 * Supports both x402 v1 and v2 (Stripe) transports.
 */
export const payServiceAction: Action = {
    name: 'PINION_PAY_SERVICE',
    similes: ['CALL_X402', 'PAY_API', 'X402_REQUEST', 'PAID_API_CALL'],
    description:
        'Call any x402-paywalled endpoint. Handles the 402 → sign → pay → response flow automatically. Works with any x402 server (v1 or v2/Stripe).',

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const text = (message.content.text || '').toLowerCase();
        const service = runtime.getService<PinionService>(PinionService.serviceType);
        const hasUrl = /https?:\/\//.test(message.content.text || '');
        return (
            !!service &&
            hasUrl &&
            (text.includes('pay service') ||
                text.includes('call x402') ||
                text.includes('x402 url') ||
                text.includes('pay api') ||
                text.includes('pinion pay'))
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

            const text = message.content.text || '';
            const urlMatch = text.match(/https?:\/\/[^\s]+/);
            if (!urlMatch) throw new Error('No URL found in message.');
            const url = urlMatch[0];

            const methodMatch = text.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/i);
            const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';

            const maxAmountMatch = text.match(/max[_\s+]?amount[:\s]+([0-9]+)/i);
            const maxAmount = maxAmountMatch?.[1] || '1000000'; // default $1.00

            logger.info(`[PINION_PAY_SERVICE] calling ${method} ${url}`);

            const result = await payX402Service(service.client!.signer, url, { method, maxAmount });
            if (result.paidAmount !== '0') service.spendTracker.recordSpend(result.paidAmount);

            const paidNote = result.paidAmount !== '0' ? ` (paid ${result.paidAmount} wei USDC)` : '';
            const response = `🌐 x402 Response from ${url}${paidNote}:\n${JSON.stringify(result.data, null, 2)}`;

            if (callback) await callback({ text: response, actions: ['PINION_PAY_SERVICE'], source: message.content.source });
            return { text: response, success: true, data: result };
        } catch (error) {
            logger.error({ error }, '[PINION_PAY_SERVICE] error');
            const msg = `❌ Pay service failed: ${error instanceof Error ? error.message : String(error)}`;
            if (callback) await callback({ text: msg, source: message.content.source });
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },

    examples: [
        [
            { name: '{{userName}}', content: { text: 'pay service https://example.com/api/data GET', actions: [] } },
            { name: '{{agentName}}', content: { text: '🌐 x402 Response from https://example.com...', actions: ['PINION_PAY_SERVICE'] } },
        ],
    ],
};
