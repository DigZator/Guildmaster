// /config status | set | clear (Admin role only). All the logic lives in configCommand.js.
const { execute } = require('./configCommand');

module.exports = (interaction, client) => execute(interaction, client);
