# Graph Report - openzigs-social  (2026-05-29)

## Corpus Check
- 142 files · ~44,636 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 418 nodes · 509 edges · 21 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 20|Community 20]]

## God Nodes (most connected - your core abstractions)
1. `CredentialVault` - 15 edges
2. `TranscriptManager` - 14 edges
3. `SetupPage` - 11 edges
4. `HandoffManager` - 11 edges
5. `ApprovalQueue` - 10 edges
6. `startServer()` - 8 edges
7. `resolveDataDir()` - 8 edges
8. `AppShell` - 7 edges
9. `Metrics` - 7 edges
10. `loadConfig()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `handleVerify()` --calls--> `verifyTelegram()`  [INFERRED]
  ui/components/setup/telegram-step.tsx → src/server/setup/telegram-verify.ts
- `startServer()` --calls--> `createSocketServer()`  [INFERRED]
  src/server/index.ts → src/server/socket.ts
- `bootstrap()` --calls--> `startServer()`  [INFERRED]
  src/server.ts → src/server/index.ts
- `defaultVaultPath()` --calls--> `vaultPath()`  [INFERRED]
  src/vault/vault.ts → src/config/paths.ts
- `startServer()` --calls--> `createApp()`  [INFERRED]
  src/server/index.ts → src/server/app.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (22): deepMerge(), defaultConfigPath(), envLayer(), getConfig(), isObject(), loadConfig(), readJsonIfPresent(), setPath() (+14 more)

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
Cohesion: 0.14
Nodes (2): createSocketServer(), TranscriptManager

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (11): buildRequest(), stripTrailingSlash(), validateProviderKey(), assertSafeUrl(), canonicalizeIpv4(), isPrivateDottedQuad(), isPrivateIpv4(), isPrivateIpv6() (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.23
Nodes (9): clampStep(), getWizardSnapshot(), loadWizardState(), normalizeWizardState(), postJson(), saveWizardState(), validateProviderKey(), verifyTelegram() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.23
Nodes (1): HandoffManager

### Community 9 - "Community 9"
Cohesion: 0.21
Nodes (5): AuditLogger, isSensitiveKey(), redact(), redactInner(), scrubSecretsInString()

### Community 10 - "Community 10"
Cohesion: 0.2
Nodes (1): SetupPage

### Community 11 - "Community 11"
Cohesion: 0.23
Nodes (1): ApprovalQueue

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (2): RefreshRegistry, TokenRefreshScheduler

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (3): Probe(), useTheme(), ThemeToggle()

### Community 14 - "Community 14"
Cohesion: 0.39
Nodes (6): applyResolvedTheme(), applyTheme(), getStoredTheme(), getSystemTheme(), isTheme(), resolveTheme()

### Community 15 - "Community 15"
Cohesion: 0.29
Nodes (1): AppShell

### Community 16 - "Community 16"
Cohesion: 0.39
Nodes (4): appliedVersions(), ensureMigrationsTable(), loadMigrations(), migrate()

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (1): DashboardPage

### Community 18 - "Community 18"
Cohesion: 0.48
Nodes (5): addToRemoveQueue(), dispatch(), genId(), reducer(), toast()

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (1): SessionManager

### Community 20 - "Community 20"
Cohesion: 0.4
Nodes (3): generateUuid(), getClientId(), createSocket()

## Knowledge Gaps
- **Thin community `Community 5`** (24 nodes): `createSocketServer()`, `readClientId()`, `restoreSession()`, `connectionHandler()`, `flush()`, `makeFakeSocket()`, `waitForEvent()`, `TranscriptManager`, `.append()`, `.assertId()`, `.create()`, `.delete()`, `.enqueue()`, `.ledgerPath()`, `.list()`, `.load()`, `.metaPath()`, `.readMeta()`, `.renameId()`, `.renameTitle()`, `socket.test.ts`, `socket.ts`, `transcript-manager.test.ts`, `transcript-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (13 nodes): `HandoffManager`, `.abortAll()`, `.assertThreadId()`, `.constructor()`, `.emitChange()`, `.isHumanOwned()`, `.list()`, `.owner()`, `.register()`, `.release()`, `.takeOver()`, `handoff-manager.test.ts`, `handoff-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 10`** (12 nodes): `SetupPage`, `.advanceFromWelcome()`, `.completeProviderStep()`, `.constructor()`, `.goto()`, `.providerRadio()`, `.selectProvider()`, `.stepTitle()`, `.stubStatus()`, `.stubTelegramVerify()`, `.stubValidateKey()`, `setup.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (12 nodes): `ApprovalQueue`, `.clear()`, `.constructor()`, `.decide()`, `.get()`, `.has()`, `.list()`, `.request()`, `.settle()`, `.size()`, `approval-queue.test.ts`, `approval-queue.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (11 nodes): `refresh-scheduler.test.ts`, `refresh-scheduler.ts`, `RefreshRegistry`, `.get()`, `.has()`, `.register()`, `makeVault()`, `TokenRefreshScheduler`, `.constructor()`, `.markExpired()`, `.tick()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (8 nodes): `AppShell`, `.constructor()`, `.goto()`, `.navLink()`, `.openThemeMenu()`, `.selectTheme()`, `.storedTheme()`, `app-shell.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (7 nodes): `DashboardPage`, `.constructor()`, `.dialog()`, `.goto()`, `.kpiCard()`, `.openQuickActions()`, `dashboard.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (7 nodes): `SessionManager`, `.constructor()`, `.create()`, `.delete()`, `.get()`, `.list()`, `.send()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TranscriptManager` connect `Community 5` to `Community 0`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._