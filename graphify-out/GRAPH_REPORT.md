# Graph Report - openzigs-social  (2026-05-29)

## Corpus Check
- 136 files · ~41,215 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 391 nodes · 476 edges · 20 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]

## God Nodes (most connected - your core abstractions)
1. `CredentialVault` - 15 edges
2. `TranscriptManager` - 14 edges
3. `SetupPage` - 11 edges
4. `startServer()` - 8 edges
5. `resolveDataDir()` - 8 edges
6. `AppShell` - 7 edges
7. `Metrics` - 7 edges
8. `loadConfig()` - 7 edges
9. `SessionManager` - 7 edges
10. `DashboardPage` - 6 edges

## Surprising Connections (you probably didn't know these)
- `handleVerify()` --calls--> `verifyTelegram()`  [INFERRED]
  ui/components/setup/telegram-step.tsx → src/server/setup/telegram-verify.ts
- `bootstrap()` --calls--> `startServer()`  [INFERRED]
  src/server.ts → src/server/index.ts
- `defaultVaultPath()` --calls--> `vaultPath()`  [INFERRED]
  src/vault/vault.ts → src/config/paths.ts
- `startServer()` --calls--> `getConfig()`  [INFERRED]
  src/server/index.ts → src/config/index.ts
- `startServer()` --calls--> `createApp()`  [INFERRED]
  src/server/index.ts → src/server/app.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (15): auditDir(), dbPath(), defaultDataDir(), logsDir(), resolveDataDir(), sessionsDir(), userConfigPath(), vaultPath() (+7 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (9): createApp(), createCorsMiddleware(), Metrics, zero(), createSetupRouter(), listen(), mount(), handleVerify() (+1 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (3): PrivacyController, estimateTokens(), SmartRouter

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (6): decrypt(), deriveKey(), encrypt(), CredentialVault, defaultKeyMaterial(), defaultVaultPath()

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (9): CopilotWrapper, AnthropicProvider, CopilotProvider, createProvider(), createOllamaProvider(), pickGemma4Variant(), pickInstalledGemma4(), probeOllama() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.22
Nodes (11): buildRequest(), stripTrailingSlash(), validateProviderKey(), assertSafeUrl(), canonicalizeIpv4(), isPrivateDottedQuad(), isPrivateIpv4(), isPrivateIpv6() (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.23
Nodes (9): clampStep(), getWizardSnapshot(), loadWizardState(), normalizeWizardState(), postJson(), saveWizardState(), validateProviderKey(), verifyTelegram() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.26
Nodes (8): deepMerge(), defaultConfigPath(), envLayer(), getConfig(), isObject(), loadConfig(), readJsonIfPresent(), setPath()

### Community 8 - "Community 8"
Cohesion: 0.33
Nodes (1): TranscriptManager

### Community 9 - "Community 9"
Cohesion: 0.21
Nodes (5): AuditLogger, isSensitiveKey(), redact(), redactInner(), scrubSecretsInString()

### Community 10 - "Community 10"
Cohesion: 0.2
Nodes (1): SetupPage

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (2): RefreshRegistry, TokenRefreshScheduler

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (3): Probe(), useTheme(), ThemeToggle()

### Community 13 - "Community 13"
Cohesion: 0.39
Nodes (6): applyResolvedTheme(), applyTheme(), getStoredTheme(), getSystemTheme(), isTheme(), resolveTheme()

### Community 14 - "Community 14"
Cohesion: 0.29
Nodes (1): AppShell

### Community 15 - "Community 15"
Cohesion: 0.39
Nodes (4): appliedVersions(), ensureMigrationsTable(), loadMigrations(), migrate()

### Community 16 - "Community 16"
Cohesion: 0.29
Nodes (1): DashboardPage

### Community 17 - "Community 17"
Cohesion: 0.48
Nodes (5): addToRemoveQueue(), dispatch(), genId(), reducer(), toast()

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (1): SessionManager

### Community 19 - "Community 19"
Cohesion: 0.4
Nodes (3): generateUuid(), getClientId(), createSocket()

## Knowledge Gaps
- **Thin community `Community 8`** (13 nodes): `TranscriptManager`, `.append()`, `.assertId()`, `.create()`, `.delete()`, `.enqueue()`, `.ledgerPath()`, `.list()`, `.load()`, `.metaPath()`, `.readMeta()`, `.renameId()`, `.renameTitle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 10`** (12 nodes): `SetupPage`, `.advanceFromWelcome()`, `.completeProviderStep()`, `.constructor()`, `.goto()`, `.providerRadio()`, `.selectProvider()`, `.stepTitle()`, `.stubStatus()`, `.stubTelegramVerify()`, `.stubValidateKey()`, `setup.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (11 nodes): `refresh-scheduler.test.ts`, `refresh-scheduler.ts`, `RefreshRegistry`, `.get()`, `.has()`, `.register()`, `makeVault()`, `TokenRefreshScheduler`, `.constructor()`, `.markExpired()`, `.tick()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (8 nodes): `AppShell`, `.constructor()`, `.goto()`, `.navLink()`, `.openThemeMenu()`, `.selectTheme()`, `.storedTheme()`, `app-shell.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (7 nodes): `DashboardPage`, `.constructor()`, `.dialog()`, `.goto()`, `.kpiCard()`, `.openQuickActions()`, `dashboard.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (7 nodes): `SessionManager`, `.constructor()`, `.create()`, `.delete()`, `.get()`, `.list()`, `.send()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TranscriptManager` connect `Community 8` to `Community 0`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `startServer()` (e.g. with `bootstrap()` and `getConfig()`) actually correct?**
  _`startServer()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._