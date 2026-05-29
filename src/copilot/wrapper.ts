/**
 * High-level wrapper that wires the session manager, smart router, privacy
 * controller, and provider registry behind a single object.
 *
 * `CopilotWrapper` is the only seam the rest of the app talks to for LLM
 * work — providers/SDK/etc. are encapsulated here.
 */
import { PrivacyController, type PrivacyMode } from "./privacy.js";
import {
  createOllamaProvider,
  createProvider,
  type Provider,
  type ProviderConfig
} from "./providers/index.js";
import { SessionManager } from "./session-manager.js";
import { SmartRouter, type RouterConfig } from "./smart-router.js";

export interface WrapperOptions {
  local?: Provider;
  cloud?: Provider | ProviderConfig;
  privacy?: PrivacyMode;
  router?: RouterConfig;
}

export class CopilotWrapper {
  readonly privacy: PrivacyController;
  readonly router: SmartRouter;
  readonly sessions: SessionManager;
  readonly local: Provider;
  readonly cloud?: Provider;

  constructor(opts: WrapperOptions = {}) {
    this.privacy = new PrivacyController(opts.privacy ?? "off");
    this.local = opts.local ?? createOllamaProvider();
    if (opts.cloud) {
      this.cloud = "chat" in opts.cloud ? (opts.cloud as Provider) : createProvider(opts.cloud);
      if (this.privacy.mode === "global") {
        this.privacy.assertCloudAllowed(this.cloud.config.name);
      }
    }
    this.router = new SmartRouter(
      { local: this.local, cloud: this.cloud, privacy: this.privacy },
      opts.router
    );
    this.sessions = new SessionManager(this.router, this.privacy);
  }

  setPrivacyMode(mode: PrivacyMode): void {
    this.privacy.set(mode);
  }
}
