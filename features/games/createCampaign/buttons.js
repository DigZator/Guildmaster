const { confirmCampaign, cancelCampaign } = require('./index');

module.exports = {
    exact: {
        'create_campaign_confirm': confirmCampaign,
        'create_campaign_cancel': cancelCampaign,
    },
};
