import { 
    AgentActionKey, 
    AgentConfig, 
    AgentConstraintConfig, 
    AIModels,
    AllModels,
    LiteModels,
    RegularModels,
} from "./config.types";
import { env } from 'cloudflare:workers';

// Common configs - Cloudflare-hosted Workers AI models only
const COMMON_AGENT_CONFIGS = {
    screenshotAnalysis: {
        name: AIModels.DISABLED,
        reasoning_effort: 'medium' as const,
        max_tokens: 8192,
        temperature: 1,
        fallbackModel: AIModels.WORKERS_AI_DEEPSEEK_V4_1_FLASH,
    },
    realtimeCodeFixer: {
        name: AIModels.WORKERS_AI_QWEN_3_8_27B,
        reasoning_effort: 'low' as const,
        max_tokens: 16384,
        temperature: 0.2,
        fallbackModel: AIModels.WORKERS_AI_DEEPSEEK_V4_1_FLASH,
    },
    fastCodeFixer: {
        name: AIModels.DISABLED,
        reasoning_effort: undefined,
        max_tokens: 16384,
        temperature: 0.0,
        fallbackModel: AIModels.WORKERS_AI_QWEN_2_5_CODER_32B,
    },
    templateSelection: {
        name: AIModels.WORKERS_AI_GLM_4_7_FLASH,
        max_tokens: 2000,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        temperature: 0.6,
    },
} as const;

const SHARED_IMPLEMENTATION_CONFIG = {
    reasoning_effort: 'medium' as const,
    max_tokens: 32000,
    temperature: 0.2,
    fallbackModel: AIModels.WORKERS_AI_GPT_OSS_120B,
};

//======================================================================================
// ATTENTION! Platform config requires specific API keys and Cloudflare AI Gateway setup.
//======================================================================================
/* 
These are the configs used at build.cloudflare.dev 
You may need to provide API keys for these models in your environment or use 
Cloudflare AI Gateway unified billing for seamless model access without managing multiple keys.
*/
const CLOUDFLARE_WORKERS_AI_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    templateSelection: {
        name: AIModels.WORKERS_AI_GLM_4_7_FLASH,
        max_tokens: 2000,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        temperature: 0.6,
    },
    blueprint: {
        name: AIModels.WORKERS_AI_DEEPSEEK_V4_1_FLASH,
        reasoning_effort: 'high',
        max_tokens: 32000,
        fallbackModel: AIModels.WORKERS_AI_GPT_OSS_120B,
        temperature: 0.4,
    },
    projectSetup: {
        name: AIModels.WORKERS_AI_DEEPSEEK_V4_1_FLASH,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseGeneration: {
        name: AIModels.WORKERS_AI_DEEPSEEK_V4_1_FLASH,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    firstPhaseImplementation: {
        name: AIModels.WORKERS_AI_DEEPSEEK_V4_1_FLASH,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        name: AIModels.WORKERS_AI_DEEPSEEK_V4_1_FLASH,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: AIModels.WORKERS_AI_DEEPSEEK_V4_1_FLASH,
        reasoning_effort: 'low',
        max_tokens: 8000,
        temperature: 0.2,
        fallbackModel: AIModels.WORKERS_AI_GLM_4_7_FLASH,
    },
    deepDebugger: {
        name: AIModels.WORKERS_AI_DEEPSEEK_V4_1_FLASH,
        reasoning_effort: 'high',
        max_tokens: 32000,
        temperature: 0.2,
        fallbackModel: AIModels.WORKERS_AI_GPT_OSS_120B,
    },
    fileRegeneration: {
        name: AIModels.WORKERS_AI_QWEN_3_8_27B,
        reasoning_effort: 'low',
        max_tokens: 32000,
        temperature: 0.0,
        fallbackModel: AIModels.WORKERS_AI_DEEPSEEK_V4_1_FLASH,
    },
    agenticProjectBuilder: {
        name: AIModels.WORKERS_AI_DEEPSEEK_V4_1_FLASH,
        reasoning_effort: 'medium',
        max_tokens: 32000,
        temperature: 0.2,
        fallbackModel: AIModels.WORKERS_AI_GPT_OSS_120B,
    },
};

const PLATFORM_AGENT_CONFIG: AgentConfig = CLOUDFLARE_WORKERS_AI_CONFIG;
const DEFAULT_AGENT_CONFIG: AgentConfig = CLOUDFLARE_WORKERS_AI_CONFIG;

export const AGENT_CONFIG: AgentConfig = env.PLATFORM_MODEL_PROVIDERS 
    ? PLATFORM_AGENT_CONFIG 
    : DEFAULT_AGENT_CONFIG;


export const AGENT_CONSTRAINTS: Map<AgentActionKey, AgentConstraintConfig> = new Map([
	['fastCodeFixer', {
		allowedModels: new Set([AIModels.DISABLED]),
		enabled: true,
	}],
	['realtimeCodeFixer', {
		allowedModels: new Set([AIModels.DISABLED]),
		enabled: true,
	}],
	['fileRegeneration', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['phaseGeneration', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['projectSetup', {
		allowedModels: new Set([...RegularModels, AIModels.GEMINI_2_5_PRO]),
		enabled: true,
	}],
	['conversationalResponse', {
		allowedModels: new Set(RegularModels),
		enabled: true,
	}],
	['templateSelection', {
		allowedModels: new Set(LiteModels),
		enabled: true,
	}],
]);