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
];
