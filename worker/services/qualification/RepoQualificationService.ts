import type {
	QualificationOutcome,
	QualificationReport,
	RuntimeTarget,
} from '../../agents/core/state';
import { detectPreDeploySafetyFindings } from '../../agents/utils/preDeploySafetyGate';
import type { ImportedRepoFile } from '../github/RepoImportService';

const PERMISSIVE_LICENSES = new Set([
	'MIT',
	'Apache-2.0',
	'BSD-2-Clause',
	'BSD-3-Clause',
	'ISC',
	'0BSD',
	'Unlicense',
]);

const RESTRICTED_COPYLEFT_PREFIXES = ['AGPL', 'GPL', 'SSPL'];

const NODE_INCOMPATIBLE_PACKAGES = new Map<string, string>([
	['better-sqlite3', 'Native C++ SQLite addon — migrate to SpaceDO App SQLite Facet or D1'],
	['puppeteer', 'Headless browser binary — migrate to env.BROWSER binding or Hybrid Container'],
	['playwright', 'Browser automation binary — migrate to env.BROWSER or Hybrid Container'],
	['sharp', 'Native libvips image binary — migrate to Cloudflare Images or Worker-safe SVG/canvas'],
	['bcrypt', 'Native C++ addon — replace with WebCrypto PBKDF2 / SHA-256 (crypto.subtle)'],
	['fs-extra', 'Node filesystem dependency — replace with R2, KV, or DO SQLite'],
	['sqlite3', 'Native Node SQLite addon — migrate to DO SQLite Facet or D1'],
	['pg', 'Direct TCP PostgreSQL socket — requires Hyperdrive or D1/DO SQLite migration'],
	['mysql2', 'Direct TCP MySQL socket — requires Hyperdrive or D1/DO SQLite migration'],
	['mongoose', 'MongoDB TCP driver — requires HTTP/REST adapter or D1/DO SQLite refactor'],
]);

const DB_DRIVER_NAMES = [
	'drizzle-orm',
	'pg',
	'mysql2',
	'mongoose',
	'prisma',
	'@prisma/client',
	'better-sqlite3',
	'sqlite3',
];

const FRAMEWORK_NAMES = [
	'hono',
	'react',
	'vite',
	'next',
	'express',
	'fastify',
	'svelte',
	'vue',
	'itty-router',
	'astro',
];

const SECRET_PATTERNS: Array<{ label: string; regex: RegExp }> = [
	{ label: 'Stripe live secret key', regex: /\bsk_live_[0-9a-zA-Z]{16,}/ },
	{ label: 'GitHub PAT', regex: /\bgh[pousr]_[0-9a-zA-Z]{20,}/ },
	{ label: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
	{ label: 'Private key PEM', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

function detectLicenseFromFiles(
	licenseSpdx: string | null,
	files: ImportedRepoFile[],
): { spdxId: string | null; commercialCompatible: boolean; obligations: string[] } {
	let spdxId = licenseSpdx && licenseSpdx !== 'NOASSERTION' ? licenseSpdx : null;

	if (!spdxId) {
		const licenseFile = files.find((f) => /^license(?:\.(?:md|txt))?$/i.test(f.path));
		if (licenseFile) {
			const lower = licenseFile.content.toLowerCase();
			if (lower.includes('mit license') || lower.includes('permission is hereby granted, free of charge')) {
				spdxId = 'MIT';
			} else if (lower.includes('apache license') && lower.includes('version 2.0')) {
				spdxId = 'Apache-2.0';
			} else if (lower.includes('gnu affero general public license')) {
				spdxId = 'AGPL-3.0';
			} else if (lower.includes('gnu general public license')) {
				spdxId = 'GPL-3.0';
			}
		}
	}

	if (!spdxId) {
		return {
			spdxId: null,
			commercialCompatible: false,
			obligations: ['Missing or unrecognized LICENSE — commercial reuse requires legal confirmation'],
		};
	}

	if (PERMISSIVE_LICENSES.has(spdxId)) {
		return {
			spdxId,
			commercialCompatible: true,
			obligations: [`Retain upstream ${spdxId} copyright & license notice`],
		};
	}

	if (RESTRICTED_COPYLEFT_PREFIXES.some((p) => spdxId!.toUpperCase().startsWith(p))) {
		return {
			spdxId,
			commercialCompatible: false,
			obligations: [`Copyleft ${spdxId} restricts proprietary SaaS distribution without source disclosure`],
		};
	}

	return {
		spdxId,
		commercialCompatible: false,
		obligations: [`Verify commercial reuse terms for license ${spdxId}`],
	};
}

/**
 * Pure deterministic Phase 1 repository analyzer (0 LLM tokens).
 * Inspects license, dependencies, frameworks, DB drivers, AST safety,
 * secret leaks, and Cloudflare Workers compatibility.
 */
export class RepoQualificationService {
	static qualify(opts: {
		repoUrl: string;
		owner: string;
		repo: string;
		pinnedCommitSha: string;
		licenseSpdx: string | null;
		files: ImportedRepoFile[];
		neutralizedScripts: string[];
	}): QualificationReport {
		const license = detectLicenseFromFiles(opts.licenseSpdx, opts.files);
		const risks: QualificationReport['risks'] = [];

		const pkgFile = opts.files.find((f) => f.path.toLowerCase() === 'package.json');
		const allDeps: Record<string, string> = {};
		let hasNodeProject = false;
		if (pkgFile) {
			hasNodeProject = true;
			try {
				const pkg = JSON.parse(pkgFile.content) as {
					dependencies?: Record<string, string>;
					devDependencies?: Record<string, string>;
				};
				Object.assign(allDeps, pkg.dependencies ?? {}, pkg.devDependencies ?? {});
			} catch {
				risks.push({
					severity: 'medium',
					category: 'manifest',
					message: 'package.json could not be parsed cleanly',
					file: 'package.json',
				});
			}
		}

		const depNames = Object.keys(allDeps);
		const frameworks = FRAMEWORK_NAMES.filter((fw) => depNames.includes(fw));
		const databaseDrivers = DB_DRIVER_NAMES.filter((drv) => depNames.includes(drv));
		const incompatiblePackages: string[] = [];
		const notes: string[] = [];

		for (const dep of depNames) {
			const note = NODE_INCOMPATIBLE_PACKAGES.get(dep);
			if (note) {
				incompatiblePackages.push(dep);
				notes.push(`${dep}: ${note}`);
			}
		}

		if (opts.neutralizedScripts.length > 0) {
			risks.push({
				severity: 'medium',
				category: 'supply-chain',
				message: `Neutralized ${opts.neutralizedScripts.length} lifecycle install script(s) on import`,
				file: 'package.json',
			});
		}

		const hasWranglerConfig = opts.files.some((f) =>
			/^wrangler\.(json|jsonc|toml)$/i.test(f.path),
		);
		const entryCandidates = opts.files
			.map((f) => f.path)
			.filter((p) => /^(src\/|worker\/)?(index|server|app|main)\.(ts|tsx|js|jsx)$/i.test(p))
			.slice(0, 8);

		const authPatterns = new Set<string>();
		let hasTenantSeparation = false;
		let tsOrJsCount = 0;
		let pyCount = 0;

		for (const file of opts.files) {
			const lowerPath = file.path.toLowerCase();
			if (/\.(ts|tsx|js|jsx|mjs)$/.test(lowerPath)) tsOrJsCount++;
			if (lowerPath.endsWith('.py')) pyCount++;

			for (const pat of SECRET_PATTERNS) {
				if (pat.regex.test(file.content)) {
					risks.push({
						severity: 'critical',
						category: 'secrets',
						message: `Potential hardcoded secret (${pat.label}) detected`,
						file: file.path,
					});
				}
			}

			if (/child_process|new Function\s*\(|\beval\s*\(/.test(file.content)) {
				risks.push({
					severity: 'high',
					category: 'runtime-safety',
					message: 'Dynamic code execution or child_process usage detected',
					file: file.path,
				});
			}

			if (/\btenant_id\b|\btenantId\b|\borganization_id\b|\borgId\b/.test(file.content)) {
				hasTenantSeparation = true;
			}
			if (/jwt|jsonwebtoken|jose/i.test(file.content)) authPatterns.add('JWT');
			if (/oauth|passport|clerk|auth0/i.test(file.content)) authPatterns.add('OAuth/ExternalAuth');
			if (/session|cookie/i.test(file.content)) authPatterns.add('Session/Cookie');

			if (/\.(tsx|jsx|ts|js)$/.test(lowerPath) && file.content.length < 100_000) {
				const findings = detectPreDeploySafetyFindings(file.content);
				for (const f of findings) {
					if (!f.message.startsWith('Failed to parse file')) {
						risks.push({
							severity: 'medium',
							category: 'ast-safety',
							message: f.message,
							file: file.path,
						});
					}
				}
			}
		}

		const language =
			tsOrJsCount > 0 ? 'TypeScript/JavaScript' : pyCount > 0 ? 'Python' : hasNodeProject ? 'JavaScript' : 'Unknown';

		let runtimeTarget: RuntimeTarget = 'Native Cloudflare';
		if (pyCount > 0 && tsOrJsCount === 0) {
			runtimeTarget = 'Unsupported';
			notes.push('Python-only repository requires container or external runtime rather than Workers-native.');
		} else if (incompatiblePackages.length > 0 || frameworks.includes('next') || frameworks.includes('express')) {
			runtimeTarget = incompatiblePackages.some((p) => p === 'puppeteer' || p === 'playwright' || p === 'sharp')
				? 'Hybrid Cloudflare'
				: 'Native Cloudflare';
			if (frameworks.includes('express') || frameworks.includes('next')) {
				notes.push(`Framework (${frameworks.join(', ')}) requires Hono/Worker adapter refactoring.`);
			}
		}

		const hasCriticalSecretOrExec = risks.some(
			(r) => r.severity === 'critical' || (r.category === 'runtime-safety' && r.severity === 'high'),
		);

		let outcome: QualificationOutcome;
		if (
			(license.spdxId && RESTRICTED_COPYLEFT_PREFIXES.some((p) => license.spdxId!.toUpperCase().startsWith(p))) ||
			runtimeTarget === 'Unsupported'
		) {
			outcome = 'Reject';
		} else if (!license.commercialCompatible || hasCriticalSecretOrExec || runtimeTarget === 'Hybrid Cloudflare') {
			outcome = 'Manual Review';
		} else if (incompatiblePackages.length > 0 || !hasWranglerConfig || !hasTenantSeparation) {
			outcome = 'Conditional';
		} else {
			outcome = 'Accept';
		}

		const estimatedComplexity: QualificationReport['estimatedComplexity'] =
			incompatiblePackages.length >= 3 || databaseDrivers.length > 0 || !hasWranglerConfig
				? incompatiblePackages.length >= 3
					? 'high'
					: 'medium'
				: 'low';

		return {
			repoUrl: opts.repoUrl,
			owner: opts.owner,
			repo: opts.repo,
			pinnedCommitSha: opts.pinnedCommitSha,
			license,
			architecture: {
				language,
				frameworks,
				hasWranglerConfig,
				entryCandidates,
				databaseDrivers,
				authPatterns: Array.from(authPatterns),
				hasTenantSeparation,
			},
			cloudflareCompatibility: {
				runtimeTarget,
				incompatiblePackages,
				neutralizedScripts: opts.neutralizedScripts,
				notes,
			},
			risks,
			estimatedComplexity,
			outcome,
			evaluatedAt: Date.now(),
		};
	}
}
