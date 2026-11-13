const { handleDashboard } = require('./dashboard');
const { handlePending } = require('./pending');
const { handleApprove } = require('./approve');
const { handleClear } = require('./clear');
const { handleReject } = require('./reject');

module.exports = {
    handleDashboard,
    handlePending,
    handleApprove,
    handleClear,
    handleReject,
};
