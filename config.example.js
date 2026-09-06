/**
 * PrivBrowse — Configuration Example
 * 
 * Copy this file to `config.js` and add your Anthropic API key,
 * or configure it directly through the extension's Settings tab in the popup UI.
 * 
 * IMPORTANT: NEVER commit your real API key to version control!
 */

const PRIVBROWSE_CONFIG = {
  // Your Anthropic API Key (starts with sk-ant-...)
  ANTHROPIC_API_KEY: "your-anthropic-api-key-here",

  // Target model (default: claude-sonnet-4-6)
  DEFAULT_MODEL: "claude-sonnet-4-6",

  // Enable simulated cloud reasoning fallback when no API key is set
  ENABLE_SIMULATION_FALLBACK: true
};

// Export to worker / global scope if loaded via importScripts
if (typeof self !== 'undefined') {
  self.PRIVBROWSE_CONFIG = PRIVBROWSE_CONFIG;
}
