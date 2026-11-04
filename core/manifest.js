// Helpers for writing a feature manifest. A manifest is what a feature hands to the registry:
//
//   {
//     name: 'config',                                   // for error messages
//     commands: [{ name, policy, handler, denied?, subcommands?, autocomplete? }],
//     buttons:     { exact: { id: route }, prefix: { prefix: route } },
//     modals:      { exact: {...}, prefix: {...} },
//     selects:     { exact: {...}, prefix: {...} },     // string select menus
//     userSelects: { exact: {...}, prefix: {...} },
//     init?: (client) => void,                          // schedulers, watchers (used from Phase 4)
//   }
//
// A route is { policy, handler, denied?, falseMeansUnhandled? }. EVERY route names its policy on purpose:
// 'open' is a decision that is visible in one place, never a default. `denied` is the text shown to someone
// who fails the policy (each route keeps its current wording for now). `falseMeansUnhandled` marks the one
// modal handler that returns false to say "not mine".
// `gate` (optional) records where the permission check lives today while it is still inside the handler;
// it is documentation checked by tests, never enforced. The router enforces `policy` only.
// Reserved for later, not implemented: a route-level `channels` restriction (refactor plan, section 6).

function route(policy, handler, options = {}) {
    return { policy, handler, ...options };
}

// Wrap a whole { id: handler } table (what the existing button files export as `exact` / `prefix`).
function routes(policy, table, options = {}) {
    return Object.fromEntries(Object.entries(table).map(([id, handler]) => [id, route(policy, handler, options)]));
}

module.exports = { route, routes };
