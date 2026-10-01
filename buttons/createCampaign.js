const { confirmCampaign, cancelCampaign } = require('../commands/create_campaign');

module.exports = {
    exact: {
        'create_campaign_confirm': confirmCampaign,
        'create_campaign_cancel': cancelCampaign,
    },
};
