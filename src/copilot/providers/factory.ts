/**
 * Provider factory. Given a `ProviderConfig`, return the right concrete
 * provider instance. Add new providers here.
 */
import { AnthropicProvider } from "./anthropic.js";
import { CopilotProvider, type CopilotProviderOptions } from "./copilot.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { Provider, ProviderConfig } from "./types.js";

export interface CreateProviderDeps {
  copilot?: CopilotProviderOptions;
}

export function createProvider(config: ProviderConfig, deps: CreateProviderDeps = {}): Provider {
  switch (config.kind) {
    case "openai":
    case "openai-compatible":
      return new OpenAICompatibleProvider(config);
    case "anthropic":
      return new AnthropicProvider(config);
    case "copilot":
      return new CopilotProvider(config, deps.copilot);
    default: {
      const exhaustive: never = config.kind;
      throw new Error(`createProvider: unknown kind ${String(exhaustive)}`);
    }
  }
}
