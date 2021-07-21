const { orgHasDiscourse } = require("./discourse.subscriber");
const liveUpdate = require("../services/liveUpdate.service");
const MIN_POST_LENGTH = 3;

module.exports = {
  initialize(eventHub, models, kcAdminClient) {
    eventHub.subscribe(
      "create-dream",
      "mongodb",
      async ({ currentOrg, currentOrgMember, event, dream, comment }) => {

      }
    );

    eventHub.subscribe(
      "publish-dream",
      "mongodb",
      async ({ dream, unpublish }) => {
        dream.published = !unpublish;
        return dream.save();
      }
    )

    eventHub.subscribe(
      "create-comment",
      "mongodb",
      async ({ currentOrg, currentOrgMember, event, dream, comment }) => {
        if (orgHasDiscourse(currentOrg)) { return; }

        if (comment.content.length < MIN_POST_LENGTH)
          throw new Error(
            `Your post needs to be at least ${MIN_POST_LENGTH} characters long!`
          );

        dream.comments.push(comment);
        dream.save();

        const created = dream.comments.reverse()[0];
        liveUpdate.publish("commentsChanged", { commentsChanged: { comment: created, action: 'created' } });

        return created;
      }
    );

    eventHub.subscribe(
      "edit-comment",
      "mongodb",
      async ({ currentOrg, currentOrgMember, event, eventMember, dream, comment }) => {
        if (orgHasDiscourse(currentOrg)) { return; }

        const updated = dream.comments.find(c => (
          c._id.toString() === comment.id && (
            c.authorId.toString() === currentOrgMember.id.toString() ||
            eventMember?.isAdmin
          )
        ));

        if (!updated)
          throw new Error(
            "Cant find that comment - Does this comment belongs to you?"
          );

        updated.content = comment.content;
        updated.updatedAt = new Date();
        dream.save();

        liveUpdate.publish("commentsChanged", { commentsChanged: { comment: updated, action: 'edited' } });

        return updated;
      }
    );

    eventHub.subscribe(
      "delete-comment",
      "mongodb",
      async ({ currentOrg, currentOrgMember, event, dream, comment }) => {
        if (orgHasDiscourse(currentOrg)) { return; }

        const deleted = dream.comments.find(({ id }) => id === comment.id);
        dream.comments = dream.comments.filter(({ id }) => id !== comment.id);
        dream.save();

        liveUpdate.publish("commentsChanged", { commentsChanged: { comment: deleted, action: 'deleted' } });

        return deleted;
      }
    );
  },
};
