/**
 * Privacy mode kill-switch.
 *
 *  - `off`     — smart router free to use cloud providers
 *  - `session` — current process force-routes everything to local
 *  - `global`  — persistent, blocks cloud providers from being constructed
 *
 * Persistence is handled by the caller (config layer); this module is the
 * pure decision surface.
 */
export type PrivacyMode = "off" | "session" | "global";

export const PRIVACY_MODES: readonly PrivacyMode[] = ["off", "session", "global"] as const;

export function isPrivacyMode(value: unknown): value is PrivacyMode {
  return typeof value === "string" && (PRIVACY_MODES as readonly string[]).includes(value);
}

export function forcesLocal(mode: PrivacyMode): boolean {
  return mode !== "off";
}

export class PrivacyController {
  private current: PrivacyMode;

  constructor(initial: PrivacyMode = "off") {
    this.current = initial;
  }

  get mode(): PrivacyMode {
    return this.current;
  }

  set(mode: PrivacyMode): void {
    this.current = mode;
  }

  /** Should the smart router skip cloud routes entirely? */
  forcesLocal(): boolean {
    return forcesLocal(this.current);
  }

  /**
   * Guard for cloud-provider construction. When mode is `global` we hard-fail
   * any attempt to instantiate a cloud provider — defence in depth so callers
   * can't bypass the router.
   */
  assertCloudAllowed(providerName: string): void {
    if (this.current === "global") {
      throw new Error(`privacy: cloud provider "${providerName}" blocked by global privacy mode`);
    }
  }
}
