// /help text of the archive feature. helpData.js spreads `admin` into its admin group, in this position.
module.exports = {
  admin: {
    archive: {
      label: 'Archiving',
      description: 'Lock and move channels/categories out of active use. Requires the Admin role.',
      commands: [
        {
          name: '/archive <target>',
          description: 'Lock a channel or category read-only and move it into the configured archive category. Works on text, voice, stage, announcement, and forum channels, as well as whole categories.',
        },
        {
          name: '/archive-config <category>',
          description: 'Set which category `/archive` moves archived channels into. Run this once before using `/archive`.',
        },
      ],
    },
  },
};
