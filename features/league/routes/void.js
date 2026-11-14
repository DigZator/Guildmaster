// The /league routes of the void commands: its buttons, modals, selects and autocomplete. ../manifest.js puts them together in the order
// the old single manifest listed them (the order of the keys decides which prefix route wins).
module.exports = {
    // Autocomplete key (command:group:subcommand): the player's own items.
    itemTargets: ['league:void:item'],
};
