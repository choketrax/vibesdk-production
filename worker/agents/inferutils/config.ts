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

// Common configs - these are good defaults
const COMMON_AGENT_CONFIGS = {
    screenshotAnalysis: {
        name: AIModels.DISABLED,
        reasoning_effort: 'medium' as const,
        max_tokens: 4096,
        temperature: 1,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_3_70B,
    },
    realtimeCodeFixer: {
        name: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        reasoning_effort: 'low' as const,
        max_tokens: 8192,
        temperature: 0.2,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_1_8B,
    },
    fastCodeFixer: {
        name: AIModels.DISABLED,
        reasoning_effort: undefined,
        max_tokens: 8192,
        temperature: 0.0,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_3_70B,
    },
    templateSelection: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        max_tokens: 2000,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        temperature: 0.6,
    },
} as const;

const SHARED_IMPLEMENTATION_CONFIG = {
    reasoning_effort: 'low' as const,
    max_tokens: 8192,
    temperature: 0.7,
    fallbackModel: AIModels.WORKERS_AI_LLAMA_3_1_8B,
};

//======================================================================================
// ATTENTION! Platform config requires specific API keys and Cloudflare AI Gateway setup.
//======================================================================================
/* 
These are the configs used at build.cloudflare.dev 
You may need to provide API keys for these models in your environment or use 
Cloudflare AI Gateway unified billing for seamless model access without managing multiple keys.
*/
const PLATFORM_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    blueprint: {
        name: AIModels.GEMINI_3_PRO_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 20000,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
        temperature: 1.0,
    },
    projectSetup: {
        name: AIModels.GROK_4_1_FAST,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_2_5_PRO,
    },
    phaseGeneration: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.OPENAI_5_MINI,
    },
    firstPhaseImplementation: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: AIModels.GROK_4_1_FAST,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
    },
    deepDebugger: {
        name: AIModels.GROK_4_1_FAST,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_2_5_PRO,
    },
    fileRegeneration: {
        name: AIModels.GROK_4_1_FAST_NON_REASONING,
        reasoning_effort: 'low',
        max_tokens: 16000,
        temperature: 0.0,
        fallbackModel: AIModels.GROK_CODE_FAST_1,
    },
    agenticProjectBuilder: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_2_5_PRO,
    },
};

//======================================================================================
// Default Workers AI config (Neuron-first, uses CLOUDFLARE_API_TOKEN + AI Gateway)
//======================================================================================
const DEFAULT_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    templateSelection: {
        name: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        max_tokens: 2000,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        temperature: 0.6,
    },
    blueprint: {
        name: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        reasoning_effort: 'low',
        max_tokens: 8192,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_1_8B,
        temperature: 0.7,
    },
    projectSetup: {
        name: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseGeneration: {
        name: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    firstPhaseImplementation: {
        name: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        name: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 0.2,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_1_8B,
    },
    deepDebugger: {
        name: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        reasoning_effort: 'low',
        max_tokens: 8192,
        temperature: 0.4,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_1_8B,
    },
    fileRegeneration: {
        name: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        reasoning_effort: 'low',
        max_tokens: 8192,
        temperature: 0.2,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_1_8B,
    },
    agenticProjectBuilder: {
        name: AIModels.WORKERS_AI_LLAMA_3_3_70B,
        reasoning_effort: 'low',
        max_tokens: 8192,
        temperature: 0.5,
        fallbackModel: AIModels.WORKERS_AI_LLAMA_3_1_8B,
    },
};

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