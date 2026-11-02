const globals = require('globals');

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
];
