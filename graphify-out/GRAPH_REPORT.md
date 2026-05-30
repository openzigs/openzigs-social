# Graph Report - openzigs-social  (2026-05-30)

## Corpus Check
- 341 files · ~148,971 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1316 nodes · 1907 edges · 48 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 95 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]

## God Nodes (most connected - your core abstractions)
1. `CredentialVault` - 25 edges
2. `startServer()` - 21 edges
3. `assertSafeUrl()` - 16 edges
4. `OutboxRepository` - 16 edges
5. `TranscriptManager` - 14 edges
6. `HandoffManager` - 12 edges
7. `TelegramChannel` - 12 edges
8. `SocialBrainRepository` - 12 edges
9. `SetupPage` - 11 edges
10. `ApprovalQueue` - 10 edges

## Surprising Connections (you probably didn't know these)
- `dmUnsupportedNotice()` --calls--> `limitsFor()`  [INFERRED]
  ui/components/inbox/thread-detail.tsx → src/inbox/platform-limits.ts
- `detail()` --calls--> `limitsFor()`  [INFERRED]
  ui/components/inbox/thread-detail.test.tsx → src/inbox/platform-limits.ts
- `handleVerify()` --calls--> `verifyTelegram()`  [INFERRED]
  ui/components/setup/telegram-step.tsx → src/server/setup/telegram-verify.ts
- `preview()` --calls--> `postLimitsFor()`  [INFERRED]
  ui/components/calendar/calendar-view.tsx → src/outbox/post-limits.ts
- `startServer()` --calls--> `createInboxRouter()`  [INFERRED]
  src/server/index.ts → src/server/inbox/router.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (48): getDb(), openDb(), InsightsRepository, parseMetadata(), toReading(), build(), fakeClient(), passthroughDispatcher() (+40 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (18): InstagramDmSender, InstagramInboxPoller, IgContainerNotReadyError, InstagramPublisher, appendParams(), MetaGraphClient, MetaGraphError, safeParse() (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (13): SocialDmSenderRegistry, AdminAcl, createAclMiddleware(), normalizeChatId(), buildApprovalCallbackData(), buildApprovalKeyboard(), escapeHtml(), renderApprovalMessage() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (33): buildUrl(), FacebookOAuthExchanger, MetaAppNotConfiguredError, readToken(), fetchImpl(), jsonResponse(), ThreadsOAuthExchanger, buildRequest() (+25 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (13): PrivacyController, SessionManager, estimateTokens(), SmartRouter, CopilotWrapper, AnthropicProvider, CopilotProvider, createProvider() (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (19): isDmSupported(), limitsFor(), validateReply(), buildMatchExpression(), InboxRepository, messageKind(), parseMetadata(), toContact() (+11 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (8): decrypt(), deriveKey(), encrypt(), RefreshRegistry, TokenRefreshScheduler, CredentialVault, defaultKeyMaterial(), defaultVaultPath()

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (13): createConnectionsRouter(), listen(), mount(), createApp(), createCorsMiddleware(), Metrics, zero(), createSocketServer() (+5 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (19): appliedVersions(), ensureMigrationsTable(), loadMigrations(), migrate(), LinkedInDispatcher, MetaDispatcher, errorMessage(), OutboxPoller (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (21): DmDispatcher, asNumber(), asString(), buildFacts(), evaluateComparison(), evaluateCondition(), evaluateRules(), higherPriority() (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (22): deepMerge(), defaultConfigPath(), envLayer(), getConfig(), isObject(), loadConfig(), readJsonIfPresent(), setPath() (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (13): assertNoDmScopes(), LinkedInAppNotConfiguredError, LinkedInDmScopeError, LinkedInOAuthExchanger, readToken(), build(), fakeDlq(), grantedBroker() (+5 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (19): useSocket(), onEventDrop(), preview(), submit(), toEpoch(), InboxView(), PlatformBadge(), badgeMetaFor() (+11 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (7): canTransition(), IllegalTransitionError, OutboxNotFoundError, OutboxRepository, parseMedia(), toPost(), createOutboxRouter()

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (12): basicAuth(), PinterestAppNotConfiguredError, PinterestOAuthExchanger, readToken(), build(), fakeDlq(), grantedBroker(), appendQuery() (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.1
Nodes (7): ConnectorRegistry, createOAuthRouter(), isSafeRelativePath(), listen(), mount(), OAuthStateStore, safeEqual()

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (9): WebhookEventStore, WebhookHandlerRegistry, computeSignature(), normalizeSignature(), verifySignature(), createWebhookRouter(), listen(), mount() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.22
Nodes (13): createPost(), deletePost(), fetchOutbox(), fetchOutboxDlq(), readError(), reschedulePost(), retryPost(), schedulePost() (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.19
Nodes (2): ApprovalQueue, ApprovalQueueFullError

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (5): TwitterCreditTracker, utcMonth(), createTwitterRouter(), listen(), mount()

### Community 20 - "Community 20"
Cohesion: 0.21
Nodes (1): HandoffManager

### Community 21 - "Community 21"
Cohesion: 0.3
Nodes (1): TranscriptManager

### Community 22 - "Community 22"
Cohesion: 0.23
Nodes (9): clampStep(), getWizardSnapshot(), loadWizardState(), normalizeWizardState(), postJson(), saveWizardState(), validateProviderKey(), verifyTelegram() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.19
Nodes (1): RateLimitBroker

### Community 24 - "Community 24"
Cohesion: 0.2
Nodes (1): SetupPage

### Community 25 - "Community 25"
Cohesion: 0.22
Nodes (1): OutboxPage

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (3): Probe(), useTheme(), ThemeToggle()

### Community 27 - "Community 27"
Cohesion: 0.39
Nodes (6): applyResolvedTheme(), applyTheme(), getStoredTheme(), getSystemTheme(), isTheme(), resolveTheme()

### Community 28 - "Community 28"
Cohesion: 0.29
Nodes (1): AppShell

### Community 29 - "Community 29"
Cohesion: 0.32
Nodes (1): MetaScheduler

### Community 30 - "Community 30"
Cohesion: 0.32
Nodes (1): FacebookPages

### Community 31 - "Community 31"
Cohesion: 0.29
Nodes (1): DashboardPage

### Community 32 - "Community 32"
Cohesion: 0.4
Nodes (3): generateUuid(), getClientId(), createSocket()

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (1): ComposePage

### Community 34 - "Community 34"
Cohesion: 0.33
Nodes (1): InboxPage

### Community 35 - "Community 35"
Cohesion: 0.4
Nodes (2): TikTokDisplayPoller, utcDay()

### Community 36 - "Community 36"
Cohesion: 0.6
Nodes (1): TwitterQuotaGuard

### Community 37 - "Community 37"
Cohesion: 0.4
Nodes (2): TwitterAnalyticsPoller, utcDay()

### Community 38 - "Community 38"
Cohesion: 0.47
Nodes (1): TwitterPublisher

### Community 39 - "Community 39"
Cohesion: 0.4
Nodes (2): LinkedInAnalyticsPoller, utcDay()

### Community 40 - "Community 40"
Cohesion: 0.4
Nodes (1): OutboxDispatch

### Community 42 - "Community 42"
Cohesion: 0.4
Nodes (1): PinterestPublisher

### Community 43 - "Community 43"
Cohesion: 0.4
Nodes (1): OutboxScheduler

### Community 45 - "Community 45"
Cohesion: 0.83
Nodes (3): charactersRemaining(), postLimitsFor(), validatePost()

### Community 49 - "Community 49"
Cohesion: 0.5
Nodes (1): ThreadsInsightsPoller

### Community 50 - "Community 50"
Cohesion: 0.5
Nodes (1): TwitterDmSender

### Community 51 - "Community 51"
Cohesion: 0.5
Nodes (1): TwitterDmPoller

### Community 52 - "Community 52"
Cohesion: 0.5
Nodes (1): LinkedInCommentPoller

## Knowledge Gaps
- **Thin community `Community 18`** (14 nodes): `ApprovalQueue`, `.clear()`, `.constructor()`, `.decide()`, `.get()`, `.has()`, `.list()`, `.request()`, `.settle()`, `.size()`, `ApprovalQueueFullError`, `.constructor()`, `approval-queue.test.ts`, `approval-queue.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (14 nodes): `HandoffManager`, `.abortAll()`, `.assertThreadId()`, `.constructor()`, `.emitChange()`, `.isHumanOwned()`, `.list()`, `.owner()`, `.register()`, `.registeredCount()`, `.release()`, `.takeOver()`, `handoff-manager.test.ts`, `handoff-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (14 nodes): `TranscriptManager`, `.append()`, `.assertId()`, `.constructor()`, `.create()`, `.delete()`, `.enqueue()`, `.ledgerPath()`, `.list()`, `.load()`, `.metaPath()`, `.readMeta()`, `.renameId()`, `.renameTitle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (13 nodes): `defaultSleep()`, `RateLimitBroker`, `.acquire()`, `.configure()`, `.constructor()`, `.has()`, `.maybeWarn()`, `.remainingQuota()`, `.resetQuota()`, `.tryAcquire()`, `fakeClock()`, `broker.test.ts`, `broker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (12 nodes): `SetupPage`, `.advanceFromWelcome()`, `.completeProviderStep()`, `.constructor()`, `.goto()`, `.providerRadio()`, `.selectProvider()`, `.stepTitle()`, `.stubStatus()`, `.stubTelegramVerify()`, `.stubValidateKey()`, `setup.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (9 nodes): `OutboxPage`, `.constructor()`, `.dlqHeading()`, `.failedHeading()`, `.goto()`, `.retryButton()`, `.stub()`, `.stubRetry()`, `outbox.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (8 nodes): `AppShell`, `.constructor()`, `.goto()`, `.navLink()`, `.openThemeMenu()`, `.selectTheme()`, `.storedTheme()`, `app-shell.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (8 nodes): `MetaScheduler`, `.constructor()`, `.schedule()`, `.start()`, `.stop()`, `.tick()`, `scheduler.test.ts`, `scheduler.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (8 nodes): `FacebookPages`, `.constructor()`, `.createPost()`, `.getInsights()`, `.listComments()`, `.listPages()`, `.reply()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (7 nodes): `DashboardPage`, `.constructor()`, `.dialog()`, `.goto()`, `.kpiCard()`, `.openQuickActions()`, `dashboard.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (6 nodes): `ComposePage`, `.constructor()`, `.goto()`, `.stubConnections()`, `.target()`, `compose.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (6 nodes): `InboxPage`, `.constructor()`, `.conversationList()`, `.goto()`, `.listOrEmptyState()`, `inbox.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (6 nodes): `TikTokDisplayPoller`, `.constructor()`, `.pollUserInfo()`, `.pollVideos()`, `.run()`, `utcDay()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (6 nodes): `TwitterQuotaGuard`, `.constructor()`, `.ensureWithinQuota()`, `.fire()`, `.recordWrite()`, `.status()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (6 nodes): `TwitterAnalyticsPoller`, `.constructor()`, `.pollFollowers()`, `.pollTweetMetrics()`, `.run()`, `utcDay()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (6 nodes): `TwitterPublisher`, `.constructor()`, `.createTweet()`, `.publish()`, `.reply()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (6 nodes): `LinkedInAnalyticsPoller`, `.constructor()`, `.pollFollowers()`, `.pollPostInsights()`, `.run()`, `utcDay()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (6 nodes): `OutboxDispatch`, `.get()`, `.has()`, `.platforms()`, `.publish()`, `.register()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (5 nodes): `PinterestPublisher`, `.constructor()`, `.createBoard()`, `.createPin()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (5 nodes): `OutboxScheduler`, `.constructor()`, `.runTick()`, `.start()`, `.stop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (4 nodes): `ThreadsInsightsPoller`, `.constructor()`, `.poll()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (4 nodes): `TwitterDmSender`, `.constructor()`, `.sendDm()`, `.supports()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (4 nodes): `TwitterDmPoller`, `.constructor()`, `.poll()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (4 nodes): `LinkedInCommentPoller`, `.constructor()`, `.poll()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fetchImpl()` connect `Community 3` to `Community 4`, `Community 7`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `probeOllama()` connect `Community 4` to `Community 3`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `startServer()` (e.g. with `bootstrap()` and `getConfig()`) actually correct?**
  _`startServer()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `assertSafeUrl()` (e.g. with `.constructor()` and `.constructor()`) actually correct?**
  _`assertSafeUrl()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._