// /help text of the tickets feature. helpData.js spreads `player` and `admin` into its groups, in these positions.
module.exports = {
  player: {
    tickets: {
      label: 'Support Tickets',
      description: 'Raise a ticket, or close one you opened. Available to everyone.',
      commands: [
        {
          name: '/ticket raise <type> [reason] [identification] [details]',
          description: 'Open a support ticket. `type` autocompletes. Fill in `reason` and `identification` and the ticket is created straight away; leave either blank and a form opens with anything you typed already filled in. You can also use the buttons on the ticket dashboard.',
        },
        {
          name: '/ticket close [reason] [feedback]',
          description: 'Run inside a ticket channel to close it (the person who raised it, or staff). Leave `reason` blank and a form opens with anything you typed already filled in. The ticket\'s controls are also pinned in the channel if you prefer buttons.',
        },
      ],
    },
  },
  admin: {
    tickets: {
      label: 'Support Tickets',
      description: 'Set up and manage the ticket dashboard. Requires the Admin role. (Raising and closing tickets — `/ticket raise` and `/ticket close` — are covered under `/help player tickets`.)',
      commands: [
        {
          name: '/ticket setup',
          description: 'Post the ticket dashboard in the current channel (or refresh it in place if one was already posted).',
        },
        {
          name: '/ticket config [category] [hr_category] [log_channel] [hr_log_channel]',
          description: 'View or update where ticket channels are created and logged. Run with no options to see the current config.',
        },
        {
          name: '/ticket reset_counter [type]',
          description: 'Reset a ticket type\'s numbering back to `000`. Omit `type` to reset all counters. `type` autocompletes.',
        },
        {
          name: '/ticket type add <label> [key] [slug] [emoji] [channel_tag] [modal_title] [category_group] [viewer_role] [ping_target_role]',
          description: 'Add a new ticket type — it appears on the dashboard immediately (the posted dashboard is refreshed automatically). `key`/`slug` default to a slugified version of `label` if omitted. `category_group` is `normal` or `hr` and controls which category/log channel (set via `/ticket config`) the type\'s tickets use.',
        },
        {
          name: '/ticket type edit <key> [label] [slug] [emoji] [channel_tag] [modal_title] [category_group] [viewer_role] [ping_target_role]',
          description: 'Edit an existing ticket type. `key` autocompletes. Only the fields you provide are changed; the dashboard is refreshed automatically.',
        },
        {
          name: '/ticket type remove <key>',
          description: 'Remove a ticket type. `key` autocompletes. Existing tickets already raised under this type are unaffected; it just disappears from the dashboard and can no longer be selected for new tickets.',
        },
        {
          name: '/ticket type list',
          description: 'List all configured ticket types and their settings.',
        },
      ],
    },
  },
};
