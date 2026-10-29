# SIP module-by-module audit

Static source inventory only. Tests listed here are present, not necessarily passing. Installation, credentials, runtime service loading and real call/payment acceptance require separate evidence.

API source modules: 169. Application feature entries: 86. Kamailio entries: 266.

## API sources

| Module | Reachable from server | Migration import | Tests present | Handler/worker references |
| --- | --- | --- | --- | --- |
| access | True | True | access.test.js | handleAccess |
| accountRanges | True | True | accountRanges.integration.test.js, accountRanges.test.js | handleAccountRanges |
| adapterRegistry | True | True | adapterRegistry.test.js, adapterTargets.test.js | handleAdapterRegistry |
| adapterTargets | True | False | adapterTargets.test.js | library / CLI / no direct reference |
| adminGroup | True | True | adminGroup.test.js | handleAdminGroup |
| apiBridge | True | False | apiBridge.test.js | handleApiBridge |
| apnsPush | True | False | apnsPush.test.js | library / CLI / no direct reference |
| authProviders | True | True | authProviders.test.js | handleAuthProviders |
| authSchema | False | False | authSchema.test.js | library / CLI / no direct reference |
| background | True | True | background.test.js | handleBackground |
| billing | True | False | billing.test.js | library / CLI / no direct reference |
| bootstrap-production-admin | False | False | bootstrap-production-admin.test.js | library / CLI / no direct reference |
| bootstrap-super-admin | False | False | none identified | library / CLI / no direct reference |
| callAccess | True | False | callAccess.test.js, callAccessDialing.test.js | handleCallAccess |
| callerIdentityPolicy | False | False | callerIdentityPolicy.test.js | library / CLI / no direct reference |
| callerVerification | False | False | callerVerification.test.js | library / CLI / no direct reference |
| campaigns | True | True | none identified | handleCampaigns |
| carrierProviders | True | True | carrierProviders.test.js | handleCarrierProviders |
| catalogControl | True | True | catalogControl.test.js | handleCatalogControl |
| cdr | True | False | cdr.test.js | handleCdrIngest, handleCdrAdmin |
| cdrArchive | True | True | cdrArchive.test.js, moduleRollout.integration.test.js | handleCdrArchives, startCdrArchives |
| charging | True | False | none identified | handleCharging |
| cluster-command | False | False | none identified | library / CLI / no direct reference |
| cluster | True | True | cluster.test.js | handleCluster |
| commissionAdapter | False | False | none identified | library / CLI / no direct reference |
| commissionPaidCalls | False | False | none identified | library / CLI / no direct reference |
| contactCards | True | True | contactCards.test.js | handleContactCards |
| contactDiscovery | True | True | contactDiscovery.test.js | handleContactDiscovery |
| contactSettings | True | False | contactSettings.test.js | handleContactSettings |
| conversations | True | True | conversations.test.js, readAll.test.js | handleConversations |
| countryBoundaries | False | False | none identified | library / CLI / no direct reference |
| dashboard | True | True | dashboard.test.js | handleDashboard |
| db | True | True | accountRanges.integration.test.js, integration.test.js, moduleRollout.integration.test.js, storeGateways.integration.test.js, tariffCatalog.integration.test.js, telecomModules.integration.test.js | library / CLI / no direct reference |
| defaultPresence | True | True | defaultPresence.test.js | library / CLI / no direct reference |
| dialingPolicy | True | False | dialingPolicy.test.js | handleDialingPolicy |
| didAvailability | False | False | didAvailability.test.js | library / CLI / no direct reference |
| dids | True | False | dids.test.js | handleInhouseDids |
| didwwIntegration | True | True | didwwIntegration.test.js | handleDidwwCallback, handleDidwwAdmin |
| didwwProvisionWorker | False | False | none identified | library / CLI / no direct reference |
| didwwProvisioning | True | False | didwwProvisioning.test.js | library / CLI / no direct reference |
| fleetFirewall | True | True | fleetNetwork.test.js | library / CLI / no direct reference |
| fleetNetwork | True | True | fleetNetwork.test.js | library / CLI / no direct reference |
| flowrouteCustomerRate | True | False | flowrouteCustomerRate.test.js | library / CLI / no direct reference |
| flowrouteRateSync | True | False | flowrouteRateSync.test.js | startFlowrouteRateSync |
| flowrouteRates | True | True | flowrouteRates.test.js | handleFlowrouteRates |
| flowrouteTrunk | True | False | flowrouteTrunk.test.js | library / CLI / no direct reference |
| geoCalling | False | False | geoCalling.test.js | library / CLI / no direct reference |
| geofenceAddress | True | False | geofenceAddress.test.js | handleGeofenceAddress |
| geofencePolicy | True | True | geofencePolicy.test.js | handleGeofencePolicy |
| googleContactsConfig | True | False | googleContactsConfig.test.js | handleGoogleContactsAdmin |
| helpAgent | True | False | helpAgent.test.js | handleHelpAgent |
| hostedAccounts | True | True | apiBridge.test.js, hostedAccounts.test.js | handleHostedAccounts |
| hostedApps | True | False | hostedApps.test.js | handleHostedApps |
| hpInterconnect | False | False | hpInterconnect.test.js | library / CLI / no direct reference |
| icnInterconnect | False | False | icnInterconnect.test.js | library / CLI / no direct reference |
| importFlowrouteTrunk | False | False | none identified | library / CLI / no direct reference |
| inboundDidOwner | False | False | inboundDidOwner.test.js | library / CLI / no direct reference |
| inboundRouting | False | False | inboundRouting.test.js | library / CLI / no direct reference |
| justisolveBridge | True | False | justisolveBridge.test.js | handleJustisolveBridge, startJustisolveLeaseSweep |
| kamailio | True | True | kamailio.test.js | handleKamailioAdmin, handleKamailioRunner |
| kamailioAccounts | True | True | kamailioAccounts.test.js | library / CLI / no direct reference |
| kamailioHttpBridge | True | False | kamailioHttpBridge.test.js | startKamailioHttpBridge |
| languageTools | True | False | languageTools.test.js | handleLanguageTools |
| ldap | True | True | ldap.test.js | handleLdapAdmin |
| liveCalls | True | False | liveCalls.test.js | handleLiveCalls |
| localDialing | True | False | dialingPolicy.test.js, localDialing.test.js | library / CLI / no direct reference |
| locales | True | True | locales.test.js | handleLocales |
| locationHistory | True | True | locationHistory.test.js | handleLocationHistory |
| locationReportAddress | True | False | locationReportAddress.test.js | library / CLI / no direct reference |
| locationReports | True | False | locationReportAddress.test.js, locationReports.test.js | handleLocationReports |
| manage-admin-group | False | False | none identified | library / CLI / no direct reference |
| marketplaceControl | True | True | marketplaceControl.test.js, moduleRollout.integration.test.js, storeGateways.integration.test.js | handleMarketplaceControl |
| marketplaceReadiness | False | False | none identified | library / CLI / no direct reference |
| meetings | True | False | none identified | library / CLI / no direct reference |
| messagePrivacy | True | True | messagePrivacy.test.js | handleViewOnce, startMessageExpiry |
| messagingWebhooks | True | True | messagingWebhooks.test.js, quickSignup.test.js | handleFlowrouteWebhook, handleMessagingWebhookAdmin, handleExternalSms, handleSmsNumberAdmin |
| messengerFeatures | True | True | messengerFeatures.test.js | handleMessengerFeatures |
| messengerPreferences | True | True | messengerPreferences.test.js, profilePhoto.test.js | handleMessengerPreferences, handleProfilePhoto |
| migrate | True | False | moduleRollout.integration.test.js, storeGateways.integration.test.js, tariffCatalog.integration.test.js, telecomModules.integration.test.js | library / CLI / no direct reference |
| mobileAdmin | True | False | mobileAdmin.test.js | handleMobileAdmin |
| moduleAudit | True | False | moduleAudit.test.js | handleModuleAudit |
| moduleReadiness | False | False | none identified | library / CLI / no direct reference |
| moneyRequests | True | False | moneyRequests.test.js | library / CLI / no direct reference |
| nativePush | True | True | nativePush.test.js | handleNativePush, startNativePush |
| navigationPolicy | True | True | navigationPolicy.test.js | handleNavigationPolicy |
| nigeria | True | False | nigeria.test.js | handleNigeria |
| onboarding | True | True | onboarding.test.js, registrationSafety.test.js | handleOnboarding |
| operationsPolicy | True | True | fleetNetwork.test.js | handleOperationsPolicy |
| operatorControl | True | True | operatorControl.test.js | handleOperatorControl |
| outboundDids | True | False | outboundDids.test.js | library / CLI / no direct reference |
| passkeyPolicy | True | True | featureWorkflows.test.js | handlePasskeyPolicy |
| passkeys | True | False | none identified | handlePasskeys |
| paymentReconciliation | True | True | paymentReconciliation.test.js | handlePaymentReconciliation, startPaymentReconciliation |
| payments | True | True | payments.test.js | handlePaymentAdmin, handlePaymentCheckout, handleStripeWebhook |
| pbx | True | False | pbx.test.js, pbxBranding.test.js | handlePbx |
| permissions | True | False | permissions.test.js | library / CLI / no direct reference |
| phoneSettings | False | False | phoneSettings.test.js | library / CLI / no direct reference |
| pricing | True | True | pricing.test.js | handlePricing |
| productPublish | False | False | integration.test.js, productPublish.test.js | library / CLI / no direct reference |
| productStore | True | True | integration.test.js, marketplaceControl.test.js, moduleRollout.integration.test.js, productStore.test.js | handleProductStore, startStoreRenewals |
| promote-super-admin | False | False | none identified | library / CLI / no direct reference |
| providerCredentials | True | True | callerVerification.test.js, didwwProvisioning.test.js, providerCredentials.test.js, pstnDigest.test.js, storeGateways.test.js, twilioAccountAuth.test.js, twilioAutoSetup.test.js, twilioCredentials.test.js, twilioHub.test.js, twilioRoles.test.js, walletProviders.test.js | handleProviderCredentials |
| providerManager | False | False | providerManager.test.js | library / CLI / no direct reference |
| providerWebhooks | True | True | providerWebhooks.test.js | handleProviderWebhook, handleProviderWebhookAdmin |
| providers | True | False | flowrouteInventoryEndpoint.test.js, inventoryFailure.test.js, providers.test.js | library / CLI / no direct reference |
| pstnBilling | True | False | flowrouteSettlement.test.js, outboundDids.test.js, pstnBilling.test.js, pstnDigest.test.js, telecomModules.integration.test.js | library / CLI / no direct reference |
| quickSignup | True | False | quickSignup.test.js | handleQuickSignup, handleQuickProfile |
| refreshSipAuth | False | False | refreshSipAuth.test.js | library / CLI / no direct reference |
| registrationSafety | True | False | registrationSafety.test.js | library / CLI / no direct reference |
| repairFlowrouteProfile | False | False | none identified | library / CLI / no direct reference |
| repairSipDomain | False | False | repairSipDomain.test.js | library / CLI / no direct reference |
| reports | True | False | reports.test.js | handleReports |
| requestLimits | True | False | requestLimits.test.js | library / CLI / no direct reference |
| scheduledCalls | True | True | scheduledCalls.test.js | handleScheduledCalls |
| search | True | False | support.test.js | handleSearch |
| security | True | False | apiBridge.test.js, security.test.js, sessionPolicy.test.js | library / CLI / no direct reference |
| server | False | False | routeContracts.test.js | library / CLI / no direct reference |
| serverFleet | True | True | serverFleet.test.js | handleServerFleetAdmin, handleServerFleetRunner |
| serviceInventory | True | False | serviceInventory.test.js | library / CLI / no direct reference |
| sessionPolicy | True | True | sessionPolicy.test.js | handleSessionPolicy |
| signupCaptcha | True | False | captchaRegistration.test.js, integration.test.js, onboarding.test.js, quickSignup.test.js, signupCaptcha.test.js | library / CLI / no direct reference |
| sipLiveCheck | False | False | none identified | library / CLI / no direct reference |
| sipMarketplace | True | True | apiBridge.test.js, automaticSipSession.test.js, refreshSipAuth.test.js, repairSipDomain.test.js, sipProvisioning.test.js | handleSipMarketplace |
| sipProbeAccount | False | False | sipProbeAccount.test.js | library / CLI / no direct reference |
| sipProfiles | True | True | sipProfiles.test.js | handleSipProfiles |
| sipProvisioning | True | True | sipProvisioning.test.js | handleSipProvisioning, startSipProvisioning |
| sipRegisterDigest | False | False | sipRegisterDigest.test.js | library / CLI / no direct reference |
| smoothDid | False | False | smoothDid.test.js | library / CLI / no direct reference |
| smsCredentials | False | False | smsCredentials.test.js | library / CLI / no direct reference |
| smsHistory | True | False | smsHistory.test.js | library / CLI / no direct reference |
| smsRouteControl | False | False | smsRouteControl.test.js | library / CLI / no direct reference |
| social | True | True | social.test.js | handleSocial |
| socialLinks | True | False | socialLinks.test.js | library / CLI / no direct reference |
| socialOAuth | True | False | socialOAuth.test.js | library / CLI / no direct reference |
| socialPublishing | True | False | socialOAuth.test.js, socialPublishing.test.js | library / CLI / no direct reference |
| softphoneState | True | True | softphoneState.test.js | handleSoftphoneState |
| storeGateways | True | True | storeGateways.integration.test.js, storeGateways.test.js | handleStoreGateways |
| subscriberDelivery | True | True | subscriberDelivery.test.js | handleSubscriberSettings, startSubscriberEmail |
| subscriberRouting | True | True | smsRouteControl.test.js, subscriberRouting.test.js | handleSubscriberRouting, startSubscriberDelivery |
| support | True | True | support.test.js | handleSupport |
| switch | True | True | switch.test.js | library / CLI / no direct reference |
| tariffCatalog | True | True | tariffCatalog.integration.test.js, tariffCatalog.test.js | handleTariffCatalog |
| telecomAnalytics | True | False | telecomModules.integration.test.js | handleTelecomAnalytics |
| telecomFeatures | True | False | telecomFeatures.test.js | handleTelecomFeatures |
| telecomPolicies | True | True | telecomModules.integration.test.js, telecomPolicies.test.js | handleTelecomPolicies |
| telecomRefills | True | True | telecomModules.integration.test.js, telecomRefills.test.js | handleTelecomRefills |
| telecomReports | True | True | telecomModules.integration.test.js, telecomReports.test.js | handleTelecomReports, startTelecomReports |
| telecomResources | True | False | telecomResources.test.js | handleTelecomResources |
| tenancy | True | True | authProviders.test.js, quickSignup.test.js, tenancy.test.js | handleTenants |
| trunkManagement | True | True | trunkManagement.test.js | library / CLI / no direct reference |
| turn | True | False | turn.test.js | library / CLI / no direct reference |
| twilioAccountAuth | True | False | twilioAccountAuth.test.js | library / CLI / no direct reference |
| twilioAutoSetup | False | False | twilioAutoSetup.test.js | library / CLI / no direct reference |
| twilioCredentials | False | False | twilioCredentials.test.js | library / CLI / no direct reference |
| twilioDidCore | False | False | twilioDidCore.test.js | library / CLI / no direct reference |
| twilioDids | False | False | none identified | library / CLI / no direct reference |
| twilioHub | True | False | twilioCredentials.test.js, twilioHub.test.js, twilioRoles.test.js | library / CLI / no direct reference |
| twilioReadiness | False | False | twilioReadiness.test.js | library / CLI / no direct reference |
| twilioRoles | False | False | twilioRoles.test.js | library / CLI / no direct reference |
| userActivity | True | True | userActivity.test.js | handleUserActivity |
| userAppearance | False | False | userAppearance.test.js | library / CLI / no direct reference |
| userCallerId | False | False | userCallerId.test.js | library / CLI / no direct reference |
| voicemail | True | False | voicemail.test.js | handleVoicemail |
| vpn | True | False | vpn.test.js | handleVpn |
| wallet | True | True | moneyRequests.test.js, wallet.test.js | handleWallet |
| walletProviders | True | False | walletProviders.test.js | handleWalletProviderAdmin |
| walletPurchases | True | False | walletPurchases.test.js | library / CLI / no direct reference |
| workPlanner | True | True | featureWorkflows.test.js | handleWorkPlanner |
| workspaceShortcuts | True | True | workspaceShortcuts.test.js | handleWorkspaceShortcuts |

## Client sources

| Source | Client | Device acceptance |
| --- | --- | --- |
| apps/web/index.html | web | unverified |
| apps/web/navigationTestSupport.js | web | unverified |
| apps/web/public/install/device-install.js | web | unverified |
| apps/web/public/install/index.html | web | unverified |
| apps/web/public/justisolve-connect.html | web | unverified |
| apps/web/public/justisolve-connect.js | web | unverified |
| apps/web/public/offline.html | web | unverified |
| apps/web/public/privacy/index.html | web | unverified |
| apps/web/public/social-oauth-callback.html | web | unverified |
| apps/web/public/social-oauth-callback.js | web | unverified |
| apps/web/public/sw.js | web | unverified |
| apps/web/public/terms/index.html | web | unverified |
| apps/web/public/welcome/home.js | web | unverified |
| apps/web/public/welcome/index.html | web | unverified |
| apps/web/src/accountRanges.js | web | unverified |
| apps/web/src/adapterAdmin.js | web | unverified |
| apps/web/src/addressBookImport.js | web | unverified |
| apps/web/src/adminGroup.js | web | unverified |
| apps/web/src/adminMonitoringUi.js | web | unverified |
| apps/web/src/adminNavigation.js | web | unverified |
| apps/web/src/adminStatusIcons.js | web | unverified |
| apps/web/src/adminWorkspaceUi.js | web | unverified |
| apps/web/src/advancedCalling.js | web | unverified |
| apps/web/src/advancedTelecomNavigation.js | web | unverified |
| apps/web/src/apiBridgeUi.js | web | unverified |
| apps/web/src/appearanceDefaults.js | web | unverified |
| apps/web/src/authProviders.js | web | unverified |
| apps/web/src/autoSipRegistration.js | web | unverified |
| apps/web/src/background.js | web | unverified |
| apps/web/src/backgroundCalls.js | web | unverified |
| apps/web/src/callGui.js | web | unverified |
| apps/web/src/callIdentity.js | web | unverified |
| apps/web/src/callerIdentityAdmin.js | web | unverified |
| apps/web/src/callerVerificationUi.js | web | unverified |
| apps/web/src/callsScreen.js | web | unverified |
| apps/web/src/campaigns.js | web | unverified |
| apps/web/src/carrierConsole.js | web | unverified |
| apps/web/src/carrierControl.js | web | unverified |
| apps/web/src/carrierProfileForm.js | web | unverified |
| apps/web/src/catalogControl.js | web | unverified |
| apps/web/src/chatComposerShortcuts.js | web | unverified |
| apps/web/src/chatGestures.js | web | unverified |
| apps/web/src/chatLanding.js | web | unverified |
| apps/web/src/chatPresentation.js | web | unverified |
| apps/web/src/commerceOps.js | web | unverified |
| apps/web/src/configurationLinks.js | web | unverified |
| apps/web/src/contactCard.js | web | unverified |
| apps/web/src/contactDirectory.js | web | unverified |
| apps/web/src/contactDiscovery.js | web | unverified |
| apps/web/src/contactManagerLayout.js | web | unverified |
| apps/web/src/contactsCsv.js | web | unverified |
| apps/web/src/conversations.js | web | unverified |
| apps/web/src/dashboard.js | web | unverified |
| apps/web/src/dialIdentityInput.js | web | unverified |
| apps/web/src/dialerContacts.js | web | unverified |
| apps/web/src/dialingAdmin.js | web | unverified |
| apps/web/src/dialpad.js | web | unverified |
| apps/web/src/didAvailabilityUi.js | web | unverified |
| apps/web/src/didwwAdmin.js | web | unverified |
| apps/web/src/didwwProvisionAdmin.js | web | unverified |
| apps/web/src/downloads.js | web | unverified |
| apps/web/src/fleetAccessAdmin.js | web | unverified |
| apps/web/src/fleetFirewallAdmin.js | web | unverified |
| apps/web/src/fleetNetworkAdmin.js | web | unverified |
| apps/web/src/flowrouteSetup.js | web | unverified |
| apps/web/src/flowrouteTrunkAdmin.js | web | unverified |
| apps/web/src/formGroups.js | web | unverified |
| apps/web/src/geoCallingUi.js | web | unverified |
| apps/web/src/geofence.js | web | unverified |
| apps/web/src/geofenceLocation.js | web | unverified |
| apps/web/src/googleContacts.js | web | unverified |
| apps/web/src/groups.js | web | unverified |
| apps/web/src/hpInterconnectUi.js | web | unverified |
| apps/web/src/icnUi.js | web | unverified |
| apps/web/src/inboundRoutingUi.js | web | unverified |
| apps/web/src/install.js | web | unverified |
| apps/web/src/kamailioAdmin.js | web | unverified |
| apps/web/src/languageTools.js | web | unverified |
| apps/web/src/ldapAdmin.js | web | unverified |
| apps/web/src/liveCallsUi.js | web | unverified |
| apps/web/src/localeSettings.js | web | unverified |
| apps/web/src/locationHistory.js | web | unverified |
| apps/web/src/locationReportCsv.js | web | unverified |
| apps/web/src/locationReports.js | web | unverified |
| apps/web/src/main.js | web | unverified |
| apps/web/src/marketplaceControl.js | web | unverified |
| apps/web/src/meetingInvite.js | web | unverified |
| apps/web/src/meetings.js | web | unverified |
| apps/web/src/messagePrivacy.js | web | unverified |
| apps/web/src/messengerHub.js | web | unverified |
| apps/web/src/messengerIcons.js | web | unverified |
| apps/web/src/messengerMedia.js | web | unverified |
| apps/web/src/messengerOverflow.js | web | unverified |
| apps/web/src/messengerPreferences.js | web | unverified |
| apps/web/src/messengerSettings.js | web | unverified |
| apps/web/src/mobileAdmin.js | web | unverified |
| apps/web/src/moduleReadiness.js | web | unverified |
| apps/web/src/moneyWorkspace.js | web | unverified |
| apps/web/src/nativeCallClient.js | web | unverified |
| apps/web/src/nativeEmergency.js | web | unverified |
| apps/web/src/nativePushClient.js | web | unverified |
| apps/web/src/navigationPolicy.js | web | unverified |
| apps/web/src/operationsAdmin.js | web | unverified |
| apps/web/src/operatorControl.js | web | unverified |
| apps/web/src/pageRoutes.js | web | unverified |
| apps/web/src/passkeyPolicy.js | web | unverified |
| apps/web/src/pbx.js | web | unverified |
| apps/web/src/pbxBranding.js | web | unverified |
| apps/web/src/phoneContacts.js | web | unverified |
| apps/web/src/phoneSettingsUi.js | web | unverified |
| apps/web/src/phoneSignal.js | web | unverified |
| apps/web/src/pricing.js | web | unverified |
| apps/web/src/productImport.js | web | unverified |
| apps/web/src/productStore.js | web | unverified |
| apps/web/src/profilePhoto.js | web | unverified |
| apps/web/src/providerCredentialsAdmin.js | web | unverified |
| apps/web/src/providerLabels.js | web | unverified |
| apps/web/src/providerManagerUi.js | web | unverified |
| apps/web/src/providerWebhookAdmin.js | web | unverified |
| apps/web/src/quickSignup.js | web | unverified |
| apps/web/src/registrationFeedback.js | web | unverified |
| apps/web/src/reports.js | web | unverified |
| apps/web/src/serverFleetAdmin.js | web | unverified |
| apps/web/src/sessionAdmin.js | web | unverified |
| apps/web/src/sessionWatch.js | web | unverified |
| apps/web/src/signupCaptcha.js | web | unverified |
| apps/web/src/singleAuth.js | web | unverified |
| apps/web/src/sipProfiles.js | web | unverified |
| apps/web/src/sipRegistration.js | web | unverified |
| apps/web/src/smoothDidUi.js | web | unverified |
| apps/web/src/smsAppearance.js | web | unverified |
| apps/web/src/smsConversations.js | web | unverified |
| apps/web/src/smsRouteControlUi.js | web | unverified |
| apps/web/src/smsTools.js | web | unverified |
| apps/web/src/socialLinks.js | web | unverified |
| apps/web/src/socialPublishing.js | web | unverified |
| apps/web/src/socialWorkspace.js | web | unverified |
| apps/web/src/softphoneMedia.js | web | unverified |
| apps/web/src/subscriberDelivery.js | web | unverified |
| apps/web/src/support.js | web | unverified |
| apps/web/src/tariffCatalog.js | web | unverified |
| apps/web/src/telecomFeatures.js | web | unverified |
| apps/web/src/telecomPolicies.js | web | unverified |
| apps/web/src/telecomRefills.js | web | unverified |
| apps/web/src/telecomReports.js | web | unverified |
| apps/web/src/tenants.js | web | unverified |
| apps/web/src/trunkAdmin.js | web | unverified |
| apps/web/src/twilioAccountAuthUi.js | web | unverified |
| apps/web/src/twilioCredentialControls.js | web | unverified |
| apps/web/src/twilioDidUi.js | web | unverified |
| apps/web/src/twilioHubUi.js | web | unverified |
| apps/web/src/twilioReadinessUi.js | web | unverified |
| apps/web/src/twilioRolesUi.js | web | unverified |
| apps/web/src/userActivity.js | web | unverified |
| apps/web/src/userAppearanceUi.js | web | unverified |
| apps/web/src/userCallerIdAdmin.js | web | unverified |
| apps/web/src/userNavigation.js | web | unverified |
| apps/web/src/userProvisionControls.js | web | unverified |
| apps/web/src/voicemailUi.js | web | unverified |
| apps/web/src/vpnNativeClient.js | web | unverified |
| apps/web/src/vpnUi.js | web | unverified |
| apps/web/src/walletProvidersAdmin.js | web | unverified |
| apps/web/src/workPlanner.js | web | unverified |
| apps/web/src/workspaceNavigation.js | web | unverified |
| apps/web/src/workspaceQuick.js | web | unverified |
| apps/web/vite.config.js | web | unverified |
| apps/mobile/callkit-native/OlamideCallKit.swift | mobile | unverified |
| apps/mobile/carrier-native/CarrierBrandPlugin.java | mobile | unverified |
| apps/mobile/carrier-native/MainActivity.java | mobile | unverified |
| apps/mobile/configure-call-permissions.py | mobile | unverified |
| apps/mobile/configure-contacts.py | mobile | unverified |
| apps/mobile/generate-brand-artwork.py | mobile | unverified |
| apps/mobile/install-callkit.rb | mobile | unverified |
| apps/mobile/install-carrier-native.sh | mobile | unverified |
| apps/mobile/install-native-push.py | mobile | unverified |
| apps/mobile/install-vpn-native.py | mobile | unverified |
| apps/mobile/prepare-play-release.py | mobile | unverified |
| apps/mobile/push-native/NativePushPlugin.java | mobile | unverified |
| apps/mobile/push-native/OlamideCallService.java | mobile | unverified |
| apps/mobile/push-native/OlamideMessagingService.java | mobile | unverified |
| apps/mobile/vpn-native/OlamideVpnPlugin.java | mobile | unverified |
| apps/mobile/www/index.html | mobile | unverified |
| apps/desktop/main.cjs | desktop | unverified |

## Feature review queue

| Feature | Declared implementation | Remaining scope / evidence |
| --- | --- | --- |
| Account Range | implemented | Tenant-scoped customer account-number ranges with stable allocation, range exhaustion checks and audit records. Separate from SIP usernames and native Olamide SIP account IDs. |
| Alarms | partial | Server monitoring exists; trunk and call-event alarms are incomplete. |
| Automated Report | implemented | Scheduled usage and invoice summaries persist generated results and support authenticated retrieval. Mail retries are durable and tenant scoped. Authorized mail credentials and inbox acceptance testing are required. |
| Access Control | partial | Role and navigation permissions exist; portal/API IP rules need implementation. |
| Advanced SIP Routing | partial | Route preview and fraud rules exist; cause-based extension failover is not installed. |
| Automated CDRs | partial | Scheduled bounded raw CDR CSV.gz archives and summary reports are implemented. Archives retain originals, enforce tenant isolation and include SHA-256 checksums. External cold storage and continuous full-history archival remain pending. |
| ACL Management | partial | Network controls exist; a unified SIP ACL module is incomplete. |
| Country Reports | implemented | Settled paid-call usage and USD revenue are grouped by configured longest country or numbering-region prefixes. Unmapped destinations remain Unclassified. |
| Demand-Based Routing | partial | UTC weekday calling-window policies are enforced in paid-call authorization. Carrier selection by time window remains pending. |
| DID Call Transfer | not_implemented | Disposition-based DID failover is not installed. |
| Fax over IP | external_dependency | Requires a fax engine, storage and provider/media integration. |
| Fraud Detection | partial | Destination blocks and prepaid concurrency checks exist; anomaly detection is incomplete. |
| International Credit Management | implemented | Per-user monthly international USD budgets include outstanding reservations and current-month settled charges under the tenant billing lock. Home-prefix calls use the normal wallet budget. Live call acceptance is unverified. |
| Local Number | partial | DID inventory exists; shared-DID service routing is incomplete. |
| Logs | partial | Operations controls exist; redacted live service-log streaming is incomplete. |
| Languages | partial | Language/locale settings exist; full interface translation coverage is incomplete. |
| Mailchimp | external_dependency | Requires an integration implementation and authorized Mailchimp credentials. |
| Multi-Tenant IP PBX | partial | Tenant-scoped PBX records exist; live IVR, queues and voicemail need a media/PBX engine. |
| Number Portability Service | partial | Port-request records exist; global portability lookup requires a data provider. |
| Ported Number—South Africa | external_dependency | Requires a South African portability dataset/API and implementation. |
| Personalized Rates | implemented | Account-specific longest-prefix USD rates and billing intervals are applied to prepaid reservations and settlement. Active carrier coverage remains required. Live call acceptance is unverified. |
| Payfast | external_dependency | Requires a signed webhook/payment integration and merchant credentials. |
| Rate Simulator | partial | A tariff route preview exists; it does not prove live switch rating. |
| Stripe Payment Gateway | partial | Stripe management exists; every advertised payment flow is not implemented. |
| Support Ticket | implemented | Existing tenant-scoped tickets, replies and status actions are available. |
| Schedule Reports | implemented | Durable per-administrator report schedules, row-locked job claims, persisted snapshots, bounded retries, provider idempotency and mail-attempt history are implemented. Authorized mail credentials and inbox acceptance testing are required. |
| Shadow Billing | implemented | An independent, idempotent comparison ledger snapshots configured shadow rates at reservation and records actual versus shadow charges at settlement without changing wallets. Live event acceptance is unverified. |
| Switch Monitoring | partial | Kamailio readiness exists. Native FreeSWITCH monitoring is outside the selected architecture. |
| Two-Factor Authentication | partial | Passkeys and OTP flows exist; exact vendor MFA parity is not established. |
| WHMCS integration | external_dependency | Requires a WHMCS connector and authorized API account. |
| Zoho CRM integration | external_dependency | Requires CRM connector implementation and OAuth authorization. |
| Salesforce integration | external_dependency | Requires CRM connector implementation and OAuth authorization. |
| STIR/SHAKEN | external_dependency | Requires approved signing credentials, certificate lifecycle and SIP integration. |
| Mobile Dialer | partial | App download controls exist; native background-calling acceptance remains separate. |
| PC Dialer | partial | Web calling exists; full desktop dialer parity is not established. |
| Prepaid & postpaid charging | partial | Kamailio prepaid deployment exists. Postpaid, prorating, bundles and surcharge rules remain incomplete. |
| DID lifecycle | partial | Inventory/provider controls exist; full purchase/release/recurring lifecycle depends on integrations. |
| Call center & autodialer | partial | PBX/call-center controls exist; live AMD, IVR, conferencing and interception need compatible engines. |
| SMS delivery & billing | partial | SMS endpoints exist; provider acceptance and full SMS rating remain incomplete. |
| Resellers & commissions | partial | Authorized tenant reseller stores, catalogs, orders and delegated payment gateway management are implemented. Hierarchical carrier rating, commissions and provider portals remain incomplete. |
| Archive, purge & cron | partial | Tenant-scoped manual and scheduled compressed CDR archives, authenticated downloads and archive-copy removal are implemented. Automatic original-record retention/deletion and external cold storage are not implemented. |
| n8n integration | external_dependency | Requires authenticated workflow connectors and an n8n instance. |
| Overview | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Customers | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Providers | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Roles & permissions | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| SIP devices & extensions | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| IP authentication | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Caller IDs & CLI pools | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Switch servers | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Call barring | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Number localization | implemented | Numeric prefix normalization is enforced once at paid-call authorization and passed to the validated carrier handoff. Configure destination rules and deploy the updated paid-call route; live call acceptance remains unverified. |
| Rate groups | implemented | Manage enabled rate groups, tenant-scoped user assignments and destination rates. The paid-call engine applies group rates alongside account and caller-ID policies. Native-console synchronization is separate; live call acceptance is unverified. |
| Origination rates | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Rate decks | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Call types | implemented | Manage call types and destination classification rules; paid-call records snapshot the matched type for usage and charge reports. Native-console synchronization is separate. |
| Gateways | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Trunks | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Termination rates | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Routing strategies | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Invoices | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Caller ID based billing | implemented | Authorized outbound caller-ID rate overrides are applied to prepaid reservations and settlement. Longest prefix wins; account overrides win ties. Live call acceptance is unverified. |
| Charge history | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Refill history | implemented | Administrator-funded USD wallet refills have an immutable ledger, stable retry IDs, locked balance updates, tenant checks and audit events. An administrator must separately verify the funding; external settlement is not inferred. |
| Packages & subscriptions | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Products & orders | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Inbound routes | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| DID inventory | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Vanity numbers | not_implemented | Vanity inventory classification is not implemented. |
| Port requests | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Call detail records | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Usage & financial summary | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Audit log | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Payment reports | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Commission reports | not_implemented | Reseller commission ledger and settlement require implementation. |
| Low balance report | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Email history | partial | Report mail attempts, retries and provider acceptance are visible. A unified delivery history across account verification, subscriber forwarding and all external mail remains pending. |
| Live calls & control | not_implemented | Live SIP dialog control requires switch RPC integration. |
| System settings | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Company profiles | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Templates | not_implemented | Dedicated invoice and email template editor requires implementation. |
| Taxes | not_implemented | Tax assessment and invoice tax lines require implementation. |
| Countries & currencies | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Database backup | not_implemented | Use reviewed database backup operations; no browser backup executor is installed. |
| Calling cards | not_implemented | Requires the native Olamide SIP calling-card application and supported switch integration. |
| Mass email | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |

## Kamailio review queue

Each catalog entry needs a compatible reviewed profile and per-node runtime evidence. No entry is marked installed by this source audit.

| Module | Declared maturity | Installation / runtime / acceptance |
| --- | --- | --- |
| acc | released | unverified / unverified / unverified |
| acc_diameter | alpha | unverified / unverified / unverified |
| acc_json | released | unverified / unverified / unverified |
| acc_radius | released | unverified / unverified / unverified |
| alias_db | released | unverified / unverified / unverified |
| app_java | released | unverified / unverified / unverified |
| app_jsdt | released | unverified / unverified / unverified |
| app_lua | released | unverified / unverified / unverified |
| app_lua_sr | released | unverified / unverified / unverified |
| app_mono | released | unverified / unverified / unverified |
| app_perl | released | unverified / unverified / unverified |
| app_python | released | unverified / unverified / unverified |
| app_python3 | released | unverified / unverified / unverified |
| app_python3s | released | unverified / unverified / unverified |
| app_ruby | released | unverified / unverified / unverified |
| app_ruby_proc | released | unverified / unverified / unverified |
| app_sqlang | archived | unverified / unverified / unverified |
| async | released | unverified / unverified / unverified |
| auth | released | unverified / unverified / unverified |
| auth_arnacon | new | unverified / unverified / unverified |
| auth_db | released | unverified / unverified / unverified |
| auth_diameter | alpha | unverified / unverified / unverified |
| auth_ephemeral | released | unverified / unverified / unverified |
| auth_identity | archived | unverified / unverified / unverified |
| auth_radius | released | unverified / unverified / unverified |
| auth_web3 | new | unverified / unverified / unverified |
| auth_xkeys | released | unverified / unverified / unverified |
| avp | from-ser | unverified / unverified / unverified |
| avpops | released | unverified / unverified / unverified |
| benchmark | released | unverified / unverified / unverified |
| blst | released | unverified / unverified / unverified |
| call_control | released | unverified / unverified / unverified |
| call_obj | released | unverified / unverified / unverified |
| carrierroute | released | unverified / unverified / unverified |
| cdp | released | unverified / unverified / unverified |
| cdp_avp | released | unverified / unverified / unverified |
| cfg_db | released | unverified / unverified / unverified |
| cfg_rpc | released | unverified / unverified / unverified |
| cfgutils | released | unverified / unverified / unverified |
| cfgt | released | unverified / unverified / unverified |
| cnxcc | released | unverified / unverified / unverified |
| corex | released | unverified / unverified / unverified |
| counters | released | unverified / unverified / unverified |
| cplc | renamed | unverified / unverified / unverified |
| crypto | released | unverified / unverified / unverified |
| ctl | released | unverified / unverified / unverified |
| db_berkeley | released | unverified / unverified / unverified |
| db_cassandra | released | unverified / unverified / unverified |
| db_cluster | released | unverified / unverified / unverified |
| db_flatstore | released | unverified / unverified / unverified |
| db_mongodb | released | unverified / unverified / unverified |
| db_mysql | released | unverified / unverified / unverified |
| db_oracle | released | unverified / unverified / unverified |
| db_perlvdb | released | unverified / unverified / unverified |
| db_postgres | released | unverified / unverified / unverified |
| db_redis | released | unverified / unverified / unverified |
| db_sqlite | released | unverified / unverified / unverified |
| db_text | released | unverified / unverified / unverified |
| db_unixodbc | released | unverified / unverified / unverified |
| db2_ldap | from-ser | unverified / unverified / unverified |
| db2_ops | from-ser | unverified / unverified / unverified |
| debugger | released | unverified / unverified / unverified |
| dialog | released | unverified / unverified / unverified |
| dialplan | released | unverified / unverified / unverified |
| dispatcher | released | unverified / unverified / unverified |
| diversion | released | unverified / unverified / unverified |
| dlgs | released | unverified / unverified / unverified |
| dmq | released | unverified / unverified / unverified |
| dmq_usrloc | released | unverified / unverified / unverified |
| dnssec | released | unverified / unverified / unverified |
| domain | released | unverified / unverified / unverified |
| domainpolicy | released | unverified / unverified / unverified |
| drouting | released | unverified / unverified / unverified |
| enum | released | unverified / unverified / unverified |
| erlang | released | unverified / unverified / unverified |
| evapi | released | unverified / unverified / unverified |
| evrexec | released | unverified / unverified / unverified |
| exec | released | unverified / unverified / unverified |
| file_out | released | unverified / unverified / unverified |
| gcrypt | released | unverified / unverified / unverified |
| geoip | released | unverified / unverified / unverified |
| geoip2 | released | unverified / unverified / unverified |
| group | released | unverified / unverified / unverified |
| gzcompress | released | unverified / unverified / unverified |
| h350 | released | unverified / unverified / unverified |
| htable | released | unverified / unverified / unverified |
| http_client | released | unverified / unverified / unverified |
| http_async_client | released | unverified / unverified / unverified |
| ims_auth | released | unverified / unverified / unverified |
| ims_charging | released | unverified / unverified / unverified |
| ims_dialog | released | unverified / unverified / unverified |
| ims_diameter_server | released | unverified / unverified / unverified |
| ims_icscf | released | unverified / unverified / unverified |
| ims_ipsec_pcscf | released | unverified / unverified / unverified |
| ims_isc | released | unverified / unverified / unverified |
| ims_ocs | released | unverified / unverified / unverified |
| ims_qos | released | unverified / unverified / unverified |
| ims_qos_npn | released | unverified / unverified / unverified |
| ims_registrar_pcscf | released | unverified / unverified / unverified |
| ims_registrar_scscf | released | unverified / unverified / unverified |
| ims_usrloc_pcscf | released | unverified / unverified / unverified |
| ims_usrloc_scscf | released | unverified / unverified / unverified |
| imc | released | unverified / unverified / unverified |
| influxdbc | released | unverified / unverified / unverified |
| ipops | released | unverified / unverified / unverified |
| jansson | released | unverified / unverified / unverified |
| janssonrpcc | renamed | unverified / unverified / unverified |
| json | released | unverified / unverified / unverified |
| jsonrpcc | renamed | unverified / unverified / unverified |
| jsonrpcs | renamed | unverified / unverified / unverified |
| jwt | released | unverified / unverified / unverified |
| kafka | released | unverified / unverified / unverified |
| kazoo | released | unverified / unverified / unverified |
| keepalive | released | unverified / unverified / unverified |
| kemix | released | unverified / unverified / unverified |
| kex | released | unverified / unverified / unverified |
| lcr | released | unverified / unverified / unverified |
| lrkproxy | released | unverified / unverified / unverified |
| ldap | released | unverified / unverified / unverified |
| log_custom | released | unverified / unverified / unverified |
| log_systemd | released | unverified / unverified / unverified |
| lost | released | unverified / unverified / unverified |
| lwsc | released | unverified / unverified / unverified |
| mangler | from-ser | unverified / unverified / unverified |
| math | released | unverified / unverified / unverified |
| matrix | released | unverified / unverified / unverified |
| maxfwd | released | unverified / unverified / unverified |
| mediaproxy | released | unverified / unverified / unverified |
| memcached | released | unverified / unverified / unverified |
| misc_radius | released | unverified / unverified / unverified |
| microhttpd | released | unverified / unverified / unverified |
| misctest | released | unverified / unverified / unverified |
| mohqueue | released | unverified / unverified / unverified |
| mqtt | released | unverified / unverified / unverified |
| mqueue | released | unverified / unverified / unverified |
| msilo | released | unverified / unverified / unverified |
| msrp | released | unverified / unverified / unverified |
| mtree | released | unverified / unverified / unverified |
| nathelper | released | unverified / unverified / unverified |
| nats | released | unverified / unverified / unverified |
| nat_traversal | released | unverified / unverified / unverified |
| ndb_cassandra | released | unverified / unverified / unverified |
| ndb_mongodb | released | unverified / unverified / unverified |
| ndb_redis | released | unverified / unverified / unverified |
| nghttp2 | released | unverified / unverified / unverified |
| nosip | released | unverified / unverified / unverified |
| nsq | released | unverified / unverified / unverified |
| osp | released | unverified / unverified / unverified |
| outbound | released | unverified / unverified / unverified |
| p_usrloc | released | unverified / unverified / unverified |
| path | released | unverified / unverified / unverified |
| pdb | released | unverified / unverified / unverified |
| pdt | released | unverified / unverified / unverified |
| peering | released | unverified / unverified / unverified |
| peerstate | new | unverified / unverified / unverified |
| permissions | released | unverified / unverified / unverified |
| phonenum | released | unverified / unverified / unverified |
| pike | released | unverified / unverified / unverified |
| pipelimit | released | unverified / unverified / unverified |
| posops | released | unverified / unverified / unverified |
| prefix_route | released | unverified / unverified / unverified |
| presence | released | unverified / unverified / unverified |
| presence_conference | released | unverified / unverified / unverified |
| presence_dialoginfo | released | unverified / unverified / unverified |
| presence_dfks | released | unverified / unverified / unverified |
| presence_mwi | released | unverified / unverified / unverified |
| presence_profile | released | unverified / unverified / unverified |
| presence_xml | released | unverified / unverified / unverified |
| presence_reginfo | released | unverified / unverified / unverified |
| print | from-ser | unverified / unverified / unverified |
| print_lib | from-ser | unverified / unverified / unverified |
| ptimer | new | unverified / unverified / unverified |
| pua | released | unverified / unverified / unverified |
| pua_bla | released | unverified / unverified / unverified |
| pua_dialoginfo | released | unverified / unverified / unverified |
| pua_json | released | unverified / unverified / unverified |
| pua_reginfo | released | unverified / unverified / unverified |
| pua_rpc | released | unverified / unverified / unverified |
| pua_usrloc | released | unverified / unverified / unverified |
| pua_xmpp | released | unverified / unverified / unverified |
| purple | released | unverified / unverified / unverified |
| pv | released | unverified / unverified / unverified |
| pv_headers | released | unverified / unverified / unverified |
| pvtpl | old | unverified / unverified / unverified |
| qos | released | unverified / unverified / unverified |
| rabbitmq | released | unverified / unverified / unverified |
| ratelimit | released | unverified / unverified / unverified |
| regex | released | unverified / unverified / unverified |
| registrar | released | unverified / unverified / unverified |
| rls | released | unverified / unverified / unverified |
| rr | released | unverified / unverified / unverified |
| rtimer | released | unverified / unverified / unverified |
| rtjson | released | unverified / unverified / unverified |
| rtp_media_server | released | unverified / unverified / unverified |
| rtpengine | released | unverified / unverified / unverified |
| rtpproxy | released | unverified / unverified / unverified |
| ruxc | released | unverified / unverified / unverified |
| sanity | released | unverified / unverified / unverified |
| sca | released | unverified / unverified / unverified |
| sctp | released | unverified / unverified / unverified |
| sdpops | released | unverified / unverified / unverified |
| seas | released | unverified / unverified / unverified |
| secsipid | released | unverified / unverified / unverified |
| secsipid_proc | released | unverified / unverified / unverified |
| secfilter | released | unverified / unverified / unverified |
| sipcapture | released | unverified / unverified / unverified |
| sipdump | released | unverified / unverified / unverified |
| siprepo | released | unverified / unverified / unverified |
| sipt | released | unverified / unverified / unverified |
| siptrace | released | unverified / unverified / unverified |
| siputils | released | unverified / unverified / unverified |
| sl | released | unverified / unverified / unverified |
| slack | released | unverified / unverified / unverified |
| sms | released | unverified / unverified / unverified |
| smsops | released | unverified / unverified / unverified |
| snmpstats | released | unverified / unverified / unverified |
| speeddial | released | unverified / unverified / unverified |
| sqlops | released | unverified / unverified / unverified |
| ss7ops | released | unverified / unverified / unverified |
| sst | released | unverified / unverified / unverified |
| statistics | released | unverified / unverified / unverified |
| statsc | released | unverified / unverified / unverified |
| statsd | released | unverified / unverified / unverified |
| stirshaken | released | unverified / unverified / unverified |
| stun | released | unverified / unverified / unverified |
| sworker | released | unverified / unverified / unverified |
| systemdops | released | unverified / unverified / unverified |
| tcpops | released | unverified / unverified / unverified |
| textops | released | unverified / unverified / unverified |
| textopsx | released | unverified / unverified / unverified |
| timer | from-ser | unverified / unverified / unverified |
| tls | released | unverified / unverified / unverified |
| tlsa | released | unverified / unverified / unverified |
| tls_wolfssl | released | unverified / unverified / unverified |
| tm | released | unverified / unverified / unverified |
| tmrec | released | unverified / unverified / unverified |
| tmx | released | unverified / unverified / unverified |
| topoh | released | unverified / unverified / unverified |
| topos | released | unverified / unverified / unverified |
| topos_htable | released | unverified / unverified / unverified |
| topos_redis | released | unverified / unverified / unverified |
| tsilo | released | unverified / unverified / unverified |
| uac | released | unverified / unverified / unverified |
| uac_redirect | released | unverified / unverified / unverified |
| uid_auth_db | from-ser | unverified / unverified / unverified |
| uid_avp_db | from-ser | unverified / unverified / unverified |
| uid_domain | from-ser | unverified / unverified / unverified |
| uid_gflags | from-ser | unverified / unverified / unverified |
| uid_uri_db | from-ser | unverified / unverified / unverified |
| uri_db | released | unverified / unverified / unverified |
| userblocklist | released | unverified / unverified / unverified |
| usrloc | released | unverified / unverified / unverified |
| utils | released | unverified / unverified / unverified |
| uuid | released | unverified / unverified / unverified |
| websocket | released | unverified / unverified / unverified |
| xcap_client | released | unverified / unverified / unverified |
| xcap_server | released | unverified / unverified / unverified |
| xhttp | released | unverified / unverified / unverified |
| xhttp_pi | released | unverified / unverified / unverified |
| xhttp_prom | released | unverified / unverified / unverified |
| xhttp_rpc | released | unverified / unverified / unverified |
| xlog | released | unverified / unverified / unverified |
| xmlops | released | unverified / unverified / unverified |
| xmlrpc | released | unverified / unverified / unverified |
| xmpp | released | unverified / unverified / unverified |
| xprint | from-ser | unverified / unverified / unverified |
