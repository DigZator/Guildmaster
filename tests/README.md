# tests

Offline safety net. Nothing here connects to Discord or Notion, and nothing writes to `data/`.

- `npm run lint` - ESLint (`no-undef` and `no-unused-vars` are errors).
- `npm test` - runs every `tests/*.test.js`.
- `npm run verify` - lint, then tests.
- `npm run snapshots:update` - regenerates `tests/snapshots/*.json`. Review the git diff before committing.

| Test | Guards |
|---|---|
| `smoke` | every module loads, every relative `require` resolves, every imported name is exported, every command has a handler, button routes resolve |
| `contract` | the exact command payload sent to Discord, plus the routing/permission inventory |
| `customId` | the four ID encoders and that each prefix is routed |
| `permissions` | who passes each `isAdminChannel` check today |
| `auth` | `shared/auth` answers exactly like `isAdminChannel` and `isTlrMod` for every role/channel combination (the old helpers stay until Phase 3), unknown policies throw, `validate()` catches bad config |
| `router` | `core/registry.js` + `core/router.js` (built, not wired yet): manifests are validated at load (policy on every route, no duplicates or overlapping prefixes), routes are found and their policy enforced, and each kind (command, button, modal, select) keeps the exact unmatched/error/expired behavior of its old router |
| `manifests` | the ten feature manifests wrap today's handlers without moving them: they cover exactly the routes in the routing inventory, every route declares a policy (all `open` for now) and a `gate` saying where its check lives today, and every gate agrees with the route-permission snapshot (the few routes the harness cannot reach are listed explicitly and checked against the static inventory) |
| `routePermissions` | every command, subcommand, button, select and modal driven through the real routers by eleven fake members; records which `isAdminChannel` check each route reaches and what each member gets back (offline; `data/` is verified untouched) |
| `channelMap` | the `data/channelMap.json` store behind `/config`: loading into the environment, what may be stored, and the load-order guard |
| `configCommand` | `/config status`, `set`, `clear` and the trap-channel confirm button, with fake interactions (admin role only, nothing saved on a failed check, audit trail) |
| `mappings` | the channel mapping check and its report, the registry, and that `.env.example` covers every variable the code reads |

A failing `contract` test is not always a bug: if the change is intended, update the snapshot and commit the diff with the code change.
