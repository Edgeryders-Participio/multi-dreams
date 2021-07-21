const EmailService = require("../services/EmailService/email.service");
const initKcAdminClient = require("../utils/initKcAdminClient");

module.exports = {
  initialize(eventHub, models) {
    eventHub.subscribe(
      "create-comment",
      "email",
      async ({ currentOrg, currentOrgMember, event, dream, comment }) => {
        const kcAdminClient = await initKcAdminClient();

        await EmailService.sendCommentNotification({
          currentOrg,
          currentOrgMember,
          dream,
          event,
          comment,
          models,
          kcAdminClient,
        });
      }
    );
  },
};
