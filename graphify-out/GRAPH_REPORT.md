# Graph Report - openzigs-social  (2026-05-30)

## Corpus Check
- 283 files · ~116,979 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1065 nodes · 1562 edges · 38 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 74 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]

## God Nodes (most connected - your core abstractions)
1. `CredentialVault` - 25 edges
2. `startServer()` - 18 edges
3. `assertSafeUrl()` - 16 edges
4. `TranscriptManager` - 14 edges
5. `HandoffManager` - 12 edges
6. `TelegramChannel` - 12 edges
7. `SocialBrainRepository` - 12 edges
8. `SetupPage` - 11 edges
9. `ApprovalQueue` - 10 edges
10. `RateLimitBroker` - 9 edges

## Surprising Connections (you probably didn't know these)
- `handleVerify()` --calls--> `verifyTelegram()`  [INFERRED]
  ui/components/setup/telegram-step.tsx → src/server/setup/telegram-verify.ts
- `startServer()` --calls--> `createSocketServer()`  [INFERRED]
  src/server/index.ts → src/server/socket.ts
- `bootstrap()` --calls--> `startServer()`  [INFERRED]
  src/server.ts → src/server/index.ts
- `fetchImpl()` --calls--> `probeOllama()`  [INFERRED]
  src/connectors/meta/oauth.test.ts → src/copilot/providers/ollama.ts
- `registerTwitterConnectors()` --calls--> `isDmEnabledForTier()`  [INFERRED]
  src/connectors/twitter/index.ts → src/connectors/twitter/tiers.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (41): getDb(), openDb(), InsightsRepository, parseMetadata(), toReading(), build(), fakeClient(), passthroughDispatcher() (+33 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (13): DmDispatcher, SocialDmSenderRegistry, AdminAcl, createAclMiddleware(), normalizeChatId(), buildApprovalCallbackData(), buildApprovalKeyboard(), escapeHtml() (+5 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (15): InstagramDmSender, InstagramInboxPoller, IgContainerNotReadyError, InstagramPublisher, appendParams(), MetaGraphClient, MetaGraphError, safeParse() (+7 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (23): build(), fakeDlq(), grantingBroker(), TwitterAnalyticsPoller, utcDay(), TwitterDispatcher, build(), fakeDlq() (+15 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (34): appendQuery(), LinkedInRestClient, safeParse(), toApiError(), buildUrl(), FacebookOAuthExchanger, MetaAppNotConfiguredError, readToken() (+26 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (22): deepMerge(), defaultConfigPath(), envLayer(), getConfig(), isObject(), loadConfig(), readJsonIfPresent(), setPath() (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (16): appliedVersions(), ensureMigrationsTable(), loadMigrations(), migrate(), LinkedInDispatcher, MetaDispatcher, PinterestDispatcher, computeBackoffMs() (+8 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (4): PrivacyController, SessionManager, estimateTokens(), SmartRouter

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (6): decrypt(), deriveKey(), encrypt(), CredentialVault, defaultKeyMaterial(), defaultVaultPath()

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (12): basicAuth(), PinterestAppNotConfiguredError, PinterestOAuthExchanger, readToken(), build(), fakeDlq(), grantedBroker(), appendQuery() (+4 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (10): createConnectionsRouter(), listen(), mount(), createApp(), createCorsMiddleware(), Metrics, zero(), createSetupRouter() (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.1
Nodes (9): CopilotWrapper, AnthropicProvider, CopilotProvider, createProvider(), createOllamaProvider(), pickGemma4Variant(), pickInstalledGemma4(), probeOllama() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.1
Nodes (7): ConnectorRegistry, createOAuthRouter(), isSafeRelativePath(), listen(), mount(), OAuthStateStore, safeEqual()

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (9): WebhookEventStore, WebhookHandlerRegistry, computeSignature(), normalizeSignature(), verifySignature(), createWebhookRouter(), listen(), mount() (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (2): createSocketServer(), TranscriptManager

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (6): parseMetadata(), serializeMetadata(), SocialBrainRepository, toContact(), toMessage(), toThread()

### Community 16 - "Community 16"
Cohesion: 0.18
Nodes (5): TwitterCreditTracker, utcMonth(), createTwitterRouter(), listen(), mount()

### Community 17 - "Community 17"
Cohesion: 0.19
Nodes (2): ApprovalQueue, ApprovalQueueFullError

### Community 18 - "Community 18"
Cohesion: 0.21
Nodes (1): HandoffManager

### Community 19 - "Community 19"
Cohesion: 0.23
Nodes (9): clampStep(), getWizardSnapshot(), loadWizardState(), normalizeWizardState(), postJson(), saveWizardState(), validateProviderKey(), verifyTelegram() (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (5): assertNoDmScopes(), LinkedInAppNotConfiguredError, LinkedInDmScopeError, LinkedInOAuthExchanger, readToken()

### Community 21 - "Community 21"
Cohesion: 0.19
Nodes (1): RateLimitBroker

### Community 22 - "Community 22"
Cohesion: 0.2
Nodes (1): SetupPage

### Community 23 - "Community 23"
Cohesion: 0.22
Nodes (2): RefreshRegistry, TokenRefreshScheduler

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (3): Probe(), useTheme(), ThemeToggle()

### Community 25 - "Community 25"
Cohesion: 0.39
Nodes (6): applyResolvedTheme(), applyTheme(), getStoredTheme(), getSystemTheme(), isTheme(), resolveTheme()

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (1): AppShell

### Community 27 - "Community 27"
Cohesion: 0.32
Nodes (1): MetaScheduler

### Community 28 - "Community 28"
Cohesion: 0.32
Nodes (1): FacebookPages

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (1): DashboardPage

### Community 30 - "Community 30"
Cohesion: 0.48
Nodes (5): addToRemoveQueue(), dispatch(), genId(), reducer(), toast()

### Community 31 - "Community 31"
Cohesion: 0.4
Nodes (3): generateUuid(), getClientId(), createSocket()

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (1): ComposePage

### Community 33 - "Community 33"
Cohesion: 0.4
Nodes (2): TikTokDisplayPoller, utcDay()

### Community 34 - "Community 34"
Cohesion: 0.4
Nodes (2): LinkedInAnalyticsPoller, utcDay()

### Community 35 - "Community 35"
Cohesion: 0.4
Nodes (1): PinterestPublisher

### Community 38 - "Community 38"
Cohesion: 0.5
Nodes (1): ThreadsInsightsPoller

### Community 39 - "Community 39"
Cohesion: 0.5
Nodes (1): LinkedInCommentPoller

## Knowledge Gaps
- **Thin community `Community 14`** (24 nodes): `createSocketServer()`, `readClientId()`, `restoreSession()`, `connectionHandler()`, `flush()`, `makeFakeSocket()`, `waitForEvent()`, `TranscriptManager`, `.append()`, `.assertId()`, `.create()`, `.delete()`, `.enqueue()`, `.ledgerPath()`, `.list()`, `.load()`, `.metaPath()`, `.readMeta()`, `.renameId()`, `.renameTitle()`, `socket.test.ts`, `socket.ts`, `transcript-manager.test.ts`, `transcript-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (14 nodes): `ApprovalQueue`, `.clear()`, `.constructor()`, `.decide()`, `.get()`, `.has()`, `.list()`, `.request()`, `.settle()`, `.size()`, `ApprovalQueueFullError`, `.constructor()`, `approval-queue.test.ts`, `approval-queue.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (14 nodes): `HandoffManager`, `.abortAll()`, `.assertThreadId()`, `.constructor()`, `.emitChange()`, `.isHumanOwned()`, `.list()`, `.owner()`, `.register()`, `.registeredCount()`, `.release()`, `.takeOver()`, `handoff-manager.test.ts`, `handoff-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (13 nodes): `defaultSleep()`, `RateLimitBroker`, `.acquire()`, `.configure()`, `.constructor()`, `.has()`, `.maybeWarn()`, `.remainingQuota()`, `.resetQuota()`, `.tryAcquire()`, `fakeClock()`, `broker.test.ts`, `broker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (12 nodes): `SetupPage`, `.advanceFromWelcome()`, `.completeProviderStep()`, `.constructor()`, `.goto()`, `.providerRadio()`, `.selectProvider()`, `.stepTitle()`, `.stubStatus()`, `.stubTelegramVerify()`, `.stubValidateKey()`, `setup.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (11 nodes): `refresh-scheduler.test.ts`, `refresh-scheduler.ts`, `RefreshRegistry`, `.get()`, `.has()`, `.register()`, `makeVault()`, `TokenRefreshScheduler`, `.constructor()`, `.markExpired()`, `.tick()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (8 nodes): `AppShell`, `.constructor()`, `.goto()`, `.navLink()`, `.openThemeMenu()`, `.selectTheme()`, `.storedTheme()`, `app-shell.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (8 nodes): `MetaScheduler`, `.constructor()`, `.schedule()`, `.start()`, `.stop()`, `.tick()`, `scheduler.test.ts`, `scheduler.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (8 nodes): `FacebookPages`, `.constructor()`, `.createPost()`, `.getInsights()`, `.listComments()`, `.listPages()`, `.reply()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (7 nodes): `DashboardPage`, `.constructor()`, `.dialog()`, `.goto()`, `.kpiCard()`, `.openQuickActions()`, `dashboard.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (6 nodes): `ComposePage`, `.constructor()`, `.goto()`, `.stubConnections()`, `.target()`, `compose.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (6 nodes): `TikTokDisplayPoller`, `.constructor()`, `.pollUserInfo()`, `.pollVideos()`, `.run()`, `utcDay()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (6 nodes): `LinkedInAnalyticsPoller`, `.constructor()`, `.pollFollowers()`, `.pollPostInsights()`, `.run()`, `utcDay()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (5 nodes): `PinterestPublisher`, `.constructor()`, `.createBoard()`, `.createPin()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (4 nodes): `ThreadsInsightsPoller`, `.constructor()`, `.poll()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (4 nodes): `LinkedInCommentPoller`, `.constructor()`, `.poll()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fetchImpl()` connect `Community 4` to `Community 11`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `probeOllama()` connect `Community 11` to `Community 4`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `startServer()` connect `Community 0` to `Community 5`, `Community 10`, `Community 12`, `Community 13`, `Community 14`, `Community 16`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `startServer()` (e.g. with `bootstrap()` and `getConfig()`) actually correct?**
  _`startServer()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `assertSafeUrl()` (e.g. with `.constructor()` and `.constructor()`) actually correct?**
  _`assertSafeUrl()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._