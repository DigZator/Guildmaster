# Guildmaster — Discord Bot Documentation

**Package name:** `tlr-discord-bot`
**Runtime:** Node.js, [discord.js](https://discord.js.org/) v14
**Purpose:** A server-management and TTRPG "league" economy bot for a D&D-focused Discord community — game scheduling, ticketing, RSS announcements, anonymous messaging, channel archiving, and a full player economy (characters, inventory, shop, marketplace, downtime, quests) backed by Notion.

---

## 1. Overview

Guildmaster is organized around five command surfaces:

| Surface | Slash command | Audience |
|---|---|---|
| Player | `/list_games`, `/get_players`, `/game_info`, `/ping` | Everyone |
| Server Admin | `/create_campaign`, `/announce_game`, `/edit_game`, `/schedule_activation`, `/rss`, `/anon_msg`, `/ticket`, `/archive`, `/archive-config`, `/the_long_rest` | Server staff |
| League (Player) | `/league ...` | Players participating in the D&D league |
| League DM | `/leaguedm ...` | Dungeon Masters running league quests |
| League Admin | `/leagueadmin ...` | League economy administrators |

The bot maintains its own local JSON data store (`/data`) for tickets, RSS feeds, shop stock, catalogues, downtime, anonymous messages, and pending-action queues, and syncs the League character economy with a **Notion** workspace (characters, inventory, quest log, downtime, trades).

---

## 2. Project Structure

```
.
├── index.js                  Entry point — wires up all handlers/watchers, logs in
├── client.js                 Discord.js Client instance + intents
├── deploy-commands.js        Registers all slash commands to a guild
├── helpData.js                Content shown by /help
├── art-thread.js              Character-art archive thread logic
│
├── commands/                  One file per top-level slash command
│   └── leagueGrants/          Shared logic for DM/Admin reward-granting flows
├── interactions/               Central dispatch: commands, buttons, modals, selects
├── buttons/                    Handlers for individual button customIds
├── modals/                     Handlers for individual modal submissions
├── selects/                    Handlers for select-menu interactions
├── flow/                       Multi-step conversational flows (message-based)
├── utils/                      Business logic, Notion clients, schedulers, stores
├── config/                     Static/JSON-backed configuration
├── data/                       Runtime JSON data (persisted state)
├── scripts/                    One-off diagnostic/dev scripts
└── test/                       Ad hoc test/dev scripts (no formal test runner)
```

### Entry flow (`index.js`)
On boot, the bot:
1. Loads environment variables (`dotenv`).
2. Registers global error handlers (`unhandledRejection`, `uncaughtException`, `error`).
3. Requires and initializes every interaction handler and background watcher (see §4 and §6).
4. Refreshes the games cache once logged in (`clientReady`).
5. Logs in with `DISCORD_TOKEN`.

Slash commands themselves are **not** auto-registered on boot — they're deployed separately via `node deploy-commands.js` (see §9).

---

## 3. Environment Variables

Defined in `.env.example`; copy to `.env` and fill in before running.

**Core Discord**
`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DEV_MODE`

**Notion integration**
`NOTION_TOKEN`, `DATABASE_ID`, `SEATBASE_ID`, `DATASOURCE_ID`, `SEATS_DATASOURCE_ID`
`LEAGUE_CHARACTERS_DB_ID`, `LEAGUE_INVENTORY_DB_ID`, `LEAGUE_QUEST_LOG_DB_ID`, `LEAGUE_DOWNTIME_DB_ID`, `LEAGUE_TRADES_DB_ID`, `GUILD_SHOP_DB_ID`, `PLAYER_MARKETPLACE_DB_ID`

**Channel IDs** (used to route bot output)
`TRAP_CHANNEL_ID`, `BOT_LOG_CHANNEL_ID`, `INCIDENT_REPORT_CHANNEL_ID`, `QUEST_BOARD_CHANNEL_ID`, `GUILDMASTER_CTRL_CHANNEL_ID`, `BOT_DEBUGGING_CHANNEL_ID`, `THE_LONG_REST_CHANNEL_ID`, `TLR_CONTROL_CHANNEL_ID`, `FEEDS_CHANNEL_ID`, `TLR_SUBMISSION_CHANNEL_ID`, `LEAGUE_PROFILES_FORUM_ID`, `LEAGUE_ADMIN_CHANNEL_ID`, `LEAGUE_ART_ARCHIVE_THREAD_ID`

**Roles**
`DM_ROLE_ID`, `LEAGUE_PLAYERS_ROLE_ID`, `CLERK_OF_MORTAL_AFFAIRS_ROLE_ID`, `ADMINS_ROLE_ID`, `CLANKERS_ROLE_ID`, `HR_ROLE_ID`, `CMD_ROLE_ID`, `INVENTORY_ROLE_ID`, `ADVENTURER_ROLE_ID`

**Third-party**
`FILLOUT_API_KEY`, `FILLOUT_FORM_ID` (Fillout.com form integration)

`DEV_MODE=true` reroutes some output (e.g. the quest board / scheduler pings) to `BOT_DEBUGGING_CHANNEL_ID` instead of production channels — useful for testing without spamming live channels.

---

## 4. Interaction Dispatch

All raw Discord interaction events are centralized in `interactions/`, each file wired up once in `index.js`:

- **`commandHandler.js`** — routes `ChatInputCommandInteraction` (and autocomplete) events to the matching file in `commands/`.
- **`buttonHandler.js`** — routes button clicks by `customId` prefix to `buttons/`.
- **`modalHandler.js`** — routes modal submissions by `customId` to `modals/`.
- **`selectHandler.js`** — routes select-menu interactions to `selects/`.
- **`leagueCreateModal.js`** — handles the character-creation modal specifically.
- **`questDashboardId.js` / `questDashboardRender.js`** — render and route the interactive quest-reward dashboard used by DMs/admins.
- **`ticketId.js`** — routes ticket-specific button/modal interactions.
- **`threadAlertLog.js`** — logs thread-related alerts to a monitoring channel.

Multi-step, message-driven (not just component-driven) flows live in `flow/` and are also registered directly on `client` in `index.js`:
- **`announcementFlow.js`** — manual game-announcement wizard.
- **`tlrSubmissionFlow.js`** — "The Long Rest" (character memorial) submission wizard.
- **`rssFlow.js`** — guided RSS feed setup.
- **`ticketFlow.js`** — ticket creation/lifecycle conversational steps.

---

## 5. Command Reference

Commands are defined with `SlashCommandBuilder` in `deploy-commands.js` and their logic lives in `commands/*.js`. `<required>` / `[optional]` notation follows the convention documented in the bot's own `/help help` entry.

### 5.1 Player Commands

| Command | Description |
|---|---|
| `/ping` | Health check — replies "Pong!" |
| `/list_games [browsing] [n] [format_filter] [type_filter] [public]` | Browse upcoming announced games, with format (Online/In-Person/Play-by-Post) and type (One-Shot/Mini-Adventure/Campaign/Workshop) filters |
| `/get_players <game>` | List players signed up for a table (autocomplete game search) |
| `/game_info <uid> [public]` | Detailed info about a specific game |
| `/the_long_rest add/remove/setup/reindex` | Character memorial board — post, browse, or remove memorials |

### 5.2 Server Admin Commands

| Command | Description |
|---|---|
| `/create_campaign <spectators_read_chat> <spectators_send_messages> <spectators_join_voice> [name] [use_stage] [dm]` | Creates a campaign role, category, text channel, and voice/stage channel in one step, with configurable spectator permissions. Rolls back on partial failure. |
| `/announce_game <game> [manual]` | Post a game announcement to the quest board, from existing game data or a manual entry flow |
| `/edit_game <game> <field>` | Edit a single field on a game record in Notion (autocomplete-driven field picker) |
| `/schedule_activation add/remove/view/set-reminder-time/set-activation-time/toggle-reminder/toggle-auto/status` | Manage the automated daily game-activation queue and its reminder/activation times (IST) |
| `/rss add/remove/list` | Manage RSS feeds that auto-post new items to a channel |
| `/anon_msg add/rmv/edit` | Create, edit, or remove anonymous messages posted to a channel under a tracked key |
| `/ticket setup/config/reset_counter/type add/edit/remove/list` | Deploy and configure the support-ticket dashboard, including custom ticket types, categories, and log channels |
| `/archive <target>` | Lock and move a channel or category into the configured archive category |
| `/archive-config <category>` | Set the destination category used by `/archive` |
| `/help <group> <family>` | Contextual, family-organized help browser |

### 5.3 League — Player Commands (`/league ...`)

**Character**
- `create` — register a character in the league (opens a creation modal)
- `profile [user]` — view your (or another player's) character profile
- `edit [name] [class] [species] [background] [charsheet]` — update character fields
- `setart <image>` — set character portrait art (max 8 MB, AI-art discouraged)
- `character status <character> <new_status>` — set Active/Passive/Retired

**Inventory & Economy**
- `inv` — view inventory
- `item [item] [id] [public]` — view a specific item's details
- `gold <player> <amount>` — transfer gold to another player
- `balance` — check gold, reputation, milestones
- `void item <id>` / `void gold <amount>` — voluntarily remove an item or gold from your own character

**Shop**
- `shop browse [rarity] [sort]`
- `shop buy <id>`
- `shop sell [item] [item_id]` — sell to the shop for half value
- `shop search <name>`
- `shop info <code>`

**Marketplace** (player-to-player, taxed)
- `marketplace browse [rarity] [sort]`
- `marketplace buy <id>`
- `marketplace list <item_id> <price>`
- `marketplace unlist <id>`

**Downtime**
- `downtime start <activity> [tier] [spell] [item] [quantity]`
- `downtime progress <id> <days>`
- `downtime list`
- `downtime buy-days` — spend 1 reputation for +10 downtime days
- `downtime activities` — browse all activities, tiers, costs, approval requirements

**Quest / Misc**
- `quest list` — list all league quests
- `log [player] [character] [quest_id]` — view a quest log
- `leaderboard [sort_by] [order] [class] [species] [status] [public]`
- `dashboard` — personal button dashboard (profile, quests, downtime, etc.)
- `starter-items <class> <background>` — get starting equipment

### 5.4 League DM Commands (`/leaguedm ...`)

- `quest link <game> [notes]` — link an announced game to the quest log
- `quest complete <quest_id>` — mark a quest complete, pending admin approval
- `quest add/remove/clear/players <quest_id> [user1..user6]` — manage quest rosters (up to 6 players)
- `dashboard <quest_id>` — view the live reward draft for a quest
- `rep <quest_id> <user1> <amount1> [...up to user6/amount6]` — request reputation grants (max 2/player), routed for admin approval
- `gold <quest_id> <user1> <amount1> [...up to user6/amount6]` — request gold grants
- `milestone <quest_id> <user1> <amount1> [...up to user6/amount6]` — request milestone grants
- `item create <quest_id> <name> <type> <rarity> <player> [subtype] [source] [value] [notes]` — create & assign a custom item
- `item import <quest_id> <code> <player> [source] [notes]` — assign an item straight from the catalogue

> All DM-initiated grants and item creations enter a **pending approval queue** reviewed by League Admins (`/leagueadmin pending / approve / reject`).

### 5.5 League Admin Commands (`/leagueadmin ...`)

- `rep <user> <amount>` / `gold <user> <amount>` / `milestone <user> <amount>` — direct grants (bypass the DM approval queue; gold accepts negative values)
- `pending` — list all pending DM grant/action requests
- `approve <id>` / `reject <id> [reason] [line]` — approve or reject pending actions (comma-separated IDs supported; `line` rejects a single quest-report line)
- `clear <id>` — force-remove a stuck pending action without running its approve/reject logic
- `item create` / `item import` — same as DM versions, without a quest_id requirement
- `shop stock <code> <quantity> [price]` — stock/update a shop item from the catalogue
- `shop stockall [rarity]` — bulk-stock the whole catalogue (or one rarity) at default quantities
- `shop unstock <code>` — remove an item from the shop floor
- `shop restock <code>` — manually trigger a restock
- `catalogue sync` — refresh the item catalogue from the Open5e API (2024 SRD)
- `catalogue sync-spells` — refresh the spell list used by scroll-scribing downtime
- `audit characters` — flag players with more than one Active character

---

## 6. Background Services

Initialized in `index.js` at boot, these run independently of any single interaction:

| Module | Responsibility |
|---|---|
| `utils/cacheWatcher.js` | Watches/refreshes the in-memory games cache (`utils/cache.js`) |
| `utils/cacheAlert.js` | Alerts on cache staleness/failures |
| `utils/registrationDefaults.js` | Loads default registration-link settings |
| `utils/scheduler.js` | Drives the daily game-activation queue — reminders and activations at configurable IST times, based on `data/activationQueue.json` |
| `utils/restockScheduler.js` | Hourly scan that auto-restocks shop items per their configured cadence (`utils/shopFloor.js`, `utils/5etoolsCatalogue.js`); also runs once ~30s after startup |
| `utils/threadActivityReport.js` | Periodic thread-activity reporting |
| `utils/trapChannel.js` | Monitors a designated "trap" channel (likely anti-spam/honeypot) |
| `utils/deactivator.js` | Handles scheduled deactivation logic |
| `utils/ticketDashboardWatcher.js` | Keeps the ticket dashboard message in sync |

All scheduling that involves wall-clock time (`scheduler.js`) is computed in **Asia/Kolkata (IST)**, regardless of host server timezone.

---

## 7. Data Layer

### 7.1 Local JSON store
Persistent runtime state lives under `/data` as JSON files, generally read/written through `utils/jsonStore.js` (a small file-backed key/value helper) or dedicated store modules:

| File / Store module | Contents |
|---|---|
| `ticketStore.js` → `tickets.json`, `ticketCounters.json` | Open/closed tickets and per-type numbering |
| `ticketTypes.json` (via `config/ticketTypes.js`) | Runtime-editable ticket type definitions |
| `ticketGuildConfig.json` | Per-guild ticket category/log-channel config |
| `rssStore.js` → `rssFeeds.json` | Configured RSS feeds |
| `anonStore.js` → `anonMessages.json` | Anonymous messages by key |
| `activationQueue.js` → `activationQueue.json` | Game activation queue + schedule settings |
| `shopFloor.js` → `shopFloor.json` | Current shop stock, prices, restock timers |
| `5etoolsCatalogue.js` → `catalogue.json` | Cached 5e/Open5e item catalogue |
| `5etoolsSpells.js` → `spells.json` | Cached spell list |
| `downtime.js` → `downtimeBlueprints.json`, `downtimeQuotes.json`, `downtimeSequence.json`, `pendingDowntimeApprovals.json` | Downtime activity definitions, running quotes, and approval queue |
| `pendingActions.js` → `pendingActions.json` | Generic pending-approval queue (rep/gold/milestone/item grants) |
| `questDrafts.js` / `questReportDrafts` → `questRewardDrafts.json` | In-progress quest reward dashboards |
| `memorialIndex.js` → `memorialIndex.json` | The Long Rest memorial index |
| `priceOverrides.json` | Manual price overrides for catalogue items |
| `archiveConfig.js` → `archiveConfig.json` | Destination category for `/archive` |
| `threadReport.json` | Thread-activity report state |
| `gameFields.json` | Field metadata for `/edit_game` autocomplete |
| `registrationDefaults.js` | Default registration link |
| `channels.js` | Central export of channel-ID env vars for reuse across modules |

### 7.2 Notion integration (`utils/notion.js`, `utils/leagueNotion.js`)
The league character economy is authoritative in Notion, not local JSON:

- **Characters DB** — profile fields, class/species/background, status, art, gold, reputation, milestones (via `LEAGUE_CHARACTERS_DB_ID`)
- **Inventory DB** — item ownership, source, value (`LEAGUE_INVENTORY_DB_ID`)
- **Quest Log DB** — quest records, linked players, rewards (`LEAGUE_QUEST_LOG_DB_ID`)
- **Downtime DB** — active/completed downtime activities (`LEAGUE_DOWNTIME_DB_ID`)
- **Trades DB** — marketplace transaction history (`LEAGUE_TRADES_DB_ID`)
- **Guild Shop DB** / **Player Marketplace DB** — shop and marketplace listings

`leagueNotion.js` exposes higher-level helpers used throughout `commands/league.js` and related modules, e.g. `getActiveCharacter`, `updateCharacterArt`, `updatePageProperty`, `getCharacterGold`, `adjustCharacterNumbersUnlocked`, `withTwoPageLocks` (optimistic-locking helper for concurrent page edits), `getCharactersByDiscordId`, `searchCharactersByName`, `queryLeaderboard`, `getCharacterQuestLog`, `getPageById`.

A second Notion client area (`DATABASE_ID`, `SEATBASE_ID`, `DATASOURCE_ID`, `SEATS_DATASOURCE_ID`) supports the game-scheduling side (announced games / table seats), separate from the league economy databases.

---

## 8. Key Subsystems in Detail

### 8.1 Ticketing (`/ticket`, `commands/ticket.js`, `config/ticketTypes.js`, `utils/ticketStore.js`, `utils/ticketTranscript.js`)
- Config-driven: ticket **types** (label, emoji, channel slug/tag, category group, roles) are stored in `data/ticketTypes.json` and editable at runtime via `/ticket type add|edit|remove|list` — no redeploy needed for new ticket categories.
- Two category groups: `normal` and `hr`, each with its own creation category and transcript log channel.
- Opening a ticket creates a private channel named from the type's slug/tag plus a counter (e.g. `#hr-000-janedoe`); counters are per-type and resettable via `/ticket reset_counter`.
- On close, `ticketTranscript.js` generates and posts a transcript thread to the configured log channel.

### 8.2 Game Announcements & Activation (`announce_game`, `edit_game`, `schedule_activation`, `utils/scheduler.js`, `utils/cache.js`)
- Games are cached in memory (`cache.js`, refreshed on login and by `cacheWatcher.js`) for fast autocomplete across many commands (`get_players`, `game_info`, `edit_game`, `announce_game`, `schedule_activation`).
- The **activation queue** lets admins pre-queue games for a specific activation pass; `scheduler.js` sends a daily IST reminder and performs activation automatically if `toggle-auto` is enabled.
- `DEV_MODE=true` redirects scheduler/quest-board output to `BOT_DEBUGGING_CHANNEL_ID`.

### 8.3 League Economy (`commands/league.js` + `commands/leagueGrants/`, `commands/leagueShop.js`, `commands/leagueDowntime.js`, `commands/leagueQuest.js`, `commands/leagueVoid.js`)
- **Approval workflow:** DM-initiated rep/gold/milestone/item grants are staged in `data/pendingActions.json` and require League Admin approval (`/leagueadmin approve|reject|pending`) before they post to Notion — direct Admin grants skip this queue.
- **Shop vs. Marketplace:** the Shop is stocked/administered by League Admins from the catalogue (with auto-restock on a per-item cadence); the Marketplace is player-to-player, with a configurable tax (`MARKETPLACE_TAX_RATE` in `commands/leagueShop.js`) deducted from seller proceeds.
- **Catalogue:** `/leagueadmin catalogue sync` pulls current D&D 2024 SRD item data from **Open5e**; `sync-spells` refreshes the spell list used by the "Scribe a Spell Scroll" downtime activity.
- **Downtime:** activities, tiers, and approval requirements are defined as blueprints (`config` + `utils/downtime.js`); starting one produces a running "quote," and progress is invested in days via `/league downtime progress`. Some activities (e.g. crafting, scroll-scribing) require picking a spell/item and quantity.
- **Void:** `/league void item|gold` lets a player voluntarily remove their own item or gold — useful for correcting mistakes without admin intervention.
- **Two-page locking** (`withTwoPageLocks`) guards operations that must atomically update two Notion pages (e.g. a gold transfer between two characters) — failures mid-transaction are reported with a specific failure `stage` for manual recovery, and rolled back where possible.

### 8.4 RSS Feeds (`/rss`, `utils/rssFetcher.js`, `utils/rssStore.js`, `flow/rssFlow.js`)
- Feeds are polled and new items posted automatically to a configured channel (defaults to `FEEDS_CHANNEL_ID`).
- `rssFlow.js` provides a guided setup conversation as an alternative to filling out all `/rss add` options directly.

### 8.5 Anonymous Messaging (`/anon_msg`, `utils/anonStore.js`)
- Each message is stored under a unique `key`, enabling later `edit`/`rmv` without needing the original message content.
- Supports both single-line (`content` option) and multi-line (`multiline` flag → paste-in-backticks flow) input.

### 8.6 Archiving (`/archive`, `/archive-config`, `utils/archiveChannel.js`, `config/archiveConfig.js`)
- Moves a channel or category into a configured "archive" category and locks it read-only.
- Supports text, voice, stage, announcement, forum, and category channel types.

### 8.7 The Long Rest — Memorials (`the_long_rest`, `flow/tlrSubmissionFlow.js`, `utils/memorialIndex.js`, `utils/memorialDrafts.js`)
- A dedicated system for posting character "memorials" (retirement/death write-ups) to a channel, with a searchable index that can be rebuilt via `/the_long_rest reindex` by rescanning the output channel.

### 8.8 Autocomplete
Many options across the bot use live autocomplete, implemented in dedicated `utils/*AutoComplete.js` modules: games (`gameAutoComplete.js`), shop/catalogue items (`catalogueAutoComplete.js`, `magicItemAutoComplete.js`), spells (`spellAutoComplete.js`), downtime activities (`downtimeAutoComplete.js`).

### 8.9 Error Reporting (`utils/errorReporter.js`)
Centralized helper for reporting unexpected errors to an incident/debugging channel, used throughout commands and background services to surface failures (especially mid-transaction failures in gold transfers, shop purchases, and campaign creation) without crashing the process.

---

## 9. Setup & Running

### Install
```bash
npm install
cp .env.example .env
# fill in .env with your bot token, IDs, and Notion credentials
```

### Register slash commands
Slash commands must be (re-)registered any time a command definition in `deploy-commands.js` changes:
```bash
node deploy-commands.js
```
This registers commands to a **single guild** (`GUILD_ID`) via `Routes.applicationGuildCommands`, so changes apply near-instantly (guild commands update immediately, unlike global commands which can take up to an hour).

### Run the bot
```bash
node index.js
```

### Diagnostics
- `scripts/diagnosePermissions.js` — checks the bot's effective permissions in configured channels/categories.
- `scripts/testChannelCreate.js` — sanity-checks channel-creation logic (used by `/create_campaign`, `/archive`, ticketing).
- `test/` contains a variety of standalone dev/debug scripts (category resolution, date-edit roundtrips, permission checks, catalogue scans) rather than a formal automated test suite — there is no configured `npm test` runner (`package.json`'s `test` script is a placeholder).

### Required Discord bot intents
Configured in `client.js`: `Guilds`, `GuildMessages`, `MessageContent`, `GuildMembers`. Ensure **Server Members Intent** and **Message Content Intent** are enabled for the bot application in the Discord Developer Portal, or the bot will fail to receive the data these features depend on.

---

## 10. Notes for Maintainers

- **Config-over-code:** Ticket types and several other subsystems intentionally avoid hardcoded per-type branches in favor of JSON-configured definitions — prefer adding entries to `data/*.json` (via the relevant slash command) over hand-editing `config/` files where a runtime command exists.
- **Approval-queue pattern:** Any economy-affecting action initiated by a DM (as opposed to an Admin) is expected to route through `pendingActions.js` for admin sign-off. When adding new DM-facing grant/item commands, follow the existing pattern in `commands/leagueGrants/` rather than writing directly to Notion.
- **IST-based scheduling:** Any new time-based feature should follow `scheduler.js`'s pattern of converting to `Asia/Kolkata` explicitly rather than relying on host timezone.
- **Two-page Notion locking:** any operation that must update two Notion pages together (transfers, trades) should use `withTwoPageLocks` to avoid partial-write races, and should report a `stage` on failure so admins can manually reconcile.
- **`.gitignore`** excludes `node_modules/`, `.git/`, `*.log`, and `.env` — confirmed by the zip command used to package this bundle.
