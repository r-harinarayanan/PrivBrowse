/**
 * PrivBrowse Enterprise — Commercial Configuration (v1.2.0)
 * 
 * Part of SIH 2026, PS ID SIH26171 | Team: Breaking Bad
 * On-device privacy browser agent configuration.
 */

const PRIVBROWSE_CONFIG = {
  VERSION: "1.2.0-enterprise",
  BUILD: "2026.1-COMMERCIAL",
  ANTHROPIC_API_KEY: "",
  DEFAULT_MODEL: "claude-sonnet-4-6",
  ENABLE_SIMULATION_FALLBACK: true,

  // Enterprise Dual-Engine Perception
  PERCEPTION_ENGINE: "vision", // 'vision' (SmolVLM-256M WebGPU) | 'dom' (Structural)
  AZFR_ENABLED: true,          // Atomic Zero-Knowledge Frame Rendering
  PREMASK_ENABLED: true,       // Canvas input blackout pre-masking
  SURVEILLANCE_ENABLED: true,  // 5-second post-execution DOM surveillance

  // Cloud & Air-Gapped Reasoning
  REASONING_BACKEND: "anthropic", // 'anthropic' | 'ollama' | 'openai_compatible' | 'simulation'
  CUSTOM_ENDPOINT_URL: "http://localhost:11434/api/chat",
  CUSTOM_MODEL_NAME: "llama3.2",
  TIMEOUT_SEC: 15,

  // Local NER & Redaction Policies
  NER_ENGINE: "gliner",        // 'gliner' (ONNX Web) | 'regex' (Heuristic)
  BLIND_STRUCTURAL: true,      // Blind labels to [GOV_ID_INPUT] etc.
  CUSTOM_DENYLIST: ""
};

if (typeof self !== 'undefined') {
  self.PRIVBROWSE_CONFIG = PRIVBROWSE_CONFIG;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PRIVBROWSE_CONFIG;
}
