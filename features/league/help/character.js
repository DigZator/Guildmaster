// /help text of the league character commands. ./index.js puts each family into its /help group, in its position.
module.exports = {
  league: {
    character: {
      label: 'Character',
      description: 'Register and manage your league character.',
      commands: [
        {
          name: '/league create',
          description: 'Register your character in the Adventurer\'s Guild League. Run inside your character profile thread in #character-profiles. After registering, run `/league starter-items` to claim your starting equipment — the character dashboard will show a warning until you do.',
        },
        {
          name: '/league profile [user]',
          description: 'View your character profile, or someone else\'s if `user` is given.',
        },
        {
          name: '/league edit [name] [class] [species] [background] [charsheet]',
          description: 'Update any of your character\'s name, class, species, background, or character sheet link. Only the fields you provide are changed.',
        },
        {
          name: '/league setart <image>',
          description: 'Set your character\'s profile art. No AI-generated images.',
        },
        {
          name: '/league starter-items <class> <background>',
          description: 'Claim your character\'s starting equipment based on class and background. Walks you through any choices (e.g. weapon or pack options) via buttons/dropdowns, then adds the resulting items and gold to your inventory. Can only be claimed once per character.',
        },
        {
          name: '/league character status <character> <new_status>',
          description: 'Change one of your characters\' status (e.g. Active/Inactive). `character` autocompletes to your own characters.',
        },
      ],
    },
  },
};
