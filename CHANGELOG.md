# Changelog

All notable changes to this project are documented in this file. This changelog is maintained per release and follows the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.

## [Unreleased]
### Added
- `@spooder/plugin-sdk` workspace package, exporting `PluginBase` and shared plugin types, so both legacy plugins (importing types from the core app's `Types.ts`) and modern plugins (importing from `@spooder/plugin-sdk` directly) work from a single source of truth.
- Overlay container backend: `OverlayContainerRoutes.ts` (`/overlay_container/config`, `/overlay_container/save`) plus `ConfigService` support for saving/loading the overlay layout config.
- Overlay container frontend (`webui/overlay/`), served via new `/shared` and `/overlays` static routes.
- Added WebUI updater and submodules to this repo.

### Fixed
- Twitch EventSub WebSocket reconnect logic: fixed a race between `onerror`/`onclose` double-reconnecting, an incorrect `session_reconnect` handoff sequence that could trigger Twitch's "Invalid reconnect" close code, and an unguarded `.pong()` call that could crash the process when called on a stale socket. Added a keepalive watchdog and exponential backoff.
- Motherwolf tunnel reconnect logic: exponential backoff, safer socket teardown, avoids duplicate concurrent reconnect attempts.
- Twitch chat now recovers from unexpected disconnects instead of hanging.
- Fixed a hung promise when Twitch chatbot/broadcaster OAuth token refresh failed.
- Fixed OSC UDP messages with multiple/array values not being built correctly.
- Overlay static file routes now send no-cache headers so overlay browser sources don't get stale-cached.
- Fixed a couple of defensive null/undefined guards in event trigger matching and response scripts.

## [0.5.10] - 2026-08-01
- Add shared overlay settings for plugin overlays to get osc-bundle.js from Spooder.
- Pull features and fixes from core-modularity branch

## [0.5.9] - 2026-07-31
- Add Twitch Webhook eventsub and Twitch CLI
- Finish CLI and webhook implementation
- Add OBS Stream Monitor for Frame Drops and Disconnect alerts. Fix OSC logging to UI. Add TryCatch on Modules logging in.
- Fix Twitch CL installI on Windows
- Add auto backup to config. Fix OBS monitoring. Fix eventsub testing
- Add Disabled Groups to Events. Add Max Quantity to Auto Backup. WebUI Update. Minor bugfixes.

## [0.5.8] - 2025-08-25
- deps(deps): bump multer in the npm_and_yarn group
- Update package-lock
- Remove botUsername from StreamMessage. Add shareId to StreamMessage. Add botmessage event to processTwitchMessage
- Make buildPlugin a full promise. Update WebUI
- Remove unneeded import
- Fix autologin for OBS. Fix mod commands on ChatUtil. Fix OBS events in WebUI
- deps(deps): bump eslint from 8.57.1 to 9.33.0
- deps(deps): bump googleapis from 118.0.0 to 156.0.0
- Rework DiscordVoice events. Add Role to Discord Event Commands. Add Test Mode for Twitch. Finish reworking User creation. Add getModule and getAssetUrl to Plugin.
- Update plugin types
- Rework share management. Clean up types in Plugin. Add verifyShareTarget in StreamModuleInterface. Clean up unused Discord module functions. Update WebUI
- Update webUI
- Update ShareUI and WebUI for minor fixes. Remove YouTube draft module and googleapis.

## [0.5.7] - 2025-08-08
- Fix custom API paths for express 5
- Update WebUI
- Add ModuleEvents to Plugins. Add settings, settings-forms, and events-forms getters and setters. Update WebUI
- Remove legacy plugin mode, replace with JS. Better module resolution. Building works for JS. Minify NCC builds. Build entry files will always be index.js

## [0.5.6] - 2025-08-06
- deps(deps): bump the minor-and-patch group with 21 updates
- deps(deps): bump fs-extra from 10.1.0 to 11.3.1
- Fix plugin paths for cross compatibility. Update all routes for express 5

## [0.5.5] - 2025-08-06
- Update imports for spooder/osc-js
- Update WebUI and InitUI, rewrite start scripts. start, dev, init, and safe. Safe mode implemented
- Update Readme
- Quick update plugin paths for Windows
- Quick plugin build fix
- Why did I put that there?
- Update dependabot.yml
- deps(deps): bump express and @types/express
- Update LICENSE
- Update README.md
- deps(deps-dev): bump @types/node from 22.15.34 to 24.2.0

## [0.5.4] - 2025-08-03
- Update all WebUIs
- Update WebUI, optimize Twitch Eventsub creation. Minor fixes to plugin create and delete.
- Change @greysole/osc-js to the public @spooder/osc-js

## [0.5.3] - 2025-08-01
- Start build tsconfig and strip all imports of ts extensions
- Convert all absolute paths to relative. Completing refactor for transpiling JS.

## [0.5.2] - 2025-07-31
- Replace InitUI properly
- Fix plugin building. Install plugins by package name. Docker, Dependabot, and build tsconfig

## [0.5.1] - 2025-07-27
- Update all WebUIs, minor fixups and cleanups
- Add JS Sample Plugin. Copy public interface.
- Update InitUI, update Readme

## [0.5.0] - 2025-07-09
- Initial New Structure
- Update README.md
- Add OBS as ControlModuleInterface, clean up console logs, various routing tweaks
- Add MonitorManager, Add systeminformation dep, move log, status, and state to ServerRoutes
- Rename backend to user, rename Manager to Service, rework message processing and share flow, create Plugin wrapper
- Add separate routes for plugin settings, settings form, and events form, add name to Shares
- Refactor Discord, add Module Routes, add extra to Plugin, add refreshShareUserInfo to modules.
- Add ThemeRoutes, small tweaks
- Add onLoad event function to Plugin.ts. Update Mod routes and begin migration to multer. Add mod command file to Events.
- Bring mock StreamMessage to backend
- Refactor Backup/Restore routes. Refactor OSC conditions. Make Plugin use require()
- Change mutler storage to tmp folder. Add Plugin enable/disable. Remove express-fileupload. Improve Logging
- Refactor OBS module to mostly use REST for controlling and fetching. Add Discord command for events. Add unified runResponseScript function to ResponseUtil
- Rebuild Twitch EventSub to use websocket instead of webhook. Add ws
- Refactor some Twitch functions. Unify verifyResponseScript in ResponseUtil. Implement ResponseHandlers in modules. Add Motherwolf connection. Refactor public hosting
- Inject publicHostUrl, registerPluginApi, and getActiveViewer into Plugin. Refactor Init module. Refactor PublicRoutes and add PublicUI build. Change udp_clients to udp_servers. Add activeViewer flow for Twitch.
- Normalize Twitch API calls to return the desired data. Add public_url get for ServerRoutes.
- Add TS support and NCC build to TS and legacy plugins. Add devMode toggle to plugins. Clean up use of router.use(json()) to a global use in WebService. Fix share data flow.
- Increase validation calls on Twitch. Switch Ngrok module to official module. Various tweaks to moderator stuff
- Dev Daily Drive Sprint 1
- Dev Daily Drive 2
- Dev Daily Drive 3
- Dev Daily Drive 4 - Rewriting OSCService for better access control
- Update InitUI
- Initial rework
- Add access control to overlays and utilities. Various other bugfixes
- Restore Osc server files
- Dev Daily Drive 5
- ModuleService autologin fix and ShareService new file fix
- Fix Plugin Initialization, fix module auto login, update Custom Spooder structure
- Add Module Routes, various bug fixes and attempts
- Add IPC
- Add assets and source inclusion options for exporting. Various bugfixes. Update WebUI

## [0.4.97] - 2024-05-05
- UI Fix Config UDP Clients again

## [0.4.96] - 2024-05-05
- OBS and Plugin Minor Tweaks

## [0.4.95] - 2024-04-21
- Better crash handling
- Eventsub Select Rework

## [0.4.94] - 2024-04-21
- Takeout OBS error catch for the above catch
- Log AutoLogins

## [0.4.93] - 2024-04-21
- Tweak crash handling

## [0.4.92] - 2024-04-01
- Fixed the most face palming bug I ever made so far

## [0.4.91] - 2024-03-31
- No dash for further versions

## [0.4.9-1] - 2024-03-31
- Fix package version

## [0.4.9.1] - 2024-03-31
- Init Quickfix
- InitUI Net fix
- Fix Discord holding startup
- WebUI Fixes
- Last fixes until merge
- Twitch/Discord Tweaks
- Fix running without Twitch credentials

## [0.4.9] - 2024-03-03
- Frontend Bug Fixes
- Twitch fixes and tweaks
- Twitch Events integrated to Spooder Events
- Inut fixes
- Twitch events have Spooder variables
- Finish User editing
- Init and Twitch Fixes
- Twitch mod UI verification fix
- Git-less method for Create Plugin
- Prep for main merge

## [0.4.5] - 2023-08-22
- 0.4.2 More Tweaks
- Added API Calls for Responses
- 0.4.5
- Update Twitch.js for EventSubs
- 0.4.9 Progress
- 0.4.9 Finishing Initial Commit

## [0.4.2] - 2023-04-11
- Replace setup walkthrough with quick start video
- 0.4.2 Tweaks

## [0.4.1] - 2023-03-22
- 0.4.1 Fixes

## [0.4.0] - 2023-03-15
- Update README.md
- 0.4 Update

## [0.3.9] - 2023-01-22
- 0.3.9 Update

## [0.3.8.1] - 2022-12-21
- Fixed chatIsBroadcaster with check
- Fix Mod 'all' commands.
- Add channel switch messages.

## [0.3.8] - 2022-12-16
- 0.3.8 Update
- Quick fixes
- Update README.md
- More Quick Fixes
- WebUI: Fix EventSub Responses Not Saving
- WebUI: Fix Verify Script on EventSub
- Added Required version of Node and update Axios

## [0.3.5.1] - 2022-11-16
- Update Discord Link
- WebUI Fixes and cleanup

## [0.3.5] - 2022-10-15
- WebUI - Fix Overlay/Utility links
- Update README.md
- Add copy mod link button for external_http_url
- OSC UDP Fixes
- Update README.md
- 0.3.5 Update

## [0.3] - 2022-07-17
- Update README.md
- Update README.md
- Added Discord link
- WebUI and OBS Update

## [0.2.3] - 2022-07-08
- Clean out listeners when restarting chat
- Moderation Update

## [0.2.2] - 2022-06-07
- Dependency Cleanup and Oauth fixes

## [0.2.1] - 2022-05-30
- Add directories if not present
- Fix file initialization
- Update README.md
- Update README.md
- Update README.md
- Update README.md
- Update README.md
- Update README.md
- Update README.md
- One last thing about EventSubs
- Hotfix for UDP Clients
- Better string interpreting
- Update README.md
- Create FUNDING.yml
- Event Core Fixes

## [0.2] - 2022-05-05
- Initial release
