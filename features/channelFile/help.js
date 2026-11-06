// /help text of the channel-file feature. helpData.js spreads `admin` into its admin group, in this position.
module.exports = {
  admin: {
    'channel-file': {
      label: 'Channel Filing',
      description:
        'Copy a whole channel (and its threads) into a thread, check the copy, and delete the original only after an admin approves. Requires the CMD role (the `protect` commands require the Admin role).\n\n' +
        '**How it works**\n' +
        '1. Run `/channel_file file` with the channel to file, the text channel to file it into, and whether the main thread is private. You see any warnings first, then press Confirm. The channel becomes read-only (frozen).\n' +
        '2. The bot copies every message, image and file into a new thread. Public threads are included in the same thread between start/end markers; private threads become separate private threads, so nobody gains access to them. Progress appears in the control channel.\n' +
        '3. The copy is checked three ways, then a review message appears in the control channel with **Display errors**, **Proceed**, **Abort** and **Re-run checks**. Only CMD role holders can use them.\n' +
        '4. **Proceed** asks you to type the channel name, then deletes the original. **Abort** unfreezes the channel and restores its permissions. Nothing is ever deleted automatically — a frozen channel just stays frozen (you are reminded after 72 hours).\n\n' +
        'Protected channels (rules, community, system, AFK, anything the bot depends on, active tickets and direct lines, and anything on the manual protect list) can never be filed. Files that could not be copied (too large, or their links had expired) are lost for good once the channel is deleted — the review message and the Proceed form tell you how many.',
      commands: [
        {
          name: '/channel_file file <target> <location> <private>',
          description: 'File a channel or thread into a new thread in `location`, verify the copy, then wait for review before deleting the original. `private` decides whether the main filed thread is private or public. Works on text, announcement, voice/stage (the text chat), forum, media channels and threads; categories are refused.',
        },
        {
          name: '/channel_file protect add <channel>',
          description: 'Admin role only. Add a channel to the manual protect list so it can never be filed.',
        },
        {
          name: '/channel_file protect remove <channel>',
          description: 'Admin role only. Remove a channel from the manual protect list.',
        },
        {
          name: '/channel_file protect list',
          description: 'Admin role only. Show the manually protected channels.',
        },
      ],
    },
  },
};
