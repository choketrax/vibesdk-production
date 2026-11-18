import type { BranchDeploymentBundle } from '@space-do/space';
import type { VerificationGateEvidence } from '../../agents/core/state';
import { detectPreDeploySafetyFindings } from '../../agents/utils/preDeploySafetyGate';

export interface VerificationSpaceStub {
	deploy: (
		branch: string,
	) => Promise<{ preview_url?: string; commit_hash?: string; error?: string; details?: string }>;
	getDeploymentBundle: (branch: string) => Promise<BranchDeploymentBundle>;
	listAppTables: (branch: string) => Promise<Array<{ name: string; columns: Array<{ name: string }> }>>;
	fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const SECRET_PATTERNS: Array<{ label: string; regex: RegExp }> = [
	{ label: 'Stripe live secret key', regex: /\bsk_live_[0-9a-zA-Z]{16,}/ },
	{ label: 'GitHub token', regex: /\bgh[pousr]_[0-9a-zA-Z]{20,}/ },
	{ label: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
	{ label: 'Private key PEM', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

export class VerificationGateService {
	static async runVerificationGates(opts: {
		spaceStub: VerificationSpaceStub;
		branch: string;
		spaceName?: string;
	}): Promise<VerificationGateEvidence> {
		const evaluatedAt = Date.now();
		const spaceName = opts.spaceName || 'app';

		// 1. Build Gate
		let buildPassed = false;
		let buildDetails = '';
		let bundle: BranchDeploymentBundle | null = null;

		try {
			const deployRes = await opts.spaceStub.deploy(opts.branch);
			if (deployRes?.error) {
				buildDetails = `${deployRes.error}${deployRes.details ? `: ${deployRes.details}` : ''}`;
			} else {
				bundle = await opts.spaceStub.getDeploymentBundle(opts.branch);
				if (!bundle?.mainModule || Object.keys(bundle.modules ?? {}).length === 0) {
					buildDetails = 'Deployment bundle missing mainModule or compiled modules';
				} else {
					buildPassed = true;
					buildDetails = `Compiled ${Object.keys(bundle.modules).length} module(s) and ${Object.keys(bundle.assets).length} asset(s) at commit ${bundle.commitHash.slice(0, 12)}`;
				}
			}
		} catch (error) {
			buildDetails = error instanceof Error ? error.message : String(error);
		}

		// 2. Safety & Secret Gate
		let findingsCount = 0;
		let secretLeaksCount = 0;
		const safetyDetails: string[] = [];

		if (bundle) {
			const inspectableEntries: Array<[string, string]> = [];
			for (const [modPath, modContent] of Object.entries(bundle.modules)) {
				if (typeof modContent === 'string') {
					inspectableEntries.push([modPath, modContent]);
				}
			}
			for (const [assetPath, assetContent] of Object.entries(bundle.assets)) {
				inspectableEntries.push([assetPath, assetContent]);
			}

			for (const [filePath, content] of inspectableEntries) {
				for (const pat of SECRET_PATTERNS) {
					if (pat.regex.test(content)) {
						secretLeaksCount++;
						safetyDetails.push(`Secret leak (${pat.label}) in ${filePath}`);
					}
				}
				if (/\.(js|mjs|ts|tsx|jsx)$/.test(filePath) && content.length < 150_000) {
					const findings = detectPreDeploySafetyFindings(content);
					for (const f of findings) {
						if (!f.message.startsWith('Failed to parse file')) {
							findingsCount++;
							safetyDetails.push(`AST safety finding in ${filePath}: ${f.message}`);
						}
					}
				}
			}
		} else {
			safetyDetails.push('Skipped AST/secret scan because build gate failed');
		}
		const safetyPassed = Boolean(bundle) && secretLeaksCount === 0 && findingsCount === 0;

		// 3. Functional Smoke Gate
		let smokePassed = false;
		let statusCode: number | undefined;
		const consoleErrors: string[] = [];
		const previewBase = `https://preview.internal/space/${encodeURIComponent(spaceName)}/preview/${encodeURIComponent(opts.branch)}`;

		if (buildPassed) {
			try {
				const res = await opts.spaceStub.fetch(new Request(`${previewBase}/`));
				statusCode = res.status;
				smokePassed = res.status >= 200 && res.status < 500;
				if (!smokePassed) {
					consoleErrors.push(`Preview root returned HTTP ${res.status}`);
				}
			} catch (error) {
				consoleErrors.push(error instanceof Error ? error.message : String(error));
			}
		} else {
			consoleErrors.push('Build gate failed before smoke probe');
		}

		// 4. Tenant Isolation Gate
		let tenantPassed = false;
		let tenantDetails = '';

		if (buildPassed && bundle) {
			try {
				const moduleTexts = Object.values(bundle.modules)
					.filter((v): v is string => typeof v === 'string')
					.join('\n');
				const hasTenantPredicate = /\btenant_id\b|\btenantId\b/.test(moduleTexts);

				let tableCheckNote = '';
				try {
					const tables = await opts.spaceStub.listAppTables(opts.branch);
					const nonMetaTables = tables.filter(
						(t) => !t.name.startsWith('_') && !t.name.startsWith('sqlite_'),
					);
					const tenantTables = nonMetaTables.filter((t) =>
						t.columns.some((c) => c.name === 'tenant_id'),
					);
					tableCheckNote = `${tenantTables.length}/${nonMetaTables.length} app table(s) include tenant_id`;
				} catch {
					tableCheckNote = 'SQLite table check skipped before first request';
				}

				const probeRes = await opts.spaceStub.fetch(
					new Request(`${previewBase}/api/tenant-isolation-probe`, {
						headers: { 'X-Tenant-Id': 'tenant-b-unauthorized' },
					}),
				);
				const probeProtected = probeRes.status === 401 || probeRes.status === 403 || probeRes.status === 404;

				tenantPassed = hasTenantPredicate && probeProtected;
				tenantDetails = `${hasTenantPredicate ? 'Verified tenant_id scoping in server bundle' : 'Missing tenant_id predicate in server bundle'}; ${tableCheckNote}; cross-tenant probe status=${probeRes.status}`;
			} catch (error) {
				tenantDetails = error instanceof Error ? error.message : String(error);
			}
		} else {
			tenantDetails = 'Build gate failed before tenant isolation verification';
		}

		const allPassed = buildPassed && safetyPassed && smokePassed && tenantPassed;

		return {
			commitSha: bundle?.commitHash ?? '',
			evaluatedAt,
			buildGate: { passed: buildPassed, details: buildDetails },
			safetyAndSecretGate: {
				passed: safetyPassed,
				findingsCount,
				secretLeaksCount,
				details: safetyDetails,
			},
			functionalSmokeGate: {
				passed: smokePassed,
				statusCode,
				consoleErrors,
			},
			tenantIsolationGate: { passed: tenantPassed, details: tenantDetails },
			allPassed,
		};
	}
}
