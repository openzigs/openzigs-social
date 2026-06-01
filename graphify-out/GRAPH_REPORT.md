# Graph Report - openzigs-social  (2026-06-01)

## Corpus Check
- 365 files · ~162,385 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1420 nodes · 2054 edges · 46 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 98 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]

## God Nodes (most connected - your core abstractions)
1. `CredentialVault` - 25 edges
2. `startServer()` - 22 edges
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
Nodes (37): InsightsRepository, parseMetadata(), toReading(), InstagramDmSender, IgContainerNotReadyError, LinkedInAnalyticsPoller, build(), fakeClient() (+29 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (38): isDmSupported(), limitsFor(), validateReply(), buildMatchExpression(), InboxRepository, messageKind(), parseMetadata(), toContact() (+30 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (27): build(), fakeDlq(), grantingBroker(), TwitterAnalyticsPoller, utcDay(), TwitterCreditTracker, utcMonth(), TwitterDispatcher (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (15): DmDispatcher, SocialDmSenderRegistry, rule(), AdminAcl, createAclMiddleware(), normalizeChatId(), buildApprovalCallbackData(), buildApprovalKeyboard() (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (35): assertNoDmScopes(), LinkedInAppNotConfiguredError, LinkedInDmScopeError, LinkedInOAuthExchanger, readToken(), appendQuery(), LinkedInApiError, LinkedInRestClient (+27 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (33): deepMerge(), defaultConfigPath(), envLayer(), getConfig(), isObject(), loadConfig(), readJsonIfPresent(), setPath() (+25 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (13): PrivacyController, SessionManager, estimateTokens(), SmartRouter, CopilotWrapper, AnthropicProvider, CopilotProvider, createProvider() (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (20): createAutoReplyRouter(), parseRulebook(), toStringList(), buildVocabulary(), clamp01(), findBannedHits(), scoreVoice(), tokenize() (+12 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (19): appliedVersions(), ensureMigrationsTable(), loadMigrations(), migrate(), LinkedInDispatcher, MetaDispatcher, errorMessage(), OutboxPoller (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (9): vaultPath(), decrypt(), deriveKey(), encrypt(), RefreshRegistry, TokenRefreshScheduler, CredentialVault, defaultKeyMaterial() (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (11): authorUrn(), LinkedInPublisher, build(), fakeDlq(), grantedBroker(), NoPublisherError, OutboxDispatch, buildOutboxDispatch() (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (19): useSocket(), onEventDrop(), preview(), submit(), toEpoch(), InboxView(), PlatformBadge(), badgeMetaFor() (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (7): canTransition(), IllegalTransitionError, OutboxNotFoundError, OutboxRepository, parseMedia(), toPost(), createOutboxRouter()

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (12): basicAuth(), PinterestAppNotConfiguredError, PinterestOAuthExchanger, readToken(), build(), fakeDlq(), grantedBroker(), appendQuery() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (12): createConnectionsRouter(), listen(), mount(), fetchImpl(), jsonResponse(), createApp(), createCorsMiddleware(), createSetupRouter() (+4 more)

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
Cohesion: 0.21
Nodes (7): fetchAuditLog(), fetchAutoReplyConfig(), fetchRulebook(), readError(), resolveAudit(), saveRulebook(), scoreDraft()

### Community 19 - "Community 19"
Cohesion: 0.2
Nodes (4): cloneRulebook(), normalizeList(), normalizeRulebook(), SettingsPage

### Community 20 - "Community 20"
Cohesion: 0.19
Nodes (2): ApprovalQueue, ApprovalQueueFullError

### Community 21 - "Community 21"
Cohesion: 0.21
Nodes (1): HandoffManager

### Community 22 - "Community 22"
Cohesion: 0.23
Nodes (9): clampStep(), getWizardSnapshot(), loadWizardState(), normalizeWizardState(), postJson(), saveWizardState(), validateProviderKey(), verifyTelegram() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (1): TranscriptManager

### Community 24 - "Community 24"
Cohesion: 0.19
Nodes (1): RateLimitBroker

### Community 25 - "Community 25"
Cohesion: 0.2
Nodes (1): SetupPage

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (1): OutboxPage

### Community 27 - "Community 27"
Cohesion: 0.22
Nodes (3): Probe(), useTheme(), ThemeToggle()

### Community 28 - "Community 28"
Cohesion: 0.39
Nodes (6): applyResolvedTheme(), applyTheme(), getStoredTheme(), getSystemTheme(), isTheme(), resolveTheme()

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (1): AppShell

### Community 30 - "Community 30"
Cohesion: 0.32
Nodes (1): MetaScheduler

### Community 31 - "Community 31"
Cohesion: 0.32
Nodes (1): FacebookPages

### Community 32 - "Community 32"
Cohesion: 0.29
Nodes (1): DashboardPage

### Community 33 - "Community 33"
Cohesion: 0.43
Nodes (1): InstagramPublisher

### Community 34 - "Community 34"
Cohesion: 0.4
Nodes (3): generateUuid(), getClientId(), createSocket()

### Community 35 - "Community 35"
Cohesion: 0.33
Nodes (1): ComposePage

### Community 36 - "Community 36"
Cohesion: 0.33
Nodes (1): InboxPage

### Community 37 - "Community 37"
Cohesion: 0.4
Nodes (2): TikTokDisplayPoller, utcDay()

### Community 38 - "Community 38"
Cohesion: 0.4
Nodes (1): InstagramInboxPoller

### Community 41 - "Community 41"
Cohesion: 0.5
Nodes (1): ThreadsPublisher

### Community 42 - "Community 42"
Cohesion: 0.4
Nodes (1): PinterestPublisher

### Community 44 - "Community 44"
Cohesion: 0.83
Nodes (3): charactersRemaining(), postLimitsFor(), validatePost()

### Community 48 - "Community 48"
Cohesion: 0.67
Nodes (2): fetchImpl(), jsonResponse()

### Community 49 - "Community 49"
Cohesion: 0.5
Nodes (1): ThreadsInsightsPoller

### Community 50 - "Community 50"
Cohesion: 0.5
Nodes (1): ThreadsReplyPoller

### Community 51 - "Community 51"
Cohesion: 0.5
Nodes (1): LinkedInCommentPoller

## Knowledge Gaps
- **Thin community `Community 20`** (14 nodes): `ApprovalQueue`, `.clear()`, `.constructor()`, `.decide()`, `.get()`, `.has()`, `.list()`, `.request()`, `.settle()`, `.size()`, `ApprovalQueueFullError`, `.constructor()`, `approval-queue.test.ts`, `approval-queue.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (14 nodes): `HandoffManager`, `.abortAll()`, `.assertThreadId()`, `.constructor()`, `.emitChange()`, `.isHumanOwned()`, `.list()`, `.owner()`, `.register()`, `.registeredCount()`, `.release()`, `.takeOver()`, `handoff-manager.test.ts`, `handoff-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (13 nodes): `TranscriptManager`, `.append()`, `.assertId()`, `.create()`, `.delete()`, `.enqueue()`, `.ledgerPath()`, `.list()`, `.load()`, `.metaPath()`, `.readMeta()`, `.renameId()`, `.renameTitle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (13 nodes): `defaultSleep()`, `RateLimitBroker`, `.acquire()`, `.configure()`, `.constructor()`, `.has()`, `.maybeWarn()`, `.remainingQuota()`, `.resetQuota()`, `.tryAcquire()`, `fakeClock()`, `broker.test.ts`, `broker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (12 nodes): `SetupPage`, `.advanceFromWelcome()`, `.completeProviderStep()`, `.constructor()`, `.goto()`, `.providerRadio()`, `.selectProvider()`, `.stepTitle()`, `.stubStatus()`, `.stubTelegramVerify()`, `.stubValidateKey()`, `setup.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (9 nodes): `OutboxPage`, `.constructor()`, `.dlqHeading()`, `.failedHeading()`, `.goto()`, `.retryButton()`, `.stub()`, `.stubRetry()`, `outbox.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (8 nodes): `AppShell`, `.constructor()`, `.goto()`, `.navLink()`, `.openThemeMenu()`, `.selectTheme()`, `.storedTheme()`, `app-shell.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (8 nodes): `MetaScheduler`, `.constructor()`, `.schedule()`, `.start()`, `.stop()`, `.tick()`, `scheduler.test.ts`, `scheduler.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (8 nodes): `FacebookPages`, `.constructor()`, `.createPost()`, `.getInsights()`, `.listComments()`, `.listPages()`, `.reply()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (7 nodes): `DashboardPage`, `.constructor()`, `.dialog()`, `.goto()`, `.kpiCard()`, `.openQuickActions()`, `dashboard.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (7 nodes): `InstagramPublisher`, `.constructor()`, `.createCarousel()`, `.createSingle()`, `.publish()`, `.run()`, `.waitForContainer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (6 nodes): `ComposePage`, `.constructor()`, `.goto()`, `.stubConnections()`, `.target()`, `compose.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (6 nodes): `InboxPage`, `.constructor()`, `.conversationList()`, `.goto()`, `.listOrEmptyState()`, `inbox.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (6 nodes): `TikTokDisplayPoller`, `.constructor()`, `.pollUserInfo()`, `.pollVideos()`, `.run()`, `utcDay()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (6 nodes): `InstagramInboxPoller`, `.constructor()`, `.persistMessage()`, `.poll()`, `.pollComments()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (5 nodes): `ThreadsPublisher`, `.constructor()`, `.publish()`, `.run()`, `.waitForContainer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (5 nodes): `PinterestPublisher`, `.constructor()`, `.createBoard()`, `.createPin()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (4 nodes): `fetchImpl()`, `jsonResponse()`, `make()`, `graph-client.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (4 nodes): `ThreadsInsightsPoller`, `.constructor()`, `.poll()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (4 nodes): `ThreadsReplyPoller`, `.constructor()`, `.poll()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (4 nodes): `LinkedInCommentPoller`, `.constructor()`, `.poll()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fetchImpl()` connect `Community 14` to `Community 4`, `Community 6`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `probeOllama()` connect `Community 6` to `Community 14`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Are the 20 inferred relationships involving `startServer()` (e.g. with `bootstrap()` and `getConfig()`) actually correct?**
  _`startServer()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `assertSafeUrl()` (e.g. with `.constructor()` and `.constructor()`) actually correct?**
  _`assertSafeUrl()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._