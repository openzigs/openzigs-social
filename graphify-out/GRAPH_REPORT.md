# Graph Report - openzigs-social  (2026-05-29)

## Corpus Check
- 114 files · ~29,473 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 317 nodes · 384 edges · 17 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `TranscriptManager` - 14 edges
2. `CredentialVault` - 13 edges
3. `startServer()` - 8 edges
4. `resolveDataDir()` - 8 edges
5. `AppShell` - 7 edges
6. `Metrics` - 7 edges
7. `loadConfig()` - 7 edges
8. `SessionManager` - 7 edges
9. `DashboardPage` - 6 edges
10. `PrivacyController` - 6 edges

## Surprising Connections (you probably didn't know these)
- `startServer()` --calls--> `createApp()`  [INFERRED]
  src/server/index.ts → src/server/app.ts
- `bootstrap()` --calls--> `startServer()`  [INFERRED]
  src/server.ts → src/server/index.ts
- `startServer()` --calls--> `getConfig()`  [INFERRED]
  src/server/index.ts → src/config/index.ts
- `startServer()` --calls--> `createSocketServer()`  [INFERRED]
  src/server/index.ts → src/server/socket.ts
- `loadConfig()` --calls--> `userConfigPath()`  [INFERRED]
  src/config/index.ts → src/config/paths.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (14): auditDir(), dbPath(), defaultDataDir(), logsDir(), resolveDataDir(), sessionsDir(), userConfigPath(), getDb() (+6 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (3): PrivacyController, estimateTokens(), SmartRouter

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (9): CopilotWrapper, AnthropicProvider, CopilotProvider, createProvider(), createOllamaProvider(), pickGemma4Variant(), pickInstalledGemma4(), probeOllama() (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (7): vaultPath(), decrypt(), deriveKey(), encrypt(), CredentialVault, defaultKeyMaterial(), defaultVaultPath()

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (3): createApp(), Metrics, zero()

### Community 5 - "Community 5"
Cohesion: 0.33
Nodes (1): TranscriptManager

### Community 6 - "Community 6"
Cohesion: 0.26
Nodes (8): deepMerge(), defaultConfigPath(), envLayer(), getConfig(), isObject(), loadConfig(), readJsonIfPresent(), setPath()

### Community 7 - "Community 7"
Cohesion: 0.2
Nodes (2): RefreshRegistry, TokenRefreshScheduler

### Community 8 - "Community 8"
Cohesion: 0.27
Nodes (5): AuditLogger, isSensitiveKey(), redact(), redactInner(), scrubSecretsInString()

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (3): Probe(), useTheme(), ThemeToggle()

### Community 10 - "Community 10"
Cohesion: 0.39
Nodes (6): applyResolvedTheme(), applyTheme(), getStoredTheme(), getSystemTheme(), isTheme(), resolveTheme()

### Community 11 - "Community 11"
Cohesion: 0.29
Nodes (1): AppShell

### Community 12 - "Community 12"
Cohesion: 0.39
Nodes (4): appliedVersions(), ensureMigrationsTable(), loadMigrations(), migrate()

### Community 13 - "Community 13"
Cohesion: 0.29
Nodes (1): DashboardPage

### Community 14 - "Community 14"
Cohesion: 0.48
Nodes (5): addToRemoveQueue(), dispatch(), genId(), reducer(), toast()

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (1): SessionManager

### Community 16 - "Community 16"
Cohesion: 0.4
Nodes (3): generateUuid(), getClientId(), createSocket()

## Knowledge Gaps
- **Thin community `Community 5`** (13 nodes): `TranscriptManager`, `.append()`, `.assertId()`, `.create()`, `.delete()`, `.enqueue()`, `.ledgerPath()`, `.list()`, `.load()`, `.metaPath()`, `.readMeta()`, `.renameId()`, `.renameTitle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 7`** (12 nodes): `index.ts`, `refresh-scheduler.test.ts`, `refresh-scheduler.ts`, `RefreshRegistry`, `.get()`, `.has()`, `.register()`, `makeVault()`, `TokenRefreshScheduler`, `.constructor()`, `.markExpired()`, `.tick()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (8 nodes): `AppShell`, `.constructor()`, `.goto()`, `.navLink()`, `.openThemeMenu()`, `.selectTheme()`, `.storedTheme()`, `app-shell.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (7 nodes): `DashboardPage`, `.constructor()`, `.dialog()`, `.goto()`, `.kpiCard()`, `.openQuickActions()`, `dashboard.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (7 nodes): `SessionManager`, `.constructor()`, `.create()`, `.delete()`, `.get()`, `.list()`, `.send()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TranscriptManager` connect `Community 5` to `Community 0`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `startServer()` (e.g. with `bootstrap()` and `getConfig()`) actually correct?**
  _`startServer()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._