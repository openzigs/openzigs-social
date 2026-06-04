# Graph Report - openzigs-social  (2026-06-04)

## Corpus Check
- 413 files · ~191,097 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1659 nodes · 2405 edges · 46 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 122 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]

## God Nodes (most connected - your core abstractions)
1. `CredentialVault` - 25 edges
2. `startServer()` - 25 edges
3. `CrmRepository` - 18 edges
4. `assertSafeUrl()` - 16 edges
5. `OutboxRepository` - 16 edges
6. `TranscriptManager` - 14 edges
7. `HandoffManager` - 12 edges
8. `TelegramChannel` - 12 edges
9. `SocialBrainRepository` - 12 edges
10. `SetupPage` - 11 edges

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
Cohesion: 0.03
Nodes (32): createMailer(), isConfigured(), createConnectionsRouter(), listen(), mount(), createContactsRouter(), parseId(), parseMergeRequest() (+24 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (25): InstagramDmSender, InstagramInboxPoller, IgContainerNotReadyError, appendParams(), MetaGraphClient, MetaGraphError, safeParse(), fetchImpl() (+17 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (34): PinterestAnalyticsPoller, utcDay(), PinterestDispatcher, callbackUrl(), registerPinterestConnectors(), basicAuth(), PinterestAppNotConfiguredError, PinterestOAuthExchanger (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (37): isDmSupported(), limitsFor(), validateReply(), buildMatchExpression(), InboxRepository, messageKind(), parseMetadata(), toContact() (+29 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (27): build(), fakeDlq(), grantingBroker(), TwitterAnalyticsPoller, utcDay(), TwitterCreditTracker, utcMonth(), TwitterDispatcher (+19 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (15): DmDispatcher, SocialDmSenderRegistry, rule(), AdminAcl, createAclMiddleware(), normalizeChatId(), buildApprovalCallbackData(), buildApprovalKeyboard() (+7 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (29): aggregatePostMetrics(), followersByPlatform(), parseDayKeyMs(), rollupEngagement(), dayKey(), insight(), utcDayKey(), withinWindow() (+21 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (24): LinkedInAnalyticsPoller, build(), fakeClient(), passthroughDispatcher(), utcDay(), LinkedInCommentPoller, LinkedInDispatcher, callbackUrl() (+16 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (18): MetaDispatcher, errorMessage(), OutboxPoller, canTransition(), IllegalTransitionError, OutboxNotFoundError, OutboxRepository, parseMedia() (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.04
Nodes (21): InsightsRepository, parseMetadata(), toReading(), TikTokDispatcher, build(), fakeClient(), passthroughDispatcher(), TikTokDisplayPoller (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.04
Nodes (13): PrivacyController, SessionManager, estimateTokens(), SmartRouter, CopilotWrapper, AnthropicProvider, CopilotProvider, createProvider() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (20): createAutoReplyRouter(), parseRulebook(), toStringList(), buildVocabulary(), clamp01(), findBannedHits(), scoreVoice(), tokenize() (+12 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (28): deepMerge(), defaultConfigPath(), envLayer(), getConfig(), isObject(), loadConfig(), readJsonIfPresent(), setPath() (+20 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (24): useSocket(), onEventDrop(), preview(), submit(), toEpoch(), ContactsView(), InboxView(), PlatformBadge() (+16 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (8): decrypt(), deriveKey(), encrypt(), RefreshRegistry, TokenRefreshScheduler, CredentialVault, defaultKeyMaterial(), defaultVaultPath()

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (17): collectStrings(), discoverEmail(), discoverFollowerCount(), extractEmails(), normalizeEmail(), bucketFor(), clamp01(), scoreLead() (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.1
Nodes (7): ConnectorRegistry, createOAuthRouter(), isSafeRelativePath(), listen(), mount(), OAuthStateStore, safeEqual()

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (9): WebhookEventStore, WebhookHandlerRegistry, computeSignature(), normalizeSignature(), verifySignature(), createWebhookRouter(), listen(), mount() (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (13): createPost(), deletePost(), fetchOutbox(), fetchOutboxDlq(), readError(), reschedulePost(), retryPost(), schedulePost() (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.15
Nodes (5): clone(), ContactsPage, escapeRegExp(), mergeDetails(), sortTimeline()

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (11): fetchEngagementSeries(), fetchHeatmap(), fetchSummary(), fetchTopPosts(), readError(), useAnalyticsLiveRefresh(), useAnalyticsSummary(), useEngagementSeries() (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.21
Nodes (7): fetchAuditLog(), fetchAutoReplyConfig(), fetchRulebook(), readError(), resolveAudit(), saveRulebook(), scoreDraft()

### Community 22 - "Community 22"
Cohesion: 0.2
Nodes (4): cloneRulebook(), normalizeList(), normalizeRulebook(), SettingsPage

### Community 23 - "Community 23"
Cohesion: 0.14
Nodes (1): AnalyticsPage

### Community 24 - "Community 24"
Cohesion: 0.19
Nodes (2): ApprovalQueue, ApprovalQueueFullError

### Community 25 - "Community 25"
Cohesion: 0.21
Nodes (1): HandoffManager

### Community 26 - "Community 26"
Cohesion: 0.23
Nodes (9): clampStep(), getWizardSnapshot(), loadWizardState(), normalizeWizardState(), postJson(), saveWizardState(), validateProviderKey(), verifyTelegram() (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.33
Nodes (1): TranscriptManager

### Community 28 - "Community 28"
Cohesion: 0.19
Nodes (1): RateLimitBroker

### Community 29 - "Community 29"
Cohesion: 0.2
Nodes (1): SetupPage

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (1): OutboxPage

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (3): Probe(), useTheme(), ThemeToggle()

### Community 32 - "Community 32"
Cohesion: 0.39
Nodes (6): applyResolvedTheme(), applyTheme(), getStoredTheme(), getSystemTheme(), isTheme(), resolveTheme()

### Community 33 - "Community 33"
Cohesion: 0.29
Nodes (1): AppShell

### Community 34 - "Community 34"
Cohesion: 0.32
Nodes (1): MetaScheduler

### Community 35 - "Community 35"
Cohesion: 0.32
Nodes (1): FacebookPages

### Community 36 - "Community 36"
Cohesion: 0.52
Nodes (6): analyticsFixtures(), heatmap(), matrix(), series(), summary(), topPosts()

### Community 37 - "Community 37"
Cohesion: 0.29
Nodes (1): DashboardPage

### Community 38 - "Community 38"
Cohesion: 0.43
Nodes (1): InstagramPublisher

### Community 40 - "Community 40"
Cohesion: 0.4
Nodes (3): generateUuid(), getClientId(), createSocket()

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (1): ComposePage

### Community 42 - "Community 42"
Cohesion: 0.33
Nodes (1): InboxPage

### Community 43 - "Community 43"
Cohesion: 0.4
Nodes (1): OutboxDispatch

### Community 45 - "Community 45"
Cohesion: 0.8
Nodes (4): baseContact(), buildState(), detailContact(), mergeSuggestion()

### Community 48 - "Community 48"
Cohesion: 0.6
Nodes (3): normalise(), toList(), validateRulebook()

### Community 49 - "Community 49"
Cohesion: 0.83
Nodes (3): charactersRemaining(), postLimitsFor(), validatePost()

## Knowledge Gaps
- **Thin community `Community 23`** (14 nodes): `AnalyticsPage`, `.constructor()`, `.goto()`, `.metricValue()`, `.platformButton()`, `.stubDashboard()`, `.topPostHeading()`, `.topPostItem()`, `.windowButton()`, `key()`, `parsePlatform()`, `parseWindow()`, `readRecord()`, `analytics.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (14 nodes): `ApprovalQueue`, `.clear()`, `.constructor()`, `.decide()`, `.get()`, `.has()`, `.list()`, `.request()`, `.settle()`, `.size()`, `ApprovalQueueFullError`, `.constructor()`, `approval-queue.test.ts`, `approval-queue.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (14 nodes): `HandoffManager`, `.abortAll()`, `.assertThreadId()`, `.constructor()`, `.emitChange()`, `.isHumanOwned()`, `.list()`, `.owner()`, `.register()`, `.registeredCount()`, `.release()`, `.takeOver()`, `handoff-manager.test.ts`, `handoff-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (13 nodes): `TranscriptManager`, `.append()`, `.assertId()`, `.create()`, `.delete()`, `.enqueue()`, `.ledgerPath()`, `.list()`, `.load()`, `.metaPath()`, `.readMeta()`, `.renameId()`, `.renameTitle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (13 nodes): `defaultSleep()`, `RateLimitBroker`, `.acquire()`, `.configure()`, `.constructor()`, `.has()`, `.maybeWarn()`, `.remainingQuota()`, `.resetQuota()`, `.tryAcquire()`, `fakeClock()`, `broker.test.ts`, `broker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (12 nodes): `SetupPage`, `.advanceFromWelcome()`, `.completeProviderStep()`, `.constructor()`, `.goto()`, `.providerRadio()`, `.selectProvider()`, `.stepTitle()`, `.stubStatus()`, `.stubTelegramVerify()`, `.stubValidateKey()`, `setup.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (9 nodes): `OutboxPage`, `.constructor()`, `.dlqHeading()`, `.failedHeading()`, `.goto()`, `.retryButton()`, `.stub()`, `.stubRetry()`, `outbox.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (8 nodes): `AppShell`, `.constructor()`, `.goto()`, `.navLink()`, `.openThemeMenu()`, `.selectTheme()`, `.storedTheme()`, `app-shell.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (8 nodes): `MetaScheduler`, `.constructor()`, `.schedule()`, `.start()`, `.stop()`, `.tick()`, `scheduler.test.ts`, `scheduler.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (8 nodes): `FacebookPages`, `.constructor()`, `.createPost()`, `.getInsights()`, `.listComments()`, `.listPages()`, `.reply()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (7 nodes): `DashboardPage`, `.constructor()`, `.dialog()`, `.goto()`, `.kpiCard()`, `.openQuickActions()`, `dashboard.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (7 nodes): `InstagramPublisher`, `.constructor()`, `.createCarousel()`, `.createSingle()`, `.publish()`, `.run()`, `.waitForContainer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (6 nodes): `ComposePage`, `.constructor()`, `.goto()`, `.stubConnections()`, `.target()`, `compose.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (6 nodes): `InboxPage`, `.constructor()`, `.conversationList()`, `.goto()`, `.listOrEmptyState()`, `inbox.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (6 nodes): `OutboxDispatch`, `.get()`, `.has()`, `.platforms()`, `.publish()`, `.register()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fetchImpl()` connect `Community 1` to `Community 0`, `Community 2`, `Community 10`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `probeOllama()` connect `Community 10` to `Community 1`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 23 inferred relationships involving `startServer()` (e.g. with `bootstrap()` and `getConfig()`) actually correct?**
  _`startServer()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `assertSafeUrl()` (e.g. with `.constructor()` and `.constructor()`) actually correct?**
  _`assertSafeUrl()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._