module.exports = (client) => {
    client.on("interactionCreate", async (interaction) => {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === "the_long_rest") {
                require("../commands/the_long_rest")(interaction, client);
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === "characterSubmission_1") {
                require("../modals/characterSubmission_1")(interaction, client);
            }
            if (interaction.customId === "characterSubmission_2") {
                require("../modals/characterSubmission_2")(interaction, client);
            }
            return;
        }

        if (interaction.isButton()) {
            if (interaction.customId.startsWith("confirm_remove_")) {
                require("../buttons/confirmRemove")(interaction, client);
                return;
            }
            if (interaction.customId.startsWith("cancel_remove_")) {
                require("../buttons/cancelRemove")(interaction, client);
                return;
            }
        }
    });
}
