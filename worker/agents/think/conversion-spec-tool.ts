import { tool, type Tool } from 'ai';
import { z } from 'zod';

const DESCRIPTION = [
	'Submit a structured Conversion Specification before modifying any files when converting an imported repository.',
	'',
	'Specify what to preserve, refactor, replace, and add (such as tenant isolation, auth, billing, audit logging), choose the runtimeTarget, and list concrete incremental implementation tasks.',
	'',
	'After calling this tool, present the summary to the user and wait for explicit approval before editing code.',
].join('\n');

export const conversionSpecInputSchema = z.object({
	preserve: z.array(z.string()).describe('Existing capabilities and modules to keep unchanged.'),
	refactor: z.array(z.string()).describe('Components requiring modification for Cloudflare/SaaS compatibility.'),
	replace: z.array(z.string()).describe('Incompatible or unsafe components to replace.'),
	add: z.array(z.string()).describe('Missing SaaS modules to add (auth, tenant isolation, RBAC, billing, audit logging).'),
	runtimeTarget: z.enum(['Native Cloudflare', 'Hybrid Cloudflare', 'Unsupported']),
	tasks: z
		.array(
			z.object({
				id: z.string(),
				title: z.string(),
				files: z.array(z.string()),
			}),
		)
		.min(1)
		.describe('Ordered list of small, verifiable implementation tasks.'),
});

export type ConversionSpecToolInput = z.infer<typeof conversionSpecInputSchema>;

export function createSubmitConversionSpecTool(): Tool {
	return tool({
		description: DESCRIPTION,
		inputSchema: conversionSpecInputSchema,
		execute: async (args: ConversionSpecToolInput) => {
			return JSON.stringify({
				ok: true,
				status: 'pending_approval',
				spec: {
					...args,
					status: 'pending_approval',
					submittedAt: Date.now(),
				},
			});
		},
	});
}
