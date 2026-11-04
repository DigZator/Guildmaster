# Post-refactor issues

Problems found during the refactor that are deliberately **not** fixed inside it (the refactor keeps behavior
identical). Each one needs a decision, then its own change after the swap.

## 1. IMPORTANT: autocomplete suggestions are not permission-checked

**What happens.** Nothing sets default member permissions on any slash command (`setDefaultMemberPermissions`
is never used in `deploy-commands.js`), so every member sees every command. Autocomplete runs **before** any
permission check, and none of the autocomplete handlers check anything. A member typing in an admin command
gets suggestions, even though running the command is refused.

**What is exposed** (read from `interactions/commandHandler.js` and the handlers it calls):

| Typing in | Member sees |
|---|---|
| `/announce_game`, `/get_players`, `/manipulate_table`, `/edit_game`, `/game_info` (game option) | every cached game: title, type, format and id, including games that are not released yet |
| `/schedule_activation add` | exactly the games that are **not** activated yet, newest first, with their dates |
| `/schedule_activation remove` | the contents of the activation queue |
| `/anon_msg` | every anonymous-message key |
| `/ticket reset_counter`, `/ticket type edit` and `remove` | ticket type keys and labels |
| `/leaguedm quest link`, `/leaguedm dashboard` | quest lists |
| `/leagueadmin shop …`, `/leagueadmin item import` | the item catalogue with prices |
| `/league log` (character, with no player chosen) | character names and statuses across all players |

**Why it matters.** `/list_games` deliberately hides unreleased games from non-admins. The autocomplete of the
commands above lets anyone see the same games anyway, so that rule can be bypassed. It is information
disclosure only: the commands themselves still refuse non-admins.

**How to fix it (once the rules are decided).**
- The new router already lets every autocomplete entry carry its own policy, and a caller who fails it gets an
  empty list. So the fix is mostly declaring the right policy on each entry in the manifests.
- `game_info` and the game picker need a rule about unreleased games (hide them for non-admins, like
  `/list_games`).
- Decide whether `/league log` should list only the caller's own characters unless they are an admin.
- Optionally also hide admin commands from non-admins in Discord with default member permissions. That only
  affects what the picker shows, never what is enforced, so it does not replace the checks above.
- Add a test that drives every autocomplete as a non-admin and expects an empty list.

**Until then** every autocomplete entry in the manifests is declared `open`, which is today's behavior.

## 2. Smaller items noted along the way
- Unify the "no permission" wording per route (kept as-is during the refactor so users see no change).
- `tests/helpers/routePermsCli.js` and `tests/helpers/manifestsCli.js` carry similar offline guards; they could
  share one helper (left alone so the route snapshot cannot be disturbed).
