export const WP004A_RESEARCH_CONFIG_SCHEMA_VERSION = 'lythaus-wp004a-research-config-v1' as const;

export const OPENAI_MODERATION_MODEL = 'omni-moderation-latest' as const;
export const CLOUDFLARE_VISION_OBSERVER_MODEL = '@cf/moondream/moondream3.1-9B-A2B' as const;
export const CLOUDFLARE_REASONER_MODEL = '@cf/openai/gpt-oss-20b' as const;
export const LYTHAUS_FORENSICS_VERSION = 'lythaus-forensics-v1' as const;

export interface ResearchModelConfig {
  schemaVersion: typeof WP004A_RESEARCH_CONFIG_SCHEMA_VERSION;
  moderationModel: typeof OPENAI_MODERATION_MODEL;
  reasonerModel: string;
  visionObserverModel: string;
  forensicsVersion: string;
}

export const DEFAULT_RESEARCH_MODEL_CONFIG: ResearchModelConfig = {
  schemaVersion: WP004A_RESEARCH_CONFIG_SCHEMA_VERSION,
  moderationModel: OPENAI_MODERATION_MODEL,
  reasonerModel: CLOUDFLARE_REASONER_MODEL,
  visionObserverModel: CLOUDFLARE_VISION_OBSERVER_MODEL,
  forensicsVersion: LYTHAUS_FORENSICS_VERSION,
};

export interface ResearchModelEnvironment {
  AUTHENTICITY_REASONER_MODEL?: string;
  AUTHENTICITY_VISION_OBSERVER_MODEL?: string;
  AUTHENTICITY_FORENSICS_VERSION?: string;
}

export function researchModelConfigFromEnvironment(environment: ResearchModelEnvironment = {}): ResearchModelConfig {
  return {
    ...DEFAULT_RESEARCH_MODEL_CONFIG,
    reasonerModel: environment.AUTHENTICITY_REASONER_MODEL?.trim() || DEFAULT_RESEARCH_MODEL_CONFIG.reasonerModel,
    visionObserverModel: environment.AUTHENTICITY_VISION_OBSERVER_MODEL?.trim() || DEFAULT_RESEARCH_MODEL_CONFIG.visionObserverModel,
    forensicsVersion: environment.AUTHENTICITY_FORENSICS_VERSION?.trim() || DEFAULT_RESEARCH_MODEL_CONFIG.forensicsVersion,
  };
}
