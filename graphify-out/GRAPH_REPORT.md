# Graph Report - openzigs-social  (2026-05-29)

## Corpus Check
- 218 files · ~84,781 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 752 nodes · 1017 edges · 35 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 53 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 35|Community 35]]

## God Nodes (most connected - your core abstractions)
1. `CredentialVault` - 17 edges
2. `TranscriptManager` - 14 edges
3. `startServer()` - 12 edges
4. `HandoffManager` - 12 edges
5. `SocialBrainRepository` - 12 edges
6. `SetupPage` - 11 edges
7. `TelegramChannel` - 11 edges
8. `ApprovalQueue` - 10 edges
9. `RateLimitBroker` - 9 edges
10. `FacebookPages` - 8 edges

## Surprising Connections (you probably didn't know these)
- `handleVerify()` --calls--> `verifyTelegram()`  [INFERRED]
  ui/components/setup/telegram-step.tsx → src/server/setup/telegram-verify.ts
- `migrate()` --calls--> `run()`  [INFERRED]
  src/db/migrator.ts → src/platform/retry/backoff.test.ts
- `bootstrap()` --calls--> `startServer()`  [INFERRED]
  src/server.ts → src/server/index.ts
- `registerMetaConnectors()` --calls--> `startServer()`  [INFERRED]
  src/connectors/meta/index.ts → src/server/index.ts
- `fetchImpl()` --calls--> `validateProviderKey()`  [INFERRED]
  src/connectors/meta/oauth.test.ts → src/server/setup/provider-validator.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (15): InstagramDmSender, IgContainerNotReadyError, appendParams(), MetaGraphClient, MetaGraphError, safeParse(), toFormBody(), toGraphError() (+7 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (27): auditDir(), dbPath(), defaultDataDir(), logsDir(), resolveDataDir(), sessionsDir(), userConfigPath(), vaultPath() (+19 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (12): SocialDmSenderRegistry, AdminAcl, createAclMiddleware(), normalizeChatId(), buildApprovalCallbackData(), buildApprovalKeyboard(), escapeHtml(), renderApprovalMessage() (+4 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (13): CopilotWrapper, fetchImpl(), jsonResponse(), AnthropicProvider, CopilotProvider, createProvider(), createOllamaProvider(), pickGemma4Variant() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (4): PrivacyController, SessionManager, estimateTokens(), SmartRouter

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (6): decrypt(), deriveKey(), encrypt(), CredentialVault, defaultKeyMaterial(), defaultVaultPath()

### Community 6 - "Community 6"
Cohesion: 0.1
Nodes (7): ConnectorRegistry, createOAuthRouter(), isSafeRelativePath(), listen(), mount(), OAuthStateStore, safeEqual()

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (9): WebhookEventStore, WebhookHandlerRegistry, computeSignature(), normalizeSignature(), verifySignature(), createWebhookRouter(), listen(), mount() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (15): buildUrl(), FacebookOAuthExchanger, readToken(), ThreadsOAuthExchanger, buildRequest(), stripTrailingSlash(), validateProviderKey(), assertSafeUrl() (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (8): createConnectionsRouter(), listen(), mount(), createApp(), createCorsMiddleware(), createSetupRouter(), listen(), mount()

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (9): MetaDispatcher, computeBackoffMs(), dispatchWithDlq(), retry(), RetryExhaustedError, fn(), run(), DlqRepository (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (6): parseMetadata(), serializeMetadata(), SocialBrainRepository, toContact(), toMessage(), toThread()

### Community 12 - "Community 12"
Cohesion: 0.19
Nodes (2): ApprovalQueue, ApprovalQueueFullError

### Community 13 - "Community 13"
Cohesion: 0.21
Nodes (1): HandoffManager

### Community 14 - "Community 14"
Cohesion: 0.3
Nodes (1): TranscriptManager

### Community 15 - "Community 15"
Cohesion: 0.23
Nodes (9): clampStep(), getWizardSnapshot(), loadWizardState(), normalizeWizardState(), postJson(), saveWizardState(), validateProviderKey(), verifyTelegram() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.26
Nodes (8): deepMerge(), defaultConfigPath(), envLayer(), getConfig(), isObject(), loadConfig(), readJsonIfPresent(), setPath()

### Community 17 - "Community 17"
Cohesion: 0.19
Nodes (1): RateLimitBroker

### Community 18 - "Community 18"
Cohesion: 0.2
Nodes (1): SetupPage

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (2): RefreshRegistry, TokenRefreshScheduler

### Community 20 - "Community 20"
Cohesion: 0.22
Nodes (1): DmDispatcher

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (3): Probe(), useTheme(), ThemeToggle()

### Community 22 - "Community 22"
Cohesion: 0.28
Nodes (3): InsightsRepository, parseMetadata(), toReading()

### Community 23 - "Community 23"
Cohesion: 0.39
Nodes (6): applyResolvedTheme(), applyTheme(), getStoredTheme(), getSystemTheme(), isTheme(), resolveTheme()

### Community 24 - "Community 24"
Cohesion: 0.29
Nodes (1): AppShell

### Community 25 - "Community 25"
Cohesion: 0.32
Nodes (1): MetaScheduler

### Community 26 - "Community 26"
Cohesion: 0.32
Nodes (1): FacebookPages

### Community 27 - "Community 27"
Cohesion: 0.29
Nodes (1): DashboardPage

### Community 28 - "Community 28"
Cohesion: 0.48
Nodes (5): addToRemoveQueue(), dispatch(), genId(), reducer(), toast()

### Community 29 - "Community 29"
Cohesion: 0.43
Nodes (1): InstagramPublisher

### Community 30 - "Community 30"
Cohesion: 0.4
Nodes (3): generateUuid(), getClientId(), createSocket()

### Community 31 - "Community 31"
Cohesion: 0.33
Nodes (1): ComposePage

### Community 32 - "Community 32"
Cohesion: 0.4
Nodes (1): InstagramInboxPoller

### Community 33 - "Community 33"
Cohesion: 0.5
Nodes (1): ThreadsPublisher

### Community 35 - "Community 35"
Cohesion: 0.67
Nodes (2): fetchImpl(), jsonResponse()

## Knowledge Gaps
- **Thin community `Community 12`** (14 nodes): `ApprovalQueue`, `.clear()`, `.constructor()`, `.decide()`, `.get()`, `.has()`, `.list()`, `.request()`, `.settle()`, `.size()`, `ApprovalQueueFullError`, `.constructor()`, `approval-queue.test.ts`, `approval-queue.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (14 nodes): `HandoffManager`, `.abortAll()`, `.assertThreadId()`, `.constructor()`, `.emitChange()`, `.isHumanOwned()`, `.list()`, `.owner()`, `.register()`, `.registeredCount()`, `.release()`, `.takeOver()`, `handoff-manager.test.ts`, `handoff-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (14 nodes): `TranscriptManager`, `.append()`, `.assertId()`, `.constructor()`, `.create()`, `.delete()`, `.enqueue()`, `.ledgerPath()`, `.list()`, `.load()`, `.metaPath()`, `.readMeta()`, `.renameId()`, `.renameTitle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (13 nodes): `defaultSleep()`, `RateLimitBroker`, `.acquire()`, `.configure()`, `.constructor()`, `.has()`, `.maybeWarn()`, `.remainingQuota()`, `.resetQuota()`, `.tryAcquire()`, `fakeClock()`, `broker.test.ts`, `broker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (12 nodes): `SetupPage`, `.advanceFromWelcome()`, `.completeProviderStep()`, `.constructor()`, `.goto()`, `.providerRadio()`, `.selectProvider()`, `.stepTitle()`, `.stubStatus()`, `.stubTelegramVerify()`, `.stubValidateKey()`, `setup.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (11 nodes): `refresh-scheduler.test.ts`, `refresh-scheduler.ts`, `RefreshRegistry`, `.get()`, `.has()`, `.register()`, `makeVault()`, `TokenRefreshScheduler`, `.constructor()`, `.markExpired()`, `.tick()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (10 nodes): `approvalGatedReply()`, `DmDispatcher`, `.constructor()`, `.dispatch()`, `.use()`, `humanOwnedGuard()`, `message()`, `index.ts`, `dispatcher.test.ts`, `dispatcher.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (8 nodes): `AppShell`, `.constructor()`, `.goto()`, `.navLink()`, `.openThemeMenu()`, `.selectTheme()`, `.storedTheme()`, `app-shell.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (8 nodes): `MetaScheduler`, `.constructor()`, `.schedule()`, `.start()`, `.stop()`, `.tick()`, `scheduler.test.ts`, `scheduler.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (8 nodes): `FacebookPages`, `.constructor()`, `.createPost()`, `.getInsights()`, `.listComments()`, `.listPages()`, `.reply()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (7 nodes): `DashboardPage`, `.constructor()`, `.dialog()`, `.goto()`, `.kpiCard()`, `.openQuickActions()`, `dashboard.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (7 nodes): `InstagramPublisher`, `.constructor()`, `.createCarousel()`, `.createSingle()`, `.publish()`, `.run()`, `.waitForContainer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (6 nodes): `ComposePage`, `.constructor()`, `.goto()`, `.stubConnections()`, `.target()`, `compose.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (6 nodes): `InstagramInboxPoller`, `.constructor()`, `.persistMessage()`, `.poll()`, `.pollComments()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (5 nodes): `ThreadsPublisher`, `.constructor()`, `.publish()`, `.run()`, `.waitForContainer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (4 nodes): `fetchImpl()`, `jsonResponse()`, `make()`, `graph-client.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fetchImpl()` connect `Community 3` to `Community 8`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `startServer()` (e.g. with `bootstrap()` and `getConfig()`) actually correct?**
  _`startServer()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._