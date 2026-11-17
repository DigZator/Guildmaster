// The Discord flag that makes a reply visible only to the person who triggered it ("ephemeral").
// Handlers write `flags: EPHEMERAL` instead of the bare number 64; tests assert that it is still 64.
const { MessageFlags } = require('discord.js');

const EPHEMERAL = MessageFlags.Ephemeral;

module.exports = { EPHEMERAL };
