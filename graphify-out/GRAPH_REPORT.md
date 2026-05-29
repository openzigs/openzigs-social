# Graph Report - openzigs-social  (2026-05-29)

## Corpus Check
- 63 files · ~21,604 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 209 nodes · 314 edges · 11 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `TranscriptManager` - 14 edges
2. `CredentialVault` - 13 edges
3. `startServer()` - 8 edges
4. `resolveDataDir()` - 8 edges
5. `Metrics` - 7 edges
6. `loadConfig()` - 7 edges
7. `SessionManager` - 7 edges
8. `PrivacyController` - 6 edges
9. `migrate()` - 5 edges
10. `AuditLogger` - 5 edges

## Surprising Connections (you probably didn't know these)
- `bootstrap()` --calls--> `startServer()`  [INFERRED]
  src/server.ts → src/server/index.ts
- `defaultVaultPath()` --calls--> `vaultPath()`  [INFERRED]
  src/vault/vault.ts → src/config/paths.ts
- `startServer()` --calls--> `getConfig()`  [INFERRED]
  src/server/index.ts → src/config/index.ts
- `startServer()` --calls--> `createLogger()`  [INFERRED]
  src/server/index.ts → src/logging/logger.ts
- `startServer()` --calls--> `getDb()`  [INFERRED]
  src/server/index.ts → src/db/index.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (3): PrivacyController, estimateTokens(), SmartRouter

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (14): auditDir(), dbPath(), defaultDataDir(), logsDir(), resolveDataDir(), sessionsDir(), userConfigPath(), vaultPath() (+6 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (9): CopilotWrapper, AnthropicProvider, CopilotProvider, createProvider(), createOllamaProvider(), pickGemma4Variant(), pickInstalledGemma4(), probeOllama() (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (6): decrypt(), deriveKey(), encrypt(), CredentialVault, defaultKeyMaterial(), defaultVaultPath()

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (6): createApp(), buildReadinessCheck(), startServer(), zero(), createSocketServer(), bootstrap()

### Community 5 - "Community 5"
Cohesion: 0.21
Nodes (6): getDb(), openDb(), appliedVersions(), ensureMigrationsTable(), loadMigrations(), migrate()

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (1): TranscriptManager

### Community 7 - "Community 7"
Cohesion: 0.26
Nodes (8): deepMerge(), defaultConfigPath(), envLayer(), getConfig(), isObject(), loadConfig(), readJsonIfPresent(), setPath()

### Community 8 - "Community 8"
Cohesion: 0.2
Nodes (2): RefreshRegistry, TokenRefreshScheduler

### Community 9 - "Community 9"
Cohesion: 0.48
Nodes (1): Metrics

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (1): SessionManager

## Knowledge Gaps
- **Thin community `Community 6`** (13 nodes): `TranscriptManager`, `.append()`, `.assertId()`, `.create()`, `.delete()`, `.enqueue()`, `.ledgerPath()`, `.list()`, `.load()`, `.metaPath()`, `.readMeta()`, `.renameId()`, `.renameTitle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (12 nodes): `index.ts`, `refresh-scheduler.test.ts`, `refresh-scheduler.ts`, `RefreshRegistry`, `.get()`, `.has()`, `.register()`, `makeVault()`, `TokenRefreshScheduler`, `.constructor()`, `.markExpired()`, `.tick()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (7 nodes): `Metrics`, `.increment()`, `.recordFailed()`, `.recordReceived()`, `.recordSent()`, `.reset()`, `.snapshot()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 10`** (7 nodes): `SessionManager`, `.constructor()`, `.create()`, `.delete()`, `.get()`, `.list()`, `.send()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TranscriptManager` connect `Community 6` to `Community 1`, `Community 4`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `Metrics` connect `Community 9` to `Community 4`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `startServer()` (e.g. with `bootstrap()` and `getConfig()`) actually correct?**
  _`startServer()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._