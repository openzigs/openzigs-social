# Graph Report - openzigs-social  (2026-06-05)

## Corpus Check
- 472 files · ~231,984 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1903 nodes · 2725 edges · 64 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 150 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]

## God Nodes (most connected - your core abstractions)
1. `startServer()` - 30 edges
2. `CredentialVault` - 25 edges
3. `OnboardingPage` - 22 edges
4. `ContactsPage` - 18 edges
5. `CrmRepository` - 18 edges
6. `assertSafeUrl()` - 16 edges
7. `OutboxRepository` - 16 edges
8. `TranscriptManager` - 14 edges
9. `HandoffManager` - 12 edges
10. `TelegramChannel` - 12 edges

## Surprising Connections (you probably didn't know these)
- `dmUnsupportedNotice()` --calls--> `limitsFor()`  [INFERRED]
  ui/components/inbox/thread-detail.tsx → src/inbox/platform-limits.ts
- `detail()` --calls--> `limitsFor()`  [INFERRED]
  ui/components/inbox/thread-detail.test.tsx → src/inbox/platform-limits.ts
- `recipes()` --calls--> `make()`  [INFERRED]
  ui/e2e/onboarding.spec.ts → src/connectors/meta/graph-client.test.ts
- `platform()` --calls--> `defaultKeyMaterial()`  [INFERRED]
  ui/components/onboarding/social-connect-step.test.tsx → src/vault/vault.ts
- `handleVerify()` --calls--> `verifyTelegram()`  [INFERRED]
  ui/components/setup/telegram-step.tsx → src/server/setup/telegram-verify.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (68): getDb(), openDb(), InsightsRepository, parseMetadata(), toReading(), build(), fakeClient(), passthroughDispatcher() (+60 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (25): FacebookPages, InstagramDmSender, InstagramInboxPoller, IgContainerNotReadyError, InstagramPublisher, appendParams(), MetaGraphClient, MetaGraphError (+17 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (40): DmDispatcher, isDmSupported(), limitsFor(), validateReply(), buildMatchExpression(), InboxRepository, messageKind(), parseMetadata() (+32 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (42): assertNoDmScopes(), LinkedInAppNotConfiguredError, LinkedInDmScopeError, LinkedInOAuthExchanger, readToken(), appendQuery(), LinkedInRestClient, safeParse() (+34 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (31): aggregatePostMetrics(), followersByPlatform(), parseDayKeyMs(), rollupEngagement(), dayKey(), insight(), utcDayKey(), withinWindow() (+23 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (13): SocialDmSenderRegistry, AdminAcl, createAclMiddleware(), normalizeChatId(), buildApprovalCallbackData(), buildApprovalKeyboard(), escapeHtml(), renderApprovalMessage() (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (25): createAutoReplyRouter(), parseRulebook(), toStringList(), asStringArray(), parseBrandVoiceImport(), createOnboardingRouter(), listen(), mount() (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (16): createConnectionsRouter(), listen(), mount(), GdprDeleteError, createContactsRouter(), parseId(), parseMergeRequest(), createApp() (+8 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (30): bufferIndexOf(), createBackupRouter(), parseMultipart(), splitBuffer(), deepMerge(), defaultConfigPath(), envLayer(), getConfig() (+22 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (38): onEventDrop(), preview(), submit(), toEpoch(), applyRecipe(), authorizePlatform(), completeStep(), dismissTourSection() (+30 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (9): platform(), decrypt(), deriveKey(), encrypt(), RefreshRegistry, TokenRefreshScheduler, CredentialVault, defaultKeyMaterial() (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (15): CopilotWrapper, createModelRouter(), listen(), mount(), defaultSelectionPath(), isModelProvider(), ModelSelectionStore, AnthropicProvider (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (17): collectStrings(), discoverEmail(), discoverFollowerCount(), extractEmails(), normalizeEmail(), bucketFor(), clamp01(), scoreLead() (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (17): useSocket(), ContactsView(), InboxView(), PlatformBadge(), useContact(), useContacts(), useDeleteContact(), useMergeContacts() (+9 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (10): ConnectorRegistry, createOAuthRouter(), isSafeRelativePath(), listen(), mount(), OAuthStateStore, safeEqual(), createSocialSetupRouter() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.06
Nodes (17): appliedVersions(), ensureMigrationsTable(), loadMigrations(), migrate(), LinkedInDispatcher, MetaDispatcher, errorMessage(), OutboxPoller (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (4): PrivacyController, SessionManager, estimateTokens(), SmartRouter

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (5): clone(), ContactsPage, escapeRegExp(), mergeDetails(), sortTimeline()

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (2): createSocketServer(), TranscriptManager

### Community 19 - "Community 19"
Cohesion: 0.11
Nodes (9): WebhookEventStore, WebhookHandlerRegistry, computeSignature(), normalizeSignature(), verifySignature(), createWebhookRouter(), listen(), mount() (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.1
Nodes (1): OnboardingPage

### Community 21 - "Community 21"
Cohesion: 0.21
Nodes (2): canTransition(), OutboxRepository

### Community 22 - "Community 22"
Cohesion: 0.22
Nodes (13): createPost(), deletePost(), fetchOutbox(), fetchOutboxDlq(), readError(), reschedulePost(), retryPost(), schedulePost() (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.25
Nodes (11): fetchEngagementSeries(), fetchHeatmap(), fetchSummary(), fetchTopPosts(), readError(), useAnalyticsLiveRefresh(), useAnalyticsSummary(), useEngagementSeries() (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.21
Nodes (7): fetchAuditLog(), fetchAutoReplyConfig(), fetchRulebook(), readError(), resolveAudit(), saveRulebook(), scoreDraft()

### Community 25 - "Community 25"
Cohesion: 0.2
Nodes (4): cloneRulebook(), normalizeList(), normalizeRulebook(), SettingsPage

### Community 26 - "Community 26"
Cohesion: 0.14
Nodes (1): AnalyticsPage

### Community 27 - "Community 27"
Cohesion: 0.19
Nodes (2): ApprovalQueue, ApprovalQueueFullError

### Community 28 - "Community 28"
Cohesion: 0.21
Nodes (1): HandoffManager

### Community 29 - "Community 29"
Cohesion: 0.23
Nodes (9): clampStep(), getWizardSnapshot(), loadWizardState(), normalizeWizardState(), postJson(), saveWizardState(), validateProviderKey(), verifyTelegram() (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.24
Nodes (7): createYoutubeConnector(), build(), getQuotaUsage(), isQuotaExhausted(), maybeSendQuotaAlert(), recordQuotaUsage(), utcDay()

### Community 31 - "Community 31"
Cohesion: 0.19
Nodes (1): RateLimitBroker

### Community 32 - "Community 32"
Cohesion: 0.2
Nodes (1): SetupPage

### Community 33 - "Community 33"
Cohesion: 0.24
Nodes (6): platform(), recipes(), socialStatus(), fetchImpl(), jsonResponse(), make()

### Community 34 - "Community 34"
Cohesion: 0.22
Nodes (1): OutboxPage

### Community 35 - "Community 35"
Cohesion: 0.22
Nodes (3): Probe(), useTheme(), ThemeToggle()

### Community 36 - "Community 36"
Cohesion: 0.39
Nodes (6): applyResolvedTheme(), applyTheme(), getStoredTheme(), getSystemTheme(), isTheme(), resolveTheme()

### Community 37 - "Community 37"
Cohesion: 0.29
Nodes (1): AppShell

### Community 38 - "Community 38"
Cohesion: 0.29
Nodes (1): QuotaPage

### Community 39 - "Community 39"
Cohesion: 0.25
Nodes (1): BackupPage

### Community 40 - "Community 40"
Cohesion: 0.32
Nodes (1): MetaScheduler

### Community 41 - "Community 41"
Cohesion: 0.52
Nodes (6): analyticsFixtures(), heatmap(), matrix(), series(), summary(), topPosts()

### Community 42 - "Community 42"
Cohesion: 0.38
Nodes (1): TourPage

### Community 43 - "Community 43"
Cohesion: 0.29
Nodes (1): DashboardPage

### Community 45 - "Community 45"
Cohesion: 0.4
Nodes (4): handleExport(), handleImport(), exportBackup(), importBackup()

### Community 46 - "Community 46"
Cohesion: 0.4
Nodes (3): generateUuid(), getClientId(), createSocket()

### Community 47 - "Community 47"
Cohesion: 0.33
Nodes (1): ComposePage

### Community 48 - "Community 48"
Cohesion: 0.33
Nodes (1): InboxPage

### Community 49 - "Community 49"
Cohesion: 0.4
Nodes (2): TikTokDisplayPoller, utcDay()

### Community 50 - "Community 50"
Cohesion: 0.6
Nodes (1): TwitterQuotaGuard

### Community 51 - "Community 51"
Cohesion: 0.53
Nodes (2): TwitterCreditTracker, utcMonth()

### Community 52 - "Community 52"
Cohesion: 0.47
Nodes (1): TwitterPublisher

### Community 53 - "Community 53"
Cohesion: 0.4
Nodes (2): LinkedInAnalyticsPoller, utcDay()

### Community 54 - "Community 54"
Cohesion: 0.47
Nodes (2): DlqRepository, toEntry()

### Community 55 - "Community 55"
Cohesion: 0.4
Nodes (1): OutboxDispatch

### Community 57 - "Community 57"
Cohesion: 0.8
Nodes (4): baseContact(), buildState(), detailContact(), mergeSuggestion()

### Community 60 - "Community 60"
Cohesion: 0.6
Nodes (3): normalise(), toList(), validateRulebook()

### Community 61 - "Community 61"
Cohesion: 0.4
Nodes (1): PinterestPublisher

### Community 62 - "Community 62"
Cohesion: 0.4
Nodes (1): OutboxScheduler

### Community 63 - "Community 63"
Cohesion: 0.83
Nodes (3): charactersRemaining(), postLimitsFor(), validatePost()

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (3): baseContact(), buildState(), detailContact()

### Community 70 - "Community 70"
Cohesion: 0.5
Nodes (1): TwitterDmSender

### Community 71 - "Community 71"
Cohesion: 0.5
Nodes (1): TwitterDmPoller

### Community 72 - "Community 72"
Cohesion: 0.5
Nodes (1): LinkedInCommentPoller

## Knowledge Gaps
- **Thin community `Community 18`** (25 nodes): `createSocketServer()`, `readClientId()`, `restoreSession()`, `connectionHandler()`, `flush()`, `makeFakeSocket()`, `waitForEvent()`, `TranscriptManager`, `.append()`, `.assertId()`, `.constructor()`, `.create()`, `.delete()`, `.enqueue()`, `.ledgerPath()`, `.list()`, `.load()`, `.metaPath()`, `.readMeta()`, `.renameId()`, `.renameTitle()`, `socket.test.ts`, `socket.ts`, `transcript-manager.test.ts`, `transcript-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (23 nodes): `OnboardingPage`, `.byokChip()`, `.connectButton()`, `.constructor()`, `.goto()`, `.openStep()`, `.platformState()`, `.pullButton()`, `.recipeCard()`, `.skipButton()`, `.statusBadge()`, `.stubApplyRecipe()`, `.stubAuthorize()`, `.stubImportBrandVoice()`, `.stubModelPull()`, `.stubModelSelect()`, `.stubModelStatus()`, `.stubRecipes()`, `.stubSaveMetaApp()`, `.stubSocialStatus()`, `.tab()`, `.useRecipeButton()`, `onboarding.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (17 nodes): `canTransition()`, `OutboxRepository`, `.claimDue()`, `.constructor()`, `.create()`, `.delete()`, `.get()`, `.getOrThrow()`, `.list()`, `.markFailed()`, `.markPublished()`, `.reschedule()`, `.retry()`, `.schedule()`, `.transition()`, `.unschedule()`, `.update()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (14 nodes): `AnalyticsPage`, `.constructor()`, `.goto()`, `.metricValue()`, `.platformButton()`, `.stubDashboard()`, `.topPostHeading()`, `.topPostItem()`, `.windowButton()`, `key()`, `parsePlatform()`, `parseWindow()`, `readRecord()`, `analytics.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (14 nodes): `ApprovalQueue`, `.clear()`, `.constructor()`, `.decide()`, `.get()`, `.has()`, `.list()`, `.request()`, `.settle()`, `.size()`, `ApprovalQueueFullError`, `.constructor()`, `approval-queue.test.ts`, `approval-queue.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (14 nodes): `HandoffManager`, `.abortAll()`, `.assertThreadId()`, `.constructor()`, `.emitChange()`, `.isHumanOwned()`, `.list()`, `.owner()`, `.register()`, `.registeredCount()`, `.release()`, `.takeOver()`, `handoff-manager.test.ts`, `handoff-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (13 nodes): `defaultSleep()`, `RateLimitBroker`, `.acquire()`, `.configure()`, `.constructor()`, `.has()`, `.maybeWarn()`, `.remainingQuota()`, `.resetQuota()`, `.tryAcquire()`, `fakeClock()`, `broker.test.ts`, `broker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (12 nodes): `SetupPage`, `.advanceFromWelcome()`, `.completeProviderStep()`, `.constructor()`, `.goto()`, `.providerRadio()`, `.selectProvider()`, `.stepTitle()`, `.stubStatus()`, `.stubTelegramVerify()`, `.stubValidateKey()`, `setup.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (9 nodes): `OutboxPage`, `.constructor()`, `.dlqHeading()`, `.failedHeading()`, `.goto()`, `.retryButton()`, `.stub()`, `.stubRetry()`, `outbox.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (8 nodes): `AppShell`, `.constructor()`, `.goto()`, `.navLink()`, `.openThemeMenu()`, `.selectTheme()`, `.storedTheme()`, `app-shell.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (8 nodes): `QuotaPage`, `.constructor()`, `.fillBar()`, `.makeQuota()`, `.progressbar()`, `.stubQuota()`, `.widget()`, `quota.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (8 nodes): `BackupPage`, `.alert()`, `.constructor()`, `.selectBinFile()`, `.stubExportSuccess()`, `.stubImport422()`, `.stubImportSuccess()`, `backup.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (8 nodes): `MetaScheduler`, `.constructor()`, `.schedule()`, `.start()`, `.stop()`, `.tick()`, `scheduler.test.ts`, `scheduler.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (7 nodes): `TourPage`, `.coachMark()`, `.constructor()`, `.dismiss()`, `.dismissButton()`, `.goto()`, `tour.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (7 nodes): `DashboardPage`, `.constructor()`, `.dialog()`, `.goto()`, `.kpiCard()`, `.openQuickActions()`, `dashboard.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (6 nodes): `ComposePage`, `.constructor()`, `.goto()`, `.stubConnections()`, `.target()`, `compose.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (6 nodes): `InboxPage`, `.constructor()`, `.conversationList()`, `.goto()`, `.listOrEmptyState()`, `inbox.page.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (6 nodes): `TikTokDisplayPoller`, `.constructor()`, `.pollUserInfo()`, `.pollVideos()`, `.run()`, `utcDay()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (6 nodes): `TwitterQuotaGuard`, `.constructor()`, `.ensureWithinQuota()`, `.fire()`, `.recordWrite()`, `.status()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (6 nodes): `TwitterCreditTracker`, `.constructor()`, `.record()`, `.summary()`, `.usedThisMonth()`, `utcMonth()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (6 nodes): `TwitterPublisher`, `.constructor()`, `.createTweet()`, `.publish()`, `.reply()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (6 nodes): `LinkedInAnalyticsPoller`, `.constructor()`, `.pollFollowers()`, `.pollPostInsights()`, `.run()`, `utcDay()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (6 nodes): `DlqRepository`, `.constructor()`, `.get()`, `.land()`, `.list()`, `toEntry()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (6 nodes): `OutboxDispatch`, `.get()`, `.has()`, `.platforms()`, `.publish()`, `.register()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (5 nodes): `PinterestPublisher`, `.constructor()`, `.createBoard()`, `.createPin()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (5 nodes): `OutboxScheduler`, `.constructor()`, `.runTick()`, `.start()`, `.stop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (4 nodes): `TwitterDmSender`, `.constructor()`, `.sendDm()`, `.supports()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (4 nodes): `TwitterDmPoller`, `.constructor()`, `.poll()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (4 nodes): `LinkedInCommentPoller`, `.constructor()`, `.poll()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 28 inferred relationships involving `startServer()` (e.g. with `bootstrap()` and `getConfig()`) actually correct?**
  _`startServer()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._