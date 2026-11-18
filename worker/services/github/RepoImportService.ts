import { GitHubService } from './GitHubService';
import { ZipExtractor } from '../sandbox/zipExtractor';
import type { SpaceWorkspaceStub } from '../../agents/think/space-workspace-ops';

export interface ImportedRepoFile {
	path: string;
	content: string;
}

export interface RepoImportResult {
	repoUrl: string;
	owner: string;
	repo: string;
	branch: string;
	pinnedCommitSha: string;
	licenseSpdx: string | null;
	baselineSpaceCommitSha: string;
	files: ImportedRepoFile[];
	skippedFiles: string[];
	neutralizedScripts: string[];
}

const MAX_IMPORT_FILES = 250;
const MAX_SINGLE_FILE_BYTES = 512 * 1024;
const LIFECYCLE_SCRIPT_KEYS = ['preinstall', 'install', 'postinstall', 'prepare'] as const;

const SKIP_DIR_PREFIXES = ['.git/', '.github/workflows/', 'node_modules/', 'dist/', '.next/', '.wrangler/'];

function stripZipRootPrefix(rawPath: string): string {
	const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
	const slashIdx = normalized.indexOf('/');
	return slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized;
}

function shouldSkipPath(path: string): boolean {
	if (!path || path.endsWith('/')) return true;
	const lower = path.toLowerCase();
	if (SKIP_DIR_PREFIXES.some((prefix) => lower.startsWith(prefix) || lower.includes(`/${prefix}`))) {
		return true;
	}
	if (lower.endsWith('.lock') || lower === 'package-lock.json' || lower === 'yarn.lock' || lower === 'pnpm-lock.yaml') {
		return true;
	}
	return false;
}

/**
 * Neutralize untrusted npm lifecycle hooks in imported package.json files
 * without executing any repository scripts.
 */
export function sanitizeImportedPackageJson(raw: string): {
	content: string;
	neutralizedScripts: string[];
} {
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const scripts = parsed.scripts as Record<string, unknown> | undefined;
		if (!scripts || typeof scripts !== 'object') {
			return { content: raw, neutralizedScripts: [] };
		}

		const neutralizedScripts: string[] = [];
		const preservedNeutralized: Record<string, string> = {};
		for (const key of LIFECYCLE_SCRIPT_KEYS) {
			if (typeof scripts[key] === 'string') {
				neutralizedScripts.push(`${key}: ${scripts[key]}`);
				preservedNeutralized[key] = scripts[key] as string;
				delete scripts[key];
			}
		}

		if (neutralizedScripts.length === 0) {
			return { content: raw, neutralizedScripts: [] };
		}

		parsed._neutralizedScripts = preservedNeutralized;
		return {
			content: JSON.stringify(parsed, null, 2),
			neutralizedScripts,
		};
	} catch {
		return { content: raw, neutralizedScripts: [] };
	}
}

/**
 * Imports a qualified or candidate GitHub repository at an immutable commit SHA
 * into a SpaceDO workspace without executing any repository code or hooks.
 */
export class RepoImportService {
	static async importIntoSpace(opts: {
		repoUrl: string;
		ref?: string;
		githubToken?: string;
		spaceStub: SpaceWorkspaceStub;
	}): Promise<RepoImportResult> {
		const repoInfo = GitHubService.extractRepoInfo(opts.repoUrl);
		if (!repoInfo) {
			throw new Error(`Invalid GitHub repository URL: ${opts.repoUrl}`);
		}

		const { owner, repo } = repoInfo;
		const resolved = await GitHubService.resolveCommitSha(owner, repo, opts.ref, opts.githubToken);
		const branch = opts.ref?.trim() || resolved.defaultBranch;
		const zipBuffer = await GitHubService.downloadRepoZipArchive(
			owner,
			repo,
			resolved.sha,
			opts.githubToken,
		);
		const extracted = ZipExtractor.extractFiles(zipBuffer);

		const files: ImportedRepoFile[] = [];
		const skippedFiles: string[] = [];
		const neutralizedScripts: string[] = [];

		for (const entry of extracted) {
			const relPath = stripZipRootPrefix(entry.filePath);
			if (shouldSkipPath(relPath)) {
				if (relPath) skippedFiles.push(relPath);
				continue;
			}
			if (entry.fileContents.startsWith('base64:')) {
				skippedFiles.push(relPath);
				continue;
			}
			if (entry.fileContents.length > MAX_SINGLE_FILE_BYTES) {
				skippedFiles.push(relPath);
				continue;
			}
			if (files.length >= MAX_IMPORT_FILES) {
				skippedFiles.push(relPath);
				continue;
			}

			let content = entry.fileContents;
			if (relPath.toLowerCase() === 'package.json') {
				const sanitized = sanitizeImportedPackageJson(content);
				content = sanitized.content;
				neutralizedScripts.push(...sanitized.neutralizedScripts);
			}

			files.push({ path: relPath, content });
		}

		for (const file of files) {
			const slashIdx = file.path.lastIndexOf('/');
			if (slashIdx > 0) {
				await opts.spaceStub.mkdir(file.path.slice(0, slashIdx), { recursive: true });
			}
			await opts.spaceStub.writeFile(file.path, file.content);
		}

		const commitRes = await opts.spaceStub.gitCommit(
			`import: ${owner}/${repo}@${resolved.sha.slice(0, 12)}`,
			{ name: 'VibeSDK Importer', email: 'importer@vibesdk.local' },
		);

		return {
			repoUrl: `https://github.com/${owner}/${repo}`,
			owner,
			repo,
			branch,
			pinnedCommitSha: resolved.sha,
			licenseSpdx: resolved.licenseSpdx,
			baselineSpaceCommitSha: commitRes.sha,
			files,
			skippedFiles,
			neutralizedScripts,
		};
	}
}
