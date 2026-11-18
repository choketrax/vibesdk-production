import type { PhasicBlueprint, AgenticBlueprint, PhaseConceptType ,
    FileOutputType,
    Blueprint,
} from '../schemas';
import type { InferenceMetadata } from '../inferutils/config.types';
import { BehaviorType, Plan, ProjectType } from './types';

export interface FileState extends FileOutputType {
    lastDiff: string;
}

export interface FileServingToken {
    token: string;
    createdAt: number;
}

export interface PhaseState extends PhaseConceptType {
    // deploymentNeeded: boolean;
    completed: boolean;
}

export enum CurrentDevState {
    IDLE,
    PHASE_GENERATING,
    PHASE_IMPLEMENTING,
    REVIEWING,
    FINALIZING,
}

export const MAX_PHASES = 10;

/** Common state fields for all agent behaviors */
export interface BaseProjectState {
    behaviorType: BehaviorType;
    projectType: ProjectType;
    
    // Identity
    projectName: string;
    query: string;
    sessionId: string;
    hostname: string;

    blueprint: Blueprint;

    templateName: string | 'custom';
    
    // Inference context
    readonly metadata: InferenceMetadata;
    
    // Generation control
    shouldBeGenerating: boolean;
    
    // Common file storage
    generatedFilesMap: Record<string, FileState>;
    
    // Common infrastructure
    sandboxInstanceId?: string;
    fileServingToken?: FileServingToken;
    commandsHistory?: string[];
    lastPackageJson?: string;
    pendingUserInputs: string[];
    projectUpdatesAccumulator: string[];
    
    // Deep debug
    lastDeepDebugTranscript: string | null;

    mvpGenerated: boolean;
    reviewingInitiated: boolean;
    cloudflareToken?: string; // Encrypted Cloudflare OAuth token blob (backend decrypts when needed)
    wsOrigin?: string; // Origin captured at WS upgrade time for token refresh
}

/** Phasic agent state */
export interface PhasicState extends BaseProjectState {
    behaviorType: 'phasic';
    blueprint: PhasicBlueprint;
    generatedPhases: PhaseState[];
    
    phasesCounter: number;
    currentDevState: CurrentDevState;
    reviewCycles?: number;
    currentPhase?: PhaseConceptType;
}

export interface WorkflowMetadata {
    name: string;
    description: string;
    params: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'object';
        description: string;
        example?: unknown;
        required: boolean;
    }>;
    bindings?: {
        envVars?: Record<string, {
            type: 'string';
            description: string;
            default?: string;
            required?: boolean;
        }>;
        secrets?: Record<string, {
            type: 'secret';
            description: string;
            required?: boolean;
        }>;
        resources?: Record<string, {
            type: 'kv' | 'r2' | 'd1' | 'queue' | 'ai';
            description: string;
            required?: boolean;
        }>;
    };
}

/** Agentic agent state */
export interface AgenticState extends BaseProjectState {
    behaviorType: 'agentic';
    blueprint: AgenticBlueprint;
    currentPlan: Plan;
}

/**
 * Think agent state — backed by `@cloudflare/think` (ThinkAgent DO) for the
 * agentic loop and `@space-do/space` SpaceDO for files/preview/deploy.
 *
 * Files are *not* mirrored into `generatedFilesMap`; they live in the
 * companion `SpaceDO` workspace and are read on demand via RPC. The map is
 * kept for shape compatibility and used as a small in-memory cache.
 */
export type QualificationOutcome = 'Accept' | 'Conditional' | 'Manual Review' | 'Reject';
export type RuntimeTarget = 'Native Cloudflare' | 'Hybrid Cloudflare' | 'Unsupported';

export interface QualificationReport {
    repoUrl: string;
    owner: string;
    repo: string;
    pinnedCommitSha: string;
    license: {
        spdxId: string | null;
        commercialCompatible: boolean;
        obligations: string[];
    };
    architecture: {
        language: string;
        frameworks: string[];
        hasWranglerConfig: boolean;
        entryCandidates: string[];
        databaseDrivers: string[];
        authPatterns: string[];
        hasTenantSeparation: boolean;
    };
    cloudflareCompatibility: {
        runtimeTarget: RuntimeTarget;
        incompatiblePackages: string[];
        neutralizedScripts: string[];
        notes: string[];
    };
    risks: Array<{
        severity: 'low' | 'medium' | 'high' | 'critical';
        category: string;
        message: string;
        file?: string;
    }>;
    estimatedComplexity: 'low' | 'medium' | 'high';
    outcome: QualificationOutcome;
    evaluatedAt: number;
}

export interface ConversionSpecTask {
    id: string;
    title: string;
    files: string[];
    completed?: boolean;
    commitSha?: string;
}

export interface ConversionSpec {
    preserve: string[];
    refactor: string[];
    replace: string[];
    add: string[];
    runtimeTarget: RuntimeTarget;
    tasks: ConversionSpecTask[];
    status: 'pending_approval' | 'approved' | 'revision_required';
    submittedAt: number;
    approvedAt?: number;
    approvedBy?: string;
}

export interface VerificationGateEvidence {
    commitSha: string;
    evaluatedAt: number;
    buildGate: { passed: boolean; details: string };
    safetyAndSecretGate: {
        passed: boolean;
        findingsCount: number;
        secretLeaksCount: number;
        details: string[];
    };
    functionalSmokeGate: {
        passed: boolean;
        statusCode?: number;
        consoleErrors: string[];
    };
    tenantIsolationGate: { passed: boolean; details: string };
    allPassed: boolean;
}

export type ConversionJobStage =
    | 'imported'
    | 'qualified'
    | 'spec_pending'
    | 'approved'
    | 'refactoring'
    | 'verified'
    | 'staging_deployed'
    | 'production_deployed'
    | 'rejected';

export interface ConversionJobState {
    jobId: string;
    sourceRepoUrl: string;
    owner: string;
    repo: string;
    branch: string;
    pinnedCommitSha: string;
    baselineSpaceCommitSha?: string;
    stage: ConversionJobStage;
    qualification?: QualificationReport;
    spec?: ConversionSpec;
    budget: {
        maxStepsPerJob: number;
        usedSteps: number;
        maxRepairCycles: number;
        usedRepairCycles: number;
    };
    verification?: VerificationGateEvidence;
    stagingDeploymentUrl?: string;
    productionDeploymentUrl?: string;
    lastKnownGoodCommitSha?: string;
}

export interface ThinkState extends BaseProjectState {
    behaviorType: 'think';
    blueprint: AgenticBlueprint;
    /** ThinkAgent DO `idFromName` key (the agent id). */
    thinkAgentName: string;
    /** Git branch used for deployment previews. */
    currentBranch: string;
    /** Last commit SHA we successfully deployed. */
    lastDeployedCommit?: string;
    cloudflareDeploymentUrl?: string;
    conversionJob?: ConversionJobState;
}

export type AgentState = PhasicState | AgenticState | ThinkState;
