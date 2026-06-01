# Graph Report - openzigs-social  (2026-06-01)

## Corpus Check
- 442 files · ~206,279 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1764 nodes · 2554 edges · 47 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 138 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]

## God Nodes (most connected - your core abstractions)
1. `startServer()` - 28 edges
2. `CredentialVault` - 25 edges
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
- `platform()` --calls--> `defaultKeyMaterial()`  [INFERRED]
  ui/components/onboarding/social-connect-step.test.tsx → src/vault/vault.ts
- `handleVerify()` --calls--> `verifyTelegram()`  [INFERRED]
  ui/components/setup/telegram-step.tsx → src/server/setup/telegram-verify.ts
- `preview()` --calls--> `postLimitsFor()`  [INFERRED]
  ui/components/calendar/calendar-view.tsx → src/outbox/post-limits.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (49): createMailer(), isConfigured(), createAnalyticsRouter(), deepMerge(), defaultConfigPath(), envLayer(), getConfig(), isObject() (+41 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (26): InstagramDmSender, InstagramInboxPoller, IgContainerNotReadyError, InstagramPublisher, appendParams(), MetaGraphClient, MetaGraphError, safeParse() (+18 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (30): NoPublisherError, OutboxDispatch, buildOutboxDispatch(), linkedinAdapter(), twitterAdapter(), build(), fakeDlq(), grantingBroker() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (34): PinterestAnalyticsPoller, utcDay(), PinterestDispatcher, callbackUrl(), registerPinterestConnectors(), basicAuth(), PinterestAppNotConfiguredError, PinterestOAuthExchanger (+26 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (24): createConnectionsRouter(), listen(), mount(), createModelRouter(), listen(), mount(), defaultSelectionPath(), isModelProvider() (+16 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (13): SocialDmSenderRegistry, AdminAcl, createAclMiddleware(), normalizeChatId(), buildApprovalCallbackData(), buildApprovalKeyboard(), escapeHtml(), renderApprovalMessage() (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (25): createAutoReplyRouter(), parseRulebook(), toStringList(), asStringArray(), parseBrandVoiceImport(), createOnboardingRouter(), listen(), mount() (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (28): aggregatePostMetrics(), followersByPlatform(), parseDayKeyMs(), rollupEngagement(), dayKey(), insight(), utcDayKey(), withinWindow() (+20 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (24): LinkedInAnalyticsPoller, build(), fakeClient(), passthroughDispatcher(), utcDay(), LinkedInCommentPoller, LinkedInDispatcher, callbackUrl() (+16 more)

### Community 9 - "Community 9"
Cohesion: 0.04
Nodes (13): PrivacyController, SessionManager, estimateTokens(), SmartRouter, CopilotWrapper, AnthropicProvider, CopilotProvider, createProvider() (+5 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (21): InsightsRepository, parseMetadata(), toReading(), TikTokDispatcher, build(), fakeClient(), passthroughDispatcher(), TikTokDisplayPoller (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (38): onEventDrop(), preview(), submit(), toEpoch(), applyRecipe(), authorizePlatform(), completeStep(), dismissTourSection() (+30 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (10): vaultPath(), platform(), decrypt(), deriveKey(), encrypt(), RefreshRegistry, TokenRefreshScheduler, CredentialVault (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (12): MetaDispatcher, errorMessage(), OutboxPoller, OutboxScheduler, computeBackoffMs(), dispatchWithDlq(), retry(), RetryExhaustedError (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (17): collectStrings(), discoverEmail(), discoverFollowerCount(), extractEmails(), normalizeEmail(), bucketFor(), clamp01(), scoreLead() (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (21): DmDispatcher, asNumber(), asString(), buildFacts(), evaluateComparison(), evaluateCondition(), evaluateRules(), higherPriority() (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (17): isDmSupported(), limitsFor(), validateReply(), buildMatchExpression(), InboxRepository, messageKind(), parseMetadata(), toContact() (+9 more)

### Community 17 - "Community 17"
Cohesion: 0.06
Nodes (16): useSocket(), ContactsView(), InboxView(), PlatformBadge(), useContact(), useContacts(), useMergeContacts(), useSuggestedMerges() (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (9): WebhookEventStore, WebhookHandlerRegistry, computeSignature(), normalizeSignature(), verifySignature(), createWebhookRouter(), listen(), mount() (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (6): canTransition(), IllegalTransitionError, OutboxNotFoundError, OutboxRepository, parseMedia(), toPost()

### Community 20 - "Community 20"
Cohesion: 0.22
Nodes (13): createPost(), deletePost(), fetchOutbox(), fetchOutboxDlq(), readError(), reschedulePost(), retryPost(), schedulePost() (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.15
Nodes (5): clone(), ContactsPage, escapeRegExp(), mergeDetails(), sortTimeline()

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (11): fetchEngagementSeries(), fetchHeatmap(), fetchSummary(), fetchTopPosts(), readError(), useAnalyticsLiveRefresh(), useAnalyticsSummary(), useEngagementSeries() (+3 more)

### Community 23 - "Community 23"
Cohesion: 0.21
Nodes (7): fetchAuditLog(), fetchAutoReplyConfig(), fetchRulebook(), readError(), resolveAudit(), saveRulebook(), scoreDraft()

### Community 24 - "Community 24"
Cohesion: 0.2
Nodes (4): cloneRulebook(), normalizeList(), normalizeRulebook(), SettingsPage

### Community 25 - "Community 25"
Cohesion: 0.14
Nodes (1): AnalyticsPage

### Community 26 - "Community 26"
Cohesion: 0.19
Nodes (2): ApprovalQueue, ApprovalQueueFullError

### Community 27 - "Community 27"
Cohesion: 0.21
Nodes (1): HandoffManager

### Community 28 - "Community 28"
Cohesion: 0.23
Nodes (9): clampStep(), getWizardSnapshot(), loadWizardState(), normalizeWizardState(), postJson(), saveWizardState(), validateProviderKey(), verifyTelegram() (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.33
Nodes (1): TranscriptManager

### Community 30 - "Community 30"
Cohesion: 0.19
Nodes (1): RateLimitBroker

### Community 31 - "Community 31"
Cohesion: 0.2
Nodes (1): SetupPage

### Community 32 - "Community 32"
Cohesion: 0.22
Nodes (1): OutboxPage

### Community 33 - "Community 33"
Cohesion: 0.22
Nodes (3): Probe(), useTheme(), ThemeToggle()

### Community 34 - "Community 34"
Cohesion: 0.39
Nodes (6): applyResolvedTheme(), applyTheme(), getStoredTheme(), getSystemTheme(), isTheme(), resolveTheme()

### Community 35 - "Community 35"
Cohesion: 0.29
Nodes (1): AppShell

### Community 36 - "Community 36"
Cohesion: 0.32
Nodes (1): MetaScheduler

### Community 37 - "Community 37"
Cohesion: 0.32
Nodes (1): FacebookPages

### Community 38 - "Community 38"
Cohesion: 0.39
Nodes (2): Metrics, zero()

### Community 39 - "Community 39"
Cohesion: 0.52
Nodes (6): analyticsFixtures(), heatmap(), matrix(), series(), summary(), topPosts()

### Community 40 - "Community 40"
Cohesion: 0.29
Nodes (1): DashboardPage

### Community 42 - "Community 42"
Cohesion: 0.4
Nodes (3): generateUuid(), getClientId(), createSocket()

### Community 43 - "Community 43"
Cohesion: 0.33
Nodes (1): ComposePage

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (1): InboxPage

### Community 46 - "Community 46"
Cohesion: 0.8
Nodes (4): baseContact(), buildState(), detailContact(), mergeSuggestion()

### Community 49 - "Community 49"
Cohesion: 0.6
Nodes (3): normalise(), toList(), validateRulebook()

### Community 50 - "Community 50"
Cohesion: 0.83
Nodes (3): charactersRemaining(), postLimitsFor(), validatePost()

## Knowledge Gaps
- **Thin community `Community 25`** (14 nodes): `AnalyticsPage`, `.constructor()`, `.goto()`, `.metricValue()`, `.platformButton()`, `.stubDashboard()`, `.topPostHeading()`, `.topPostItem()`, `.windowButton()`, `key()`, `parsePlatform()`, `parseWindow()`, `readRecord()`, `analytics.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (14 nodes): `ApprovalQueue`, `.clear()`, `.constructor()`, `.decide()`, `.get()`, `.has()`, `.list()`, `.request()`, `.settle()`, `.size()`, `ApprovalQueueFullError`, `.constructor()`, `approval-queue.test.ts`, `approval-queue.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (14 nodes): `HandoffManager`, `.abortAll()`, `.assertThreadId()`, `.constructor()`, `.emitChange()`, `.isHumanOwned()`, `.list()`, `.owner()`, `.register()`, `.registeredCount()`, `.release()`, `.takeOver()`, `handoff-manager.test.ts`, `handoff-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (13 nodes): `TranscriptManager`, `.append()`, `.assertId()`, `.create()`, `.delete()`, `.enqueue()`, `.ledgerPath()`, `.list()`, `.load()`, `.metaPath()`, `.readMeta()`, `.renameId()`, `.renameTitle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (13 nodes): `defaultSleep()`, `RateLimitBroker`, `.acquire()`, `.configure()`, `.constructor()`, `.has()`, `.maybeWarn()`, `.remainingQuota()`, `.resetQuota()`, `.tryAcquire()`, `fakeClock()`, `broker.test.ts`, `broker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (12 nodes): `SetupPage`, `.advanceFromWelcome()`, `.completeProviderStep()`, `.constructor()`, `.goto()`, `.providerRadio()`, `.selectProvider()`, `.stepTitle()`, `.stubStatus()`, `.stubTelegramVerify()`, `.stubValidateKey()`, `setup.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (9 nodes): `OutboxPage`, `.constructor()`, `.dlqHeading()`, `.failedHeading()`, `.goto()`, `.retryButton()`, `.stub()`, `.stubRetry()`, `outbox.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (8 nodes): `AppShell`, `.constructor()`, `.goto()`, `.navLink()`, `.openThemeMenu()`, `.selectTheme()`, `.storedTheme()`, `app-shell.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (8 nodes): `MetaScheduler`, `.constructor()`, `.schedule()`, `.start()`, `.stop()`, `.tick()`, `scheduler.test.ts`, `scheduler.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (8 nodes): `FacebookPages`, `.constructor()`, `.createPost()`, `.getInsights()`, `.listComments()`, `.listPages()`, `.reply()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (8 nodes): `Metrics`, `.increment()`, `.recordFailed()`, `.recordReceived()`, `.recordSent()`, `.reset()`, `.snapshot()`, `zero()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (7 nodes): `DashboardPage`, `.constructor()`, `.dialog()`, `.goto()`, `.kpiCard()`, `.openQuickActions()`, `dashboard.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (6 nodes): `ComposePage`, `.constructor()`, `.goto()`, `.stubConnections()`, `.target()`, `compose.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (6 nodes): `InboxPage`, `.constructor()`, `.conversationList()`, `.goto()`, `.listOrEmptyState()`, `inbox.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 26 inferred relationships involving `startServer()` (e.g. with `bootstrap()` and `getConfig()`) actually correct?**
  _`startServer()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `assertSafeUrl()` (e.g. with `.constructor()` and `.constructor()`) actually correct?**
  _`assertSafeUrl()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._