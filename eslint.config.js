const globals = require('globals');
const boundaries = require('./tests/tools/eslintBoundaries');

module.exports = [
    { ignores: ['node_modules/**', 'test/**', 'scripts/**', 'temp/**', 'tests/snapshots/**'] },
    {
        files: ['**/*.js'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
        },
    },
    {
        // Plan section 4.9, rules 1 to 3 (see tests/tools/eslintBoundaries.js). The tests reach into features on purpose.
        files: ['**/*.js'],
        ignores: ['tests/**'],
        plugins: { boundaries: boundaries.plugin },
        rules: { 'boundaries/feature-boundaries': 'error' },
    },
    {
        // Ephemeral replies are written with the named constant, never the bare number (plan step D4).
        files: ['**/*.js'],
        ignores: ['tests/**', 'shared/utilities/ephemeral.js'],
        rules: {
            'no-restricted-syntax': ['error', {
                selector: "Property[key.name='flags'] Literal[value=64]",
                message: "Write `flags: EPHEMERAL` (require('shared/utilities/ephemeral')), not the bare number 64.",
            }],
        },
    },
];
