# tests

Offline safety net. Nothing here connects to Discord or Notion, and nothing writes to `data/`.

- `npm run lint` - ESLint (`no-undef` is an error, `no-unused-vars` is a warning).
- `npm test` - runs every `tests/*.test.js`.
- `npm run verify` - lint, then tests.
- `npm run snapshots:update` - regenerates `tests/snapshots/*.json`. Review the git diff before committing.

| Test | Guards |
|---|---|
| `smoke` | every module loads, every relative `require` resolves, every imported name is exported, every command has a handler, button routes resolve |
| `contract` | the exact command payload sent to Discord, plus the routing/permission inventory |
| `customId` | the four ID encoders and that each prefix is routed |
| `permissions` | who passes each `isAdminChannel` check today |
| `mappings` | the channel mapping check and its report, the registry, and that `.env.example` covers every variable the code reads |

A failing `contract` test is not always a bug: if the change is intended, update the snapshot and commit the diff with the code change.
