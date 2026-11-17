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

// Common configs - routed via Cloudflare AI Gateway using top coding LLMs
const COMMON_AGENT_CONFIGS = {
    screenshotAnalysis: {
        name: AIModels.DISABLED,
        reasoning_effort: 'medium' as const,
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.CLAUDE_4_5_SONNET,
    },
    realtimeCodeFixer: {
        name: AIModels.CLAUDE_4_5_SONNET,
        reasoning_effort: 'low' as const,
        max_tokens: 32000,
        temperature: 0.2,
        fallbackModel: AIModels.CLAUDE_4_5_HAIKU,
    },
    fastCodeFixer: {
        name: AIModels.DISABLED,
        reasoning_effort: undefined,
        max_tokens: 64000,
        temperature: 0.0,
        fallbackModel: AIModels.CLAUDE_4_5_SONNET,
    },
    templateSelection: {
        name: AIModels.CLAUDE_4_5_HAIKU,
        max_tokens: 2000,
        fallbackModel: AIModels.OPENAI_5_MINI,
        temperature: 0.6,
    },
} as const;

const SHARED_IMPLEMENTATION_CONFIG = {
    reasoning_effort: 'medium' as const,
    max_tokens: 48000,
    temperature: 0.2,
    fallbackModel: AIModels.OPENAI_5_2,
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
// Top Coding LLMs via Cloudflare AI Gateway (Claude 4.5 Opus/Sonnet/Haiku + GPT-5.2)
//======================================================================================
const DEFAULT_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    templateSelection: {
        name: AIModels.CLAUDE_4_5_HAIKU,
        max_tokens: 2000,
        fallbackModel: AIModels.OPENAI_5_MINI,
        temperature: 0.6,
    },
    blueprint: {
        name: AIModels.CLAUDE_4_5_OPUS,
        reasoning_effort: 'high',
        max_tokens: 32000,
        fallbackModel: AIModels.CLAUDE_4_5_SONNET,
        temperature: 0.4,
    },
    projectSetup: {
        name: AIModels.CLAUDE_4_5_SONNET,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseGeneration: {
        name: AIModels.CLAUDE_4_5_SONNET,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    firstPhaseImplementation: {
        name: AIModels.CLAUDE_4_5_SONNET,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        name: AIModels.CLAUDE_4_5_SONNET,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: AIModels.CLAUDE_4_5_SONNET,
        reasoning_effort: 'low',
        max_tokens: 8000,
        temperature: 0.2,
        fallbackModel: AIModels.CLAUDE_4_5_HAIKU,
    },
    deepDebugger: {
        name: AIModels.CLAUDE_4_5_OPUS,
        reasoning_effort: 'high',
        max_tokens: 32000,
        temperature: 0.2,
        fallbackModel: AIModels.OPENAI_5_2,
    },
    fileRegeneration: {
        name: AIModels.CLAUDE_4_5_SONNET,
        reasoning_effort: 'low',
        max_tokens: 32000,
        temperature: 0.0,
        fallbackModel: AIModels.OPENAI_5_2,
    },
    agenticProjectBuilder: {
        name: AIModels.CLAUDE_4_5_SONNET,
        reasoning_effort: 'medium',
        max_tokens: 32000,
        temperature: 0.2,
        fallbackModel: AIModels.OPENAI_5_2,
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