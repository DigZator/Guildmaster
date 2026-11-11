// /help text of the games feature. helpData.js spreads `admin` into its admin group, in this position.
module.exports = {
  admin: {
    'game-management': {
      label: 'Game Management',
      description: 'Announcing and editing games on the quest board. General server admins.',
      commands: [
        {
          name: '/announce_game <game>',
          description: 'Pull a game from Notion and post it to the quest board. `game` autocompletes. The preview warns about missing fields, and Edit lets you fix them before confirming.',
        },
        {
          name: '/edit_game <game> <field>',
          description: 'Edit a field on a game in Notion. Both `game` and `field` autocomplete — includes Registration Link and Registration Line. Text/number/date fields open a form; checkbox fields (e.g. Activate) show True/False buttons instead. Cover Art has no form: send an image in the channel (or paste a link to one) and it is re-hosted at Notion; type `cancel` to abort.',
        },
        {
          name: '/get_players <game>',
          description: 'Get the list of players who have registered for a game. Also posted automatically (non-ephemeral) to the guildmaster-ctrl channel whenever a game\'s open seats hit zero.',
        },
        {
          name: '/create_campaign <spectators_read_chat> <spectators_send_messages> <spectators_join_voice> [name] [use_stage] [dm]',
          description: 'Create a campaign role, category, text channel, and voice/stage channel. The three spectator questions are required: whether the Adventurer (spectator) role can read the text chat, send messages there (only takes effect if they can read it), and join the voice/stage channel. `use_stage` (default No) creates a Stage channel instead of Voice and gives the whole campaign role speaker/moderator access so they can go live without requesting to speak. `dm`, if set, immediately grants that user the DM role and adds them to the campaign.',
        },
      ],
    },
  },
};
