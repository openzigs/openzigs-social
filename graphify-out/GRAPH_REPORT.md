# Graph Report - openzigs-social  (2026-05-29)

## Corpus Check
- 38 files · ~11,484 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 114 nodes · 145 edges · 7 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]

## God Nodes (most connected - your core abstractions)
1. `CredentialVault` - 13 edges
2. `SessionManager` - 7 edges
3. `PrivacyController` - 6 edges
4. `RefreshRegistry` - 4 edges
5. `TokenRefreshScheduler` - 4 edges
6. `SmartRouter` - 4 edges
7. `CopilotProvider` - 4 edges
8. `CopilotWrapper` - 3 edges
9. `createOllamaProvider()` - 3 edges
10. `AnthropicProvider` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (8): CopilotWrapper, AnthropicProvider, createProvider(), createOllamaProvider(), pickGemma4Variant(), pickInstalledGemma4(), probeOllama(), OpenAICompatibleProvider

### Community 2 - "Community 2"
Cohesion: 0.18
Nodes (5): decrypt(), deriveKey(), encrypt(), defaultKeyMaterial(), defaultVaultPath()

### Community 3 - "Community 3"
Cohesion: 0.2
Nodes (2): RefreshRegistry, TokenRefreshScheduler

### Community 4 - "Community 4"
Cohesion: 0.35
Nodes (1): CredentialVault

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (3): PrivacyController, estimateTokens(), SmartRouter

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (1): SessionManager

### Community 7 - "Community 7"
Cohesion: 0.67
Nodes (1): CopilotProvider

## Knowledge Gaps
- **Thin community `Community 3`** (12 nodes): `index.ts`, `refresh-scheduler.test.ts`, `refresh-scheduler.ts`, `RefreshRegistry`, `.get()`, `.has()`, `.register()`, `makeVault()`, `TokenRefreshScheduler`, `.constructor()`, `.markExpired()`, `.tick()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 4`** (12 nodes): `CredentialVault`, `.deleteProvider()`, `.getOAuth()`, `.getProvider()`, `.listOAuth()`, `.load()`, `.path()`, `.persist()`, `.setOAuth()`, `.setProvider()`, `.toString()`, `.updateOAuth()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 6`** (7 nodes): `SessionManager`, `.constructor()`, `.create()`, `.delete()`, `.get()`, `.list()`, `.send()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 7`** (4 nodes): `CopilotProvider`, `.chat()`, `.constructor()`, `.ensureClient()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SessionManager` connect `Community 6` to `Community 1`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `CopilotWrapper` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `PrivacyController` connect `Community 5` to `Community 1`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._