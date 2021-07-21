const slugify = require("../utils/slugify");
const liveUpdate = require("../services/liveUpdate.service");
const { GraphQLScalarType } = require("graphql");
const GraphQLJSON = require("graphql-type-json");
const { GraphQLJSONObject } = require("graphql-type-json");
const { Kind } = require("graphql/language");
const mongoose = require("mongoose");
const dayjs = require("dayjs");
const { combineResolvers, skip } = require("graphql-resolvers");
const KCRequiredActionAlias = require("keycloak-admin").requiredAction;
const discourse = require("../lib/discourse");
const { allocateToMember } = require("../controller");
const {
  orgHasDiscourse,
  generateComment,
} = require("../subscribers/discourse.subscriber");

const isRootAdmin = (parent, args, { currentUser }) => {
  // TODO: this is old code that doesn't really work right now
  return currentUser && currentUser.isRootAdmin
    ? skip
    : new Error("You need to be root admin");
};

const isMemberOfOrg = (parent, { id }, { kauth, currentOrgMember }) => {
  if (!kauth) throw new Error("You need to be logged in");
  if (!currentOrgMember.organizationId == id && !kauth.isRootAdmin)
    throw new Error("You need to be a member of that organization");
  return skip;
};

// const canEditEvent = (parent, args, { currentOrgMember, models }) => {
//   // args: eventId
//   //and you are either a orgAdmin or eventAdmin..
// };

// const canEditDream = (parent, args, { currentOrgMember, models }) => {
//   // args: eventId
//   //and you are either a orgAdmin or eventAdmin..
// };

// const canEditOrg = (parent, args, { currentOrgMember, currentUser }) => {};

const resolvers = {
  Query: {
    currentUser: (parent, args, { kauth }) => (kauth ? { ...kauth } : null),
    currentOrg: (parent, args, { currentOrg }) => currentOrg,
    currentOrgMember: (parent, args, { currentOrgMember }) => currentOrgMember,
    organization: combineResolvers(
      isMemberOfOrg,
      async (parent, { id }, { models: { Organization } }) => {
        return Organization.findOne({ _id: id });
      }
    ),
    organizations: combineResolvers(
      isRootAdmin,
      async (parent, args, { models: { Organization } }) => {
        return Organization.find();
      }
    ),
    events: async (
      parent,
      { limit },
      { currentOrg, currentOrgMember, models: { Event } }
    ) => {
      if (!currentOrg) {
        throw new Error("No organization found");
      }

      // if admin or guide, show all events (current or archived)
      if (currentOrgMember && currentOrgMember.isOrgAdmin) {
        return Event.find(
          {
            organizationId: currentOrg.id,
          },
          null,
          { limit }
        );
      }

      return Event.find(
        {
          organizationId: currentOrg.id,
          archived: { $ne: true },
        },
        null,
        { limit }
      );
    },
    event: async (parent, { slug }, { currentOrg, models: { Event } }) => {
      if (!currentOrg) return null;
      return Event.findOne({ slug, organizationId: currentOrg.id });
    },
    contributionsPage: async (
      parent,
      { eventId, offset, limit },
      { currentOrgMember, models: { EventMember, Contribution } }
    ) => {
      if (!currentOrgMember) throw new Error("You need to be logged in");

      const eventMember = await EventMember.findOne({
        eventId,
        orgMemberId: currentOrgMember.id,
      });

      if (!(currentOrgMember?.isOrgAdmin || eventMember?.isAdmin))
        throw new Error("You need to be org admin to view this");

      const contributionsWithExtra = [
        ...(await Contribution.find({ eventId }, null, {
          skip: offset,
          limit: limit + 1,
        }).sort({
          createdAt: -1,
        })),
      ];

      return {
        moreExist: contributionsWithExtra.length > limit,
        contributions: contributionsWithExtra.slice(0, limit),
      };
    },
    dream: async (parent, { id }, { models: { Dream } }) => {
      return Dream.findOne({ _id: id });
    },
    dreamsPage: async (
      parent,
      { eventSlug, textSearchTerm, tag: tagValue, offset, limit },
      {
        currentOrgMember,
        currentOrg,
        models: { Event, Dream, EventMember, Tag },
      }
    ) => {
      let currentEventMember;

      const event = await Event.findOne({
        slug: eventSlug,
        organizationId: currentOrg.id,
      });

      if (currentOrgMember) {
        currentEventMember = await EventMember.findOne({
          orgMemberId: currentOrgMember.id,
          eventId: event.id,
        });
      }

      let tag;

      if (tagValue) {
        tag = await Tag.findOne({
          eventId: event.id,
          value: tagValue,
        });
      }

      const tagQuery = {
        ...(tag
          ? {
              tags: mongoose.Types.ObjectId(tag._id),
            }
          : null),
      };

      const adminQuery = {
        eventId: mongoose.Types.ObjectId(event.id),
        ...(textSearchTerm && { $text: { $search: textSearchTerm } }),
        ...tagQuery,
      };
      // todo: create appropriate index for this query
      // if event member, show dreams that are publisehd AND dreams where member is cocreator
      const memberQuery = {
        eventId: mongoose.Types.ObjectId(event.id),
        $or: [
          { published: true },
          { cocreators: mongoose.Types.ObjectId(currentEventMember?.id) },
        ],
        ...(textSearchTerm && { $text: { $search: textSearchTerm } }),
        ...tagQuery,
      };
      const othersQuery = {
        eventId: mongoose.Types.ObjectId(event.id),
        published: true,
        ...(textSearchTerm && { $text: { $search: textSearchTerm } }),
        ...tagQuery,
      };

      const query =
        currentEventMember &&
        (currentEventMember.isAdmin || currentEventMember.isGuide)
          ? adminQuery
          : currentEventMember
          ? memberQuery
          : othersQuery;

      const userSeed = currentOrgMember
        ? new Date(currentOrgMember.createdAt).getTime() % 1000
        : 1;

      const dreamsWithExtra = [
        ...(await Dream.aggregate([{ $match: query }])
          .addFields({
            position: {
              $mod: [
                {
                  $multiply: [
                    {
                      $mod: [
                        { $toDouble: { $ifNull: ["$createdAt", 1] } },
                        1000,
                      ],
                    },
                    userSeed,
                  ],
                },
                1000,
              ],
            },
          })
          .sort({
            position: 1,
            _id: 1,
          })
          .skip(offset)
          .limit(limit + 1)),
      ].map((dream) => Dream(dream));

      return {
        moreExist: dreamsWithExtra.length > limit,
        dreams: dreamsWithExtra.slice(0, limit),
      };
    },
    orgMembersPage: async (
      parent,
      { offset, limit },
      { currentOrg, currentOrgMember, models: { OrgMember } }
    ) => {
      if (!currentOrg) return null;
      if (!currentOrgMember?.isOrgAdmin)
        throw new Error("You need to be org admin to view this");

      const orgMembersWithExtra = [
        ...(await OrgMember.find(
          {
            organizationId: currentOrg.id,
          },
          null,
          { skip: offset, limit: limit + 1 }
        )),
      ];

      return {
        moreExist: orgMembersWithExtra.length > limit,
        orgMembers: orgMembersWithExtra.slice(0, limit),
      };
    },
    membersPage: async (
      parent,
      { eventId, isApproved, offset, limit },
      { currentOrgMember, models: { EventMember, Event } }
    ) => {
      if (!currentOrgMember)
        throw new Error("You need to be a member of this org");

      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({ _id: eventId });

      if (
        currentOrgMember.organizationId.toString() !==
        event.organizationId.toString()
      )
        throw new Error("Wrong org..");

      if (
        !(
          (currentEventMember && currentEventMember.isApproved) ||
          currentOrgMember.isOrgAdmin
        )
      )
        throw new Error(
          "You need to be approved member of this event or org admin to view EventMembers"
        );

      const eventMembersWithExtra = [
        ...(await EventMember.find(
          {
            eventId,
            ...(typeof isApproved === "boolean" && { isApproved }),
          },
          null,
          { skip: offset, limit: limit + 1 }
        )),
      ];

      return {
        moreExist: eventMembersWithExtra.length > limit,
        members: eventMembersWithExtra.slice(0, limit),
      };
    },
    categories: async (parent, args, { currentOrg, currentOrgMember }) => {
      if (!currentOrg.discourse) {
        return [];
      }

      const categories = await discourse(
        currentOrg.discourse
      ).categories.getAll({
        username: currentOrgMember.discourseUsername,
        apiKey: currentOrgMember.discourseApiKey,
      });

      return categories;
    },
    commentSet: async (
      parent,
      { dreamId, from = 0, limit = 30, order = "desc" },
      { currentOrg, models: { Dream, OrgMember } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      let comments;
      if (orgHasDiscourse(currentOrg)) {
        const topic = await discourse(currentOrg.discourse).posts.get(
          dream.discourseTopicId
        );

        comments = await Promise.all(
          topic.post_stream.posts
            .filter((post) => post.post_number > 1)
            .filter((post) => !post.user_deleted)
            .map(async (post) => {
              const author = await OrgMember.findOne({
                organizationId: currentOrg.id,
                discourseUsername: post.username,
              });
              return generateComment(post, author);
            })
        );
      } else {
        comments = dream.comments;
      }

      if (order === "desc") {
        comments = comments.reverse();
      }
      return {
        total: comments.length,
        comments: comments.slice(from, from + limit),
      };
    },
  },
  Mutation: {
    createOrganization: async (
      parent,
      { name, subdomain: dirtySubdomain, logo },
      {
        kauth,
        kcAdminClient,
        currentOrgMember,
        models: { Organization, OrgMember },
        eventHub,
      }
    ) => {
      if (!kauth) throw new Error("You need to be logged in!");
      const subdomain = slugify(dirtySubdomain);

      const organization = new Organization({
        name,
        subdomain,
        logo,
      });

      const orgMember = new OrgMember({
        userId: kauth.sub,
        organizationId: organization.id,
        isOrgAdmin: true,
      });

      const [savedOrg] = await Promise.all([
        organization.save(),
        orgMember.save(),
      ]);

      const clientId = "dreams";

      const [client] = await kcAdminClient.clients.findOne({
        clientId,
      });

      if (client.redirectUris) {
        const newRedirectUris = [
          ...client.redirectUris,
          `https://${subdomain}.dreams.wtf/*`,
        ];

        await kcAdminClient.clients.update(
          { id: client.id },
          {
            clientId,
            redirectUris: newRedirectUris,
          }
        );
      }

      await eventHub.publish("create-organization", {
        currentOrganization: savedOrg,
        currentOrgMember,
      });
      return savedOrg;
    },
    editOrganization: async (
      parent,
      { organizationId, name, subdomain: dirtySubdomain, logo },
      {
        currentUser,
        kcAdminClient,
        currentOrgMember,
        models: { Organization },
        eventHub,
      }
    ) => {
      if (!(currentOrgMember && currentOrgMember.isOrgAdmin))
        throw new Error("You need to be logged in as organization admin.");
      if (
        organizationId !== currentOrgMember.organizationId.toString() &&
        !currentUser?.isRootAdmin
      )
        throw new Error("You are not a member of this organization.");

      const subdomain = slugify(dirtySubdomain);

      const organization = await Organization.findOne({
        _id: organizationId,
      });

      const isUpdatingRedirectUris = subdomain !== organization.subdomain;
      let newRedirectUris;

      const clientId = "dreams";

      const [client] = await kcAdminClient.clients.findOne({
        clientId,
      });

      if (isUpdatingRedirectUris) {
        const { redirectUris } = client;

        const oldRedirectUri = `https://${organization.subdomain}.dreams.wtf/*`;

        newRedirectUris = [
          ...redirectUris.filter((uri) => uri !== oldRedirectUri),
          `https://${subdomain}.dreams.wtf/*`,
        ];
      }

      organization.name = name;
      organization.logo = logo;
      organization.subdomain = subdomain;
      // organization.customDomain = customDomain;

      await organization.save();

      if (isUpdatingRedirectUris)
        await kcAdminClient.clients.update(
          { id: client.id },
          {
            clientId,
            redirectUris: newRedirectUris,
          }
        );

      await eventHub.publish("edit-organization", {
        currentOrg: organization,
        currentOrgMember,
      });
      return organization;
    },
    setTodosFinished: async (
      parent,
      args,
      { currentOrg, currentOrgMember }
    ) => {
      if (!(currentOrgMember && currentOrgMember.isOrgAdmin))
        throw new Error("You need to be logged in as organization admin.");

      currentOrg.finishedTodos = true;
      await currentOrg.save();

      return currentOrg;
    },
    createEvent: async (
      parent,
      { slug, title, description, summary, currency, registrationPolicy },
      { currentOrgMember, currentOrg, models: { Event, EventMember }, eventHub }
    ) => {
      if (!(currentOrgMember && currentOrgMember.isOrgAdmin))
        throw new Error("You need to be logged in as organisation admin.");

      const event = await new Event({
        slug,
        title,
        description,
        summary,
        currency,
        registrationPolicy,
        organizationId: currentOrg.id,
        customFields: [
          {
            name: "Description",
            description: "Describe your Dream",
            type: "MULTILINE_TEXT",
            isRequired: false,
            position: 1001,
          },
        ],
      }).save();

      await new EventMember({
        orgMemberId: currentOrgMember.id,
        eventId: event.id,
        isAdmin: true,
        isApproved: true,
      }).save();

      await eventHub.publish("create-event", {
        currentOrg,
        currentOrgMember,
        event,
      });
      return event;
    },
    editEvent: async (
      parent,
      {
        eventId,
        slug,
        title,
        archived,
        registrationPolicy,
        info,
        color,
        about,
        dreamReviewIsOpen,
        discourseCategoryId,
      },
      { currentOrg, currentOrgMember, models: { Event, EventMember }, eventHub }
    ) => {
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({
        _id: eventId,
        organizationId: currentOrgMember.organizationId,
      });
      if (!event)
        throw new Error("Can't find event in your organization to edit");

      if (
        !((eventMember && eventMember.isAdmin) || currentOrgMember.isOrgAdmin)
      )
        throw new Error("You need to be admin of this event.");

      if (slug) event.slug = slugify(slug);
      if (title) event.title = title;
      if (typeof archived !== "undefined") event.archived = archived;
      if (registrationPolicy) event.registrationPolicy = registrationPolicy;
      if (typeof info !== "undefined") event.info = info;
      if (typeof about !== "undefined") event.about = about;
      if (color) event.color = color;
      if (typeof dreamReviewIsOpen !== "undefined")
        event.dreamReviewIsOpen = dreamReviewIsOpen;
      if (discourseCategoryId) event.discourseCategoryId = discourseCategoryId;

      await eventHub.publish("edit-event", {
        currentOrg,
        currentOrgMember,
        event,
      });
      return event.save();
    },
    deleteEvent: async (
      parent,
      { eventId },
      {
        currentOrgMember,
        currentOrg,
        models: { Event, Grant, Dream, EventMember },
        eventHub,
      }
    ) => {
      if (!(currentOrgMember && currentOrgMember.isOrgAdmin))
        throw new Error("You need to be org. admin to delete event");

      const event = await Event.findOne({
        _id: eventId,
        organizationId: currentOrgMember.organizationId,
      });

      if (!event)
        throw new Error("Can't find event in your organization to delete.");

      await Grant.deleteMany({ eventId });
      await Dream.deleteMany({ eventId });
      await EventMember.deleteMany({ eventId });

      await eventHub.publish("delete-event", {
        currentOrg,
        currentOrgMember,
        event,
      });
      return event.remove();
    },
    addGuideline: async (
      parent,
      { eventId, guideline },
      { currentOrgMember, models: { Event, EventMember } }
    ) => {
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({
        _id: eventId,
        organizationId: currentOrgMember.organizationId,
      });

      if (!event)
        throw new Error("Can't find event in your organization to delete.");

      if (
        !((eventMember && eventMember.isAdmin) || currentOrgMember.isOrgAdmin)
      )
        throw new Error("You need to be admin to add a guideline");

      const position =
        event.guidelines
          .map((gl) => gl.position)
          .reduce((a, b) => Math.max(a, b), 1000) + 1;

      event.guidelines.push({ ...guideline, position });

      return event.save();
    },
    editGuideline: async (
      parent,
      { eventId, guidelineId, guideline },
      { currentOrgMember, models: { Event, EventMember } }
    ) => {
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({
        _id: eventId,
        organizationId: currentOrgMember.organizationId,
      });

      if (!event)
        throw new Error("Can't find event in your organization to edit.");

      if (
        !((eventMember && eventMember.isAdmin) || currentOrgMember.isOrgAdmin)
      )
        throw new Error("You need to be admin to edit a guideline");

      let doc = event.guidelines.id(guidelineId);

      doc.title = guideline.title;
      doc.description = guideline.description;

      return event.save();
    },
    setGuidelinePosition: async (
      parent,
      { eventId, guidelineId, newPosition },
      { currentOrgMember, models: { Event, EventMember } }
    ) => {
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({
        _id: eventId,
        organizationId: currentOrgMember.organizationId,
      });

      if (!event)
        throw new Error("Can't find event in your organization to edit.");

      if (
        !((eventMember && eventMember.isAdmin) || currentOrgMember.isOrgAdmin)
      )
        throw new Error("You need to be admin to edit a guideline");

      let doc = event.guidelines.id(guidelineId);
      doc.position = newPosition;
      return event.save();
    },
    deleteGuideline: async (
      parent,
      { eventId, guidelineId },
      { currentOrgMember, models: { Event, EventMember } }
    ) => {
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({
        _id: eventId,
        organizationId: currentOrgMember.organizationId,
      });

      if (!event)
        throw new Error("Can't find event in your organization to edit.");

      if (
        !((eventMember && eventMember.isAdmin) || currentOrgMember.isOrgAdmin)
      )
        throw new Error("You need to be admin to remove a guideline");

      let doc = event.guidelines.id(guidelineId);
      doc.remove();

      return event.save();
    },
    addCustomField: async (
      parent,
      { eventId, customField },
      { currentOrgMember, models: { EventMember, Event } }
    ) => {
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({
        _id: eventId,
        organizationId: currentOrgMember.organizationId,
      });

      if (!event)
        throw new Error("Can't find event in your organization to edit.");

      if (
        !((eventMember && eventMember.isAdmin) || currentOrgMember.isOrgAdmin)
      )
        throw new Error("You need to be admin to add a custom field");

      const position =
        event.customFields
          .map((cf) => cf.position)
          .reduce((a, b) => Math.max(a, b), 1000) + 1;

      event.customFields.push({ ...customField, position });

      return event.save();
    },
    // Based on https://softwareengineering.stackexchange.com/a/195317/54663
    setCustomFieldPosition: async (
      parent,
      { eventId, fieldId, newPosition },
      { currentOrgMember, models: { EventMember, Event } }
    ) => {
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({
        _id: eventId,
        organizationId: currentOrgMember.organizationId,
      });

      if (!event)
        throw new Error("Can't find event in your organization to edit.");

      if (
        !((eventMember && eventMember.isAdmin) || currentOrgMember.isOrgAdmin)
      )
        throw new Error("You need to be admin to edit a custom field");

      let doc = event.customFields.id(fieldId);
      doc.position = newPosition;
      return event.save();
    },
    editCustomField: async (
      parent,
      { eventId, fieldId, customField },
      { currentOrgMember, models: { EventMember, Event } }
    ) => {
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({
        _id: eventId,
        organizationId: currentOrgMember.organizationId,
      });

      if (!event)
        throw new Error("Can't find event in your organization to edit.");

      if (
        !((eventMember && eventMember.isAdmin) || currentOrgMember.isOrgAdmin)
      )
        throw new Error("You need to be admin to edit a custom field");

      let doc = event.customFields.id(fieldId);
      // doc = { ...doc, ...customField };
      doc.name = customField.name;
      doc.type = customField.type;
      doc.limit = customField.limit;
      doc.description = customField.description;
      doc.isRequired = customField.isRequired;

      return event.save();
    },
    deleteCustomField: async (
      parent,
      { eventId, fieldId },
      { currentOrgMember, models: { EventMember, Event } }
    ) => {
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({
        _id: eventId,
        organizationId: currentOrgMember.organizationId,
      });

      if (!event)
        throw new Error("Can't find event in your organization to edit.");

      if (
        !((eventMember && eventMember.isAdmin) || currentOrgMember.isOrgAdmin)
      )
        throw new Error("You need to be admin to delete a custom field");

      let doc = event.customFields.id(fieldId);
      doc.remove();

      return event.save();
    },
    createDream: async (
      parent,
      { eventId, title },
      {
        currentOrgMember,
        currentOrg,
        models: { EventMember, Dream, Event },
        eventHub,
      }
    ) => {
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      if (!eventMember || !eventMember.isApproved)
        throw new Error("You need to be logged in and/or approved");

      const event = await Event.findOne({ _id: eventId });

      if (!event.dreamCreationIsOpen)
        throw new Error("Dream creation is not open");

      // // if maxGoal is defined, it needs to be larger than minGoal, that also needs to be defined
      // if (maxGoal && (maxGoal <= minGoal || minGoal == null))
      //   throw new Error('max goal needs to be larger than min goal');
      const dream = new Dream({
        eventId,
        title,
        cocreators: [eventMember.id],
      });

      await eventHub.publish("create-dream", {
        currentOrg,
        currentOrgMember,
        dream,
        event,
      });

      return dream.save();
    },
    editDream: async (
      parent,
      { dreamId, title, description, summary, images, budgetItems, tags },
      {
        currentOrg,
        currentOrgMember,
        models: { EventMember, Dream, Event },
        eventHub,
      }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });
      const event = await Event.findOne({ _id: dream.eventId });

      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (
        !eventMember ||
        (!dream.cocreators.includes(eventMember.id) &&
          !eventMember.isAdmin &&
          !eventMember.isGuide)
      )
        throw new Error("You are not a cocreator of this dream.");

      if (title) dream.title = title;
      if (typeof description !== "undefined") dream.description = description;
      if (typeof summary !== "undefined") dream.summary = summary;
      if (typeof images !== "undefined") dream.images = images;
      if (typeof budgetItems !== "undefined") dream.budgetItems = budgetItems;
      if (typeof tags !== "undefined")
        dream.tags = tags.map((tag) => slugify(tag));

      await eventHub.publish("edit-dream", {
        currentOrg,
        currentOrgMember,
        event,
        dream,
      });

      return dream.save();
    },
    addTag: async (
      parent,
      { dreamId, tagId, tagValue },
      { currentOrg, currentOrgMember, models: { EventMember, Tag, Dream } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (
        !eventMember ||
        (!dream.cocreators.includes(eventMember.id) &&
          !eventMember.isAdmin &&
          !eventMember.isGuide)
      )
        throw new Error("You are not a cocreator of this dream.");

      if (tagId) {
        dream.tags.push(tagId);
        await dream.save();
      } else if (tagValue) {
        const tag = await new Tag({
          value: tagValue,
          eventId: dream.eventId,
          organizationId: currentOrg.id,
        }).save();
        dream.tags.push(tag.id);
        await dream.save();
      } else {
        throw new Error("You need to provide either tag id or tag value");
      }
      return dream;
    },
    removeTag: async (
      _,
      { dreamId, tagId },
      { currentOrgMember, models: { EventMember, Dream } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (
        !eventMember ||
        (!dream.cocreators.includes(eventMember.id) &&
          !eventMember.isAdmin &&
          !eventMember.isGuide)
      )
        throw new Error("You are not a cocreator of this dream.");

      dream.tags = dream.tags.filter((id) => id.toString() !== tagId);
      return dream.save();
    },
    editDreamCustomField: async (
      parent,
      { dreamId, customField },
      {
        currentOrg,
        currentOrgMember,
        models: { EventMember, Dream, Event },
        eventHub,
      }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      const event = await Event.findOne({ _id: dream.eventId });

      if (
        !eventMember ||
        (!dream.cocreators.includes(eventMember.id) &&
          !eventMember.isAdmin &&
          !eventMember.isGuide)
      )
        throw new Error("You are not a cocreator of this dream.");

      const existingField = dream.customFields.filter((field) => {
        return field.fieldId == customField.fieldId;
      });

      if (existingField.length > 0) {
        existingField[0].value = customField.value;
      } else {
        dream.customFields.push(customField);
      }

      await eventHub.publish("edit-dream", {
        currentOrg,
        currentOrgMember,
        event,
        dream,
      });

      return dream.save();
    },
    deleteDream: async (
      parent,
      { dreamId },
      {
        currentOrg,
        currentOrgMember,
        models: { Dream, EventMember, Contribution, Event },
        eventHub,
      }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });
      const event = await Event.findOne({ _id: dream.eventId });
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (
        !eventMember ||
        (!dream.cocreators.includes(eventMember.id) &&
          !eventMember.isAdmin &&
          !eventMember.isGuide)
      )
        throw new Error("You are not a cocreator of this dream.");

      const [
        { contributionsForDream } = { contributionsForDream: 0 },
      ] = await Contribution.aggregate([
        { $match: { dreamId: mongoose.Types.ObjectId(dreamId) } },
        { $group: { _id: null, contributionsForDream: { $sum: "$amount" } } },
      ]);

      if (contributionsForDream > 0) {
        throw new Error(
          "You cant delete a Dream that has received contributions"
        );
      }

      await eventHub.publish("delete-dream", {
        currentOrg,
        currentOrgMember,
        event,
        dream,
      });
      return dream.remove();
    },
    addCocreator: async (
      parent,
      { dreamId, memberId },
      { currentOrgMember, models: { EventMember, Dream } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (
        !eventMember ||
        (!dream.cocreators.includes(eventMember.id) &&
          !eventMember.isAdmin &&
          !eventMember.isGuide)
      )
        throw new Error("You are not a cocreator of this dream.");

      // check that added memberId is not already part of the thing
      if (dream.cocreators.includes(memberId))
        throw new Error("Member is already cocreator of dream");

      // check that memberId is a member of event
      const member = await EventMember.findOne({
        _id: memberId,
        eventId: dream.eventId,
      });
      if (!member) throw new Error("No member found with this id");

      dream.cocreators.push(memberId);

      return dream.save();
    },
    removeCocreator: async (
      parent,
      { dreamId, memberId },
      { currentOrgMember, models: { EventMember, Dream } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (
        !eventMember.isAdmin &&
        !eventMember.isGuide &&
        !dream.cocreators.includes(eventMember.id)
      )
        throw new Error("You need to be a cocreator to remove co-creators.");

      // check that added memberId is not already part of the thing
      if (!dream.cocreators.includes(memberId))
        throw new Error("Member is not a co-creator of this dream.");

      // can't remove last person
      if (dream.cocreators.length === 1)
        throw new Error("Can't remove last co-creator.");

      dream.cocreators = dream.cocreators.filter(
        (id) => id.toString() !== memberId
      );

      return dream.save();
    },
    publishDream: async (
      parent,
      { dreamId, unpublish },
      {
        currentOrg,
        currentOrgMember,
        models: { EventMember, Dream, Event },
        eventHub,
      }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });
      const event = await Event.findOne({ _id: dream.eventId });

      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (
        !eventMember ||
        (!dream.cocreators.includes(eventMember.id) &&
          !eventMember.isAdmin &&
          !eventMember.isGuide)
      )
        throw new Error("You are not a cocreator of this dream.");

      const { mongodb } = await eventHub.publish("publish-dream", {
        currentOrg,
        currentOrgMember,
        event,
        dream,
        unpublish,
      });

      return mongodb;
    },
    addComment: async (
      parent,
      { content, dreamId },
      { currentOrg, currentOrgMember, models: { Dream, Event }, eventHub }
    ) => {
      if (!currentOrgMember)
        throw new Error("You need to be an org member to post comments.");

      const dream = await Dream.findOne({ _id: dreamId });
      const event = await Event.findOne({ _id: dream.eventId });
      const comment = { content, authorId: currentOrgMember.id };

      const { discourse, mongodb } = await eventHub.publish("create-comment", {
        currentOrg,
        currentOrgMember,
        dream,
        event,
        comment,
      });

      return discourse || mongodb;
    },

    deleteComment: async (
      parent,
      { dreamId, commentId },
      {
        currentOrg,
        currentOrgMember,
        models: { EventMember, Dream, Event },
        eventHub,
      }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });
      const event = await Event.findOne({ _id: dream.eventId });
      const comment = { id: commentId };

      if (!currentOrgMember)
        throw new Error("You need to be member of the org to delete comments");

      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: event.id,
      });

      await eventHub.publish("delete-comment", {
        currentOrg,
        currentOrgMember,
        event,
        eventMember,
        dream,
        comment,
      });

      return comment;
    },
    editComment: async (
      parent,
      { dreamId, commentId, content },
      { currentOrg, currentOrgMember, models: { EventMember, Dream }, eventHub }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });
      const comment = { id: commentId, content };
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      const { discourse, mongodb } = await eventHub.publish("edit-comment", {
        currentOrg,
        currentOrgMember,
        eventMember,
        dream,
        comment,
      });

      return discourse || mongodb;
    },
    raiseFlag: async (
      parent,
      { dreamId, guidelineId, comment },
      { currentOrg, currentOrgMember, models: { Dream, Event, EventMember } }
    ) => {
      // check dreamReviewIsOpen
      // check not already left a flag?

      const dream = await Dream.findOne({
        _id: dreamId,
      });

      const event = await Event.findOne({ _id: dream.eventId });

      const guideline = event.guidelines.id(guidelineId);

      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (!eventMember || !eventMember.isApproved)
        throw new Error("You need to be logged in and/or approved");

      dream.flags.push({
        guidelineId,
        comment,
        type: "RAISE_FLAG",
        userId: currentOrgMember.id,
      });

      const logContent = `Someone flagged this dream for the **${guideline.title}** guideline: \n> ${comment}`;

      if (orgHasDiscourse(currentOrg)) {
        if (!dream.discourseTopicId) {
          // TODO: break out create thread into separate function
          const discoursePost = await discourse(
            currentOrg.discourse
          ).posts.create(
            {
              title: dream.title,
              raw: `https://${
                currentOrg.customDomain
                  ? currentOrg.customDomain
                  : `${currentOrg.subdomain}.${process.env.DEPLOY_URL}`
              }/${event.slug}/${dream.id}`,
              ...(currentOrg.discourse.dreamsCategoryId && {
                category: currentOrg.discourse.dreamsCategoryId,
              }),
            },
            {
              username: "system",
            }
          );

          dream.discourseTopicId = discoursePost.topic_id;
        }

        await discourse(currentOrg.discourse).posts.create(
          {
            topic_id: dream.discourseTopicId,
            raw: logContent,
          },
          { username: "system" }
        );
      } else {
        dream.comments.push({
          authorId: currentOrgMember.id,
          content: logContent,
        });
      }

      return dream.save();
    },
    resolveFlag: async (
      parent,
      { dreamId, flagId, comment },
      { currentOrg, currentOrgMember, models: { Dream, Event, EventMember } }
    ) => {
      // check dreamReviewIsOpen
      // check not already left a flag?

      const dream = await Dream.findOne({
        _id: dreamId,
      });

      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (!eventMember || !eventMember.isApproved)
        throw new Error("You need to be logged in and/or approved");

      dream.flags.push({
        resolvingFlagId: flagId,
        comment,
        type: "RESOLVE_FLAG",
        userId: currentOrgMember.id,
      });

      const resolvedFlag = dream.flags.id(flagId);

      const event = await Event.findOne({ _id: dream.eventId });

      const guideline = event.guidelines.id(resolvedFlag.guidelineId);

      const logContent = `Someone resolved a flag for the **${guideline.title}** guideline: \n> ${comment}`;

      if (orgHasDiscourse(currentOrg)) {
        if (!dream.discourseTopicId) {
          // TODO: break out create thread into separate function
          const discoursePost = await discourse(
            currentOrg.discourse
          ).posts.create(
            {
              title: dream.title,
              raw: `https://${
                currentOrg.customDomain
                  ? currentOrg.customDomain
                  : `${currentOrg.subdomain}.${process.env.DEPLOY_URL}`
              }/${event.slug}/${dream.id}`,
              ...(currentOrg.discourse.dreamsCategoryId && {
                category: currentOrg.discourse.dreamsCategoryId,
              }),
            },
            {
              username: "system",
            }
          );

          dream.discourseTopicId = discoursePost.topic_id;
        }
        await discourse(currentOrg.discourse).posts.create(
          {
            topic_id: dream.discourseTopicId,
            raw: logContent,
          },
          { username: "system" }
        );
      } else {
        dream.comments.push({
          authorId: currentOrgMember.id,
          content: logContent,
          isLog: true,
        });
      }

      return dream.save();
    },
    allGoodFlag: async (
      parent,
      { dreamId },
      { currentOrgMember, models: { Dream, EventMember } }
    ) => {
      // check dreamReviewIsOpen
      // check have not left one of these flags already
      const dream = await Dream.findOne({
        _id: dreamId,
      });

      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (!eventMember || !eventMember.isApproved)
        throw new Error("You need to be logged in and/or approved");

      for (const flag in dream.flags) {
        if (
          flag.userId === currentOrgMember.id &&
          flag.type === "ALL_GOOD_FLAG"
        )
          throw new Error("You have already left an all good flag");
      }

      dream.flags.push({
        type: "ALL_GOOD_FLAG",
        userId: currentOrgMember.id,
      });

      return dream.save();
    },

    joinOrg: async (
      parent,
      args,
      { kauth, currentOrg, models: { OrgMember } }
    ) => {
      if (!kauth) throw new Error("You need to be logged in.");

      return new OrgMember({
        userId: kauth.sub,
        organizationId: currentOrg.id,
      }).save();
    },
    updateProfile: async (
      parent,
      { firstName, lastName, username, bio },
      { kauth, currentOrgMember, kcAdminClient }
    ) => {
      if (!kauth) throw new Error("You need to be logged in..");

      if (firstName || lastName || username) {
        try {
          await kcAdminClient.users.update(
            { id: kauth.sub },
            {
              ...(typeof firstName !== "undefined" && { firstName }),
              ...(typeof lastName !== "undefined" && { lastName }),
              ...(typeof username !== "undefined" && { username }),
            }
          );
        } catch (error) {
          throw new Error(error);
        }
      }

      if (currentOrgMember && bio) {
        currentOrgMember.bio = bio;
        await currentOrgMember.save();
      }

      return kcAdminClient.users.findOne({ id: kauth.sub });
    },
    inviteEventMembers: async (
      parent,
      { emails: emailsString, eventId },
      {
        currentOrgMember,
        currentOrg,
        kcAdminClient,
        models: { OrgMember, EventMember, Event },
      }
    ) => {
      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({ _id: eventId });

      if (!currentEventMember || !currentEventMember.isAdmin)
        throw new Error("You need to be admin to invite new members");

      const emails = emailsString.split(",");

      if (emails.length > 1000)
        throw new Error("You can only invite 1000 people at a time");

      // let newOrgMembers = [];
      const newEventMembers = [];

      for (const email of emails) {
        const [user] = await kcAdminClient.users.findOne({
          email: email.trim(),
        });

        if (user) {
          const orgMember = await OrgMember.findOne({
            userId: user.id,
            organizationId: currentOrg.id,
          });
          if (orgMember) {
            const eventMember = await EventMember.findOne({
              orgMemberId: orgMember.id,
              eventId,
            });
            if (eventMember) {
              eventMember.isApproved = true;
              await eventMember.save();
            } else {
              newEventMembers.push(
                await new EventMember({
                  orgMemberId: orgMember.id,
                  eventId,
                  isApproved: true,
                }).save()
              );
            }
          } else {
            const orgMember = await new OrgMember({
              userId: user.id,
              organizationId: currentOrgMember.organizationId,
            }).save();

            newEventMembers.push(
              await new EventMember({
                orgMemberId: orgMember.id,
                eventId,
                isApproved: true,
              }).save()
            );
          }
        } else {
          const user = await kcAdminClient.users.create({
            username: email.trim(),
            email: email.trim(),
            requiredActions: [
              KCRequiredActionAlias.UPDATE_PROFILE,
              KCRequiredActionAlias.UPDATE_PASSWORD,
            ],
            enabled: true,
          });

          await kcAdminClient.users.executeActionsEmail({
            id: user.id,
            lifespan: 60 * 60 * 24 * 90,
            actions: [
              KCRequiredActionAlias.UPDATE_PROFILE,
              KCRequiredActionAlias.UPDATE_PASSWORD,
            ],
            clientId: "dreams",
            redirectUri: `${
              process.env.NODE_ENV === "production" ? "https" : "http"
            }://${
              currentOrg.customDomain
                ? currentOrg.customDomain
                : `${currentOrg.subdomain}.${process.env.DEPLOY_URL}`
            }/${event.slug}`,
          });

          const orgMember = await new OrgMember({
            userId: user.id,
            organizationId: currentOrgMember.organizationId,
          }).save();

          newEventMembers.push(
            await new EventMember({
              orgMemberId: orgMember.id,
              eventId,
              isApproved: true,
            }).save()
          );
        }
      }
      return newEventMembers;
    },
    inviteOrgMembers: async (
      parent,
      { emails: emailsString },
      { currentOrgMember, currentOrg, kcAdminClient, models: { OrgMember } }
    ) => {
      if (!currentOrgMember?.isOrgAdmin)
        throw new Error("You need to be org. admin to invite members.");

      const emails = emailsString.split(",");

      if (emails.length > 1000)
        throw new Error("You can only invite 1000 people at a time");

      let newOrgMembers = [];

      for (const email of emails) {
        const [user] = await kcAdminClient.users.findOne({
          email: email.trim(),
        });
        if (user) {
          const orgMember = await OrgMember.findOne({
            userId: user.id,
            organizationId: currentOrg.id,
          });
          if (!orgMember) {
            newOrgMembers.push(
              await new OrgMember({
                userId: user.id,
                organizationId: currentOrgMember.organizationId,
              }).save()
            );
          }
        } else {
          const user = await kcAdminClient.users.create({
            username: email.trim(),
            email: email.trim(),
            requiredActions: [
              KCRequiredActionAlias.UPDATE_PROFILE,
              KCRequiredActionAlias.UPDATE_PASSWORD,
            ],
            enabled: true,
          });

          await kcAdminClient.users.executeActionsEmail({
            id: user.id,
            lifespan: 60 * 60 * 24 * 90,
            actions: [
              KCRequiredActionAlias.UPDATE_PROFILE,
              KCRequiredActionAlias.UPDATE_PASSWORD,
            ],
            clientId: "dreams",
            redirectUri: `${
              process.env.NODE_ENV === "production" ? "https" : "http"
            }://${
              currentOrg.customDomain
                ? currentOrg.customDomain
                : `${currentOrg.subdomain}.${process.env.DEPLOY_URL}`
            }/`,
          });

          newOrgMembers.push(
            await new OrgMember({
              userId: user.id,
              organizationId: currentOrgMember.organizationId,
            }).save()
          );
        }
      }

      return newOrgMembers;
    },
    updateOrgMember: async (
      parent,
      { memberId, isOrgAdmin },
      { currentOrg, currentOrgMember, models: { OrgMember } }
    ) => {
      if (!currentOrgMember?.isOrgAdmin)
        throw new Error("You need to be org admin to update member");

      const orgMember = await OrgMember.findOne({
        _id: memberId,
        organizationId: currentOrg.id,
      });

      if (!orgMember) throw new Error("No member to update found");

      if (typeof isOrgAdmin !== "undefined") {
        if (isOrgAdmin === false) {
          const orgAdmins = await OrgMember.find({
            organizationId: currentOrg.id,
            isOrgAdmin: true,
          });
          if (orgAdmins.length <= 1)
            throw new Error("You need at least 1 org admin");
        }
        orgMember.isOrgAdmin = isOrgAdmin;
      }
      return orgMember.save();
    },
    updateMember: async (
      parent,
      { eventId, memberId, isApproved, isAdmin, isGuide },
      { currentOrgMember, models: { EventMember } }
    ) => {
      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      if (
        !(
          (currentEventMember && currentEventMember.isAdmin) ||
          currentOrgMember.isOrgAdmin
        )
      )
        throw new Error("You need to be admin to update member");

      const member = await EventMember.findOne({
        _id: memberId,
        eventId,
      });

      if (!member) throw new Error("No member to update found");

      if (typeof isApproved !== "undefined") {
        member.isApproved = isApproved;
      } // send notification on approving?
      if (typeof isAdmin !== "undefined") {
        member.isAdmin = isAdmin;
      }
      if (typeof isGuide !== "undefined") {
        member.isGuide = isGuide;
      }
      return member.save();
    },
    deleteMember: async (
      parent,
      { eventId, memberId },
      { currentOrgMember, models: { EventMember } }
    ) => {
      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      if (
        !(
          (currentEventMember && currentEventMember.isAdmin) ||
          currentOrgMember.isOrgAdmin
        )
      )
        throw new Error("You need to be admin to delete member");

      const member = await EventMember.findOneAndDelete({
        _id: memberId,
        eventId,
      });

      return member;
    },
    deleteOrganization: async (
      parent,
      { organizationId },
      { currentUser, currentOrgMember, models: { Organization } }
    ) => {
      if (
        !(
          (currentOrgMember && currentOrgMember.isOrgAdmin) ||
          currentUser.isRootAdmin
        )
      )
        throw new Error(
          "You need to be org. or root admin to delete an organization"
        );

      const organization = await Organization.findOne({
        _id: organizationId,
      });

      if (!organization)
        throw new Error(`Cant find organization by id ${organizationId}`);

      return await Organization.findOneAndDelete({
        _id: organizationId,
      });
    },
    approveForGranting: async (
      parent,
      { dreamId, approved },
      { currentOrgMember, models: { Dream, EventMember } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (
        !currentEventMember ||
        (!currentEventMember.isAdmin && !currentEventMember.isGuide)
      )
        throw new Error(
          "You need to be admin or guide to approve for granting"
        );

      dream.approved = approved;
      if (approved) {
        dream.canceledAt = null;
      }

      return dream.save();
    },
    allocate: async (
      _,
      { eventMemberId, amount, type },
      { currentOrgMember, models: { EventMember, Allocation, Contribution } }
    ) => {
      if (!currentOrgMember) throw new Error("You need to be logged in.");

      const targetEventMember = await EventMember.findOne({
        _id: eventMemberId,
      });

      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: targetEventMember.eventId,
      });

      if (!currentEventMember?.isAdmin)
        throw new Error("You need to be event admin to allocate funds.");

      await allocateToMember(
        {
          eventMemberId,
          eventId: targetEventMember.eventId,
          organizationId: currentOrgMember.organizationId,
          amount,
          type,
        },
        { Allocation, Contribution }
      );

      return targetEventMember;
    },
    bulkAllocate: async (
      _,
      { eventId, amount, type },
      { currentOrgMember, models: { EventMember, Allocation, Contribution } }
    ) => {
      if (!currentOrgMember) throw new Error("You need to be logged in.");

      const eventMembers = await EventMember.find({
        eventId,
        isApproved: true,
      });

      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      if (!currentEventMember?.isAdmin)
        throw new Error("You need to be event admin to allocate funds.");

      for (const member of eventMembers) {
        await allocateToMember(
          {
            eventMemberId: member.id,
            organizationId: currentOrgMember.organizationId,
            eventId,
            amount,
            type,
          },
          { Allocation, Contribution }
        );
      }

      return eventMembers;
    },
    contribute: async (
      _,
      { eventId, dreamId, amount },
      {
        currentOrgMember,
        models: { Dream, Event, EventMember, Allocation, Contribution },
      }
    ) => {
      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      if (!currentEventMember || !currentEventMember.isApproved)
        throw new Error(
          "You need to be a logged in approved member to fund things"
        );

      if (amount <= 0) throw new Error("Value needs to be more than zero");

      const event = await Event.findOne({ _id: eventId });

      // Check that granting is open
      if (!event.grantingIsOpen) throw new Error("Granting is not open");

      const dream = await Dream.findOne({ _id: dreamId, eventId });

      if (!dream.approved)
        throw new Error("Dream is not approved for granting");

      if (dream.canceled)
        throw new Error("Funding has been canceled for dream");

      if (dream.funded) throw new Error("Dream has been funded");

      if (dream.completed) throw new Error("Dream is already completed");

      // Check that the max goal of the dream is not exceeded
      const [
        { contributionsForDream } = { contributionsForDream: 0 },
      ] = await Contribution.aggregate([
        { $match: { dreamId: mongoose.Types.ObjectId(dreamId) } },
        { $group: { _id: null, contributionsForDream: { $sum: "$amount" } } },
      ]);

      const maxGoal = Math.max(dream.maxGoal, dream.minGoal);

      if (contributionsForDream + amount > maxGoal)
        throw new Error("You can't overfund this dream.");

      // mark dream as funded if it has reached its max goal
      if (contributionsForDream + amount === maxGoal) {
        dream.fundedAt = Date.now();
      }

      // Check that it is not more than is allowed per dream (if this number is set)

      const [
        { contributionsFromUserToThisDream } = {
          contributionsFromUserToThisDream: 0,
        },
      ] = await Contribution.aggregate([
        {
          $match: {
            eventMemberId: mongoose.Types.ObjectId(currentEventMember.id),
            dreamId: mongoose.Types.ObjectId(dreamId),
          },
        },
        {
          $group: {
            _id: null,
            contributionsFromUserToThisDream: { $sum: "$amount" },
          },
        },
      ]);

      if (
        event.maxAmountToDreamPerUser &&
        amount + contributionsFromUserToThisDream >
          event.maxAmountToDreamPerUser
      ) {
        throw new Error(
          `You can give a maximum of ${event.maxAmountToDreamPerUser / 100} ${
            event.currency
          } to one dream`
        );
      }

      // Check that user has not spent more tokens than he has
      const [
        { contributionsFromUser } = { contributionsFromUser: 0 },
      ] = await Contribution.aggregate([
        {
          $match: {
            eventMemberId: mongoose.Types.ObjectId(currentEventMember.id),
          },
        },
        { $group: { _id: null, contributionsFromUser: { $sum: "$amount" } } },
      ]);

      const [
        { allocationsForUser } = { allocationsForUser: 0 },
      ] = await Allocation.aggregate([
        {
          $match: {
            eventMemberId: mongoose.Types.ObjectId(currentEventMember.id),
          },
        },
        { $group: { _id: null, allocationsForUser: { $sum: "$amount" } } },
      ]);

      if (contributionsFromUser + amount > allocationsForUser)
        throw new Error("You are trying to spend more than what you have.");

      await new Contribution({
        organizationId: currentOrgMember.organizationId,
        eventId,
        eventMemberId: currentEventMember.id,
        dreamId,
        amount,
      }).save();

      return dream;
    },
    markAsCompleted: async (
      _,
      { dreamId },
      { currentOrgMember, models: { Dream, EventMember } }
    ) => {
      if (!currentOrgMember) {
        throw new Error("You need to be logged in.");
      }
      const dream = await Dream.findOne({ _id: dreamId });

      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });
      if (!currentEventMember?.isAdmin)
        throw new Error(
          "You need to be event admin to mark a dream as completed"
        );

      dream.completedAt = Date.now();
      return dream.save();
    },
    acceptFunding: async (
      _,
      { dreamId },
      { currentOrgMember, models: { Dream, EventMember, Contribution } }
    ) => {
      if (!currentOrgMember) {
        throw new Error("You need to be logged in.");
      }
      const dream = await Dream.findOne({ _id: dreamId });

      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (
        !currentEventMember ||
        (!dream.cocreators.includes(currentEventMember.id) &&
          !currentEventMember.isAdmin)
      )
        throw new Error("You are not an admin or cocreator of this dream.");

      const [
        { contributionsForDream } = { contributionsForDream: 0 },
      ] = await Contribution.aggregate([
        {
          $match: {
            dreamId: dream._id,
          },
        },
        { $group: { _id: null, contributionsForDream: { $sum: "$amount" } } },
      ]);

      if (contributionsForDream < dream.minGoal)
        throw new Error("Dream has not reached its minimum goal yet.");

      dream.fundedAt = Date.now();
      return dream.save();
    },
    cancelFunding: async (
      _,
      { dreamId },
      { currentOrgMember, models: { Dream, EventMember, Contribution } }
    ) => {
      if (!currentOrgMember) {
        throw new Error("You need to be logged in.");
      }
      const dream = await Dream.findOne({ _id: dreamId });

      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (
        !currentEventMember ||
        (!dream.cocreators.includes(currentEventMember.id) &&
          !currentEventMember.isAdmin)
      )
        throw new Error("You are not an admin or cocreator of this dream.");

      if (dream.completed)
        throw new Error(
          "This dream has already been marked completed, can't cancel funding."
        );

      dream.fundedAt = null;
      dream.approved = false;
      dream.canceledAt = Date.now();

      // delete all contributions
      await Contribution.deleteMany({ dreamId });

      // TODO: notify contribuors that they have been "re-imbursed"

      return dream.save();
    },
    updateGrantingSettings: async (
      parent,
      {
        eventId,
        currency,
        maxAmountToDreamPerUser,
        dreamCreationCloses,
        grantingOpens,
        grantingCloses,
        allowStretchGoals,
      },
      { currentOrgMember, models: { Event, EventMember } }
    ) => {
      const currentEventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId,
      });

      const event = await Event.findOne({
        _id: eventId,
        organizationId: currentOrgMember.organizationId,
      });

      if (!event)
        throw new Error("Can't find event in your organization to edit");

      if (
        !(
          (currentEventMember && currentEventMember.isAdmin) ||
          currentOrgMember.isOrgAdmin
        )
      )
        throw new Error("You need to be admin to update granting settings.");

      const dreamCreationHasClosed = dayjs(event.dreamCreationCloses).isBefore(
        dayjs()
      );

      if (currency) {
        // granting can't have started to change currency
        if (dreamCreationHasClosed) {
          throw new Error(
            "You can't change currency after dream creation closes"
          );
        }
        event.currency = currency;
      }

      if (typeof maxAmountToDreamPerUser !== "undefined") {
        event.maxAmountToDreamPerUser = maxAmountToDreamPerUser;
      }

      if (typeof dreamCreationCloses !== "undefined") {
        event.dreamCreationCloses = dreamCreationCloses;
      }

      if (typeof grantingOpens !== "undefined") {
        event.grantingOpens = grantingOpens;
      }

      if (typeof grantingCloses !== "undefined") {
        event.grantingCloses = grantingCloses;
      }

      if (typeof allowStretchGoals !== "undefined") {
        event.allowStretchGoals = allowStretchGoals;
      }

      return event.save();
    },
    registerForEvent: async (
      parent,
      { eventId },
      {
        kauth,
        currentOrg,
        currentOrgMember,
        models: { EventMember, Event, OrgMember },
      }
    ) => {
      if (!kauth) throw new Error("You need to be logged in.");

      let orgMember = currentOrgMember;

      if (!orgMember) {
        orgMember = await new OrgMember({
          userId: kauth.sub,
          organizationId: currentOrg.id,
        }).save();
      }

      const currentEventMember = await EventMember.findOne({
        orgMemberId: orgMember.id,
        eventId,
      });

      if (currentEventMember) throw new Error("You are already a member");

      const event = await Event.findOne({ _id: eventId });

      let newMember = {
        isAdmin: false,
        eventId,
        orgMemberId: orgMember.id,
      };

      if (orgMember.isOrgAdmin) {
        newMember.isApproved = true;
      } else {
        switch (event.registrationPolicy) {
          case "OPEN":
            newMember.isApproved = true;
            break;
          case "REQUEST_TO_JOIN":
            newMember.isApproved = false;

            // TODO: need to fix this.. no emails saved in orgmembers
            // // send request to join notification emails
            // const admins = await EventMember.find({
            //   eventId,
            //   isAdmin: true,
            // }).populate('orgMemberId');

            // const adminEmails = admins.map((member) => member.orgMemberId.email);
            // await EmailService.sendRequestToJoinNotifications(
            //   currentOrg,
            //   currentUser,
            //   event,
            //   adminEmails
            // );
            break;

          case "INVITE_ONLY":
            throw new Error("This event is invite only");
        }
      }

      return new EventMember(newMember).save();
    },
  },
  Subscription: {
    commentsChanged: {
      subscribe: () => liveUpdate.asyncIterator(["commentsChanged"]),
    },
  },
  EventMember: {
    event: async (member, args, { models: { Event } }) => {
      return Event.findOne({ _id: member.eventId });
    },
    orgMember: async (member, args, { models: { OrgMember } }) => {
      return OrgMember.findOne({ _id: member.orgMemberId });
    },
    balance: async (member, args, { models: { Allocation, Contribution } }) => {
      const [
        { totalAllocations } = { totalAllocations: 0 },
      ] = await Allocation.aggregate([
        {
          $match: {
            eventMemberId: mongoose.Types.ObjectId(member.id),
          },
        },
        { $group: { _id: null, totalAllocations: { $sum: "$amount" } } },
      ]);

      const [
        { totalContributions } = { totalContributions: 0 },
      ] = await Contribution.aggregate([
        {
          $match: {
            eventMemberId: mongoose.Types.ObjectId(member.id),
          },
        },
        { $group: { _id: null, totalContributions: { $sum: "$amount" } } },
      ]);

      return totalAllocations - totalContributions;
    },
  },
  OrgMember: {
    hasDiscourseApiKey: (orgMember) => !!orgMember.discourseApiKey,
    user: async (orgMember, args, { kcAdminClient }) => {
      const user = await kcAdminClient.users.findOne({
        id: orgMember.userId,
      });
      return user;
    },
    eventMemberships: async (orgMember, args, { models: { EventMember } }) => {
      return EventMember.find({ orgMemberId: orgMember.id });
    },
    currentEventMembership: async (
      orgMember,
      { slug },
      { currentOrgMember, models: { EventMember, Event } }
    ) => {
      if (!slug || !currentOrgMember) return null;
      if (orgMember.id.toString() !== currentOrgMember.id.toString())
        return null;

      const event = await Event.findOne({
        organizationId: currentOrgMember.organizationId,
        slug,
      });

      return EventMember.findOne({
        orgMemberId: orgMember.id,
        eventId: event.id,
      });
    },
  },
  User: {
    currentOrgMember: async (user, args, { currentOrgMember }) => {
      if (!currentOrgMember) return null;
      return user.sub === currentOrgMember.userId ? currentOrgMember : null;
    },
    orgMemberships: async (user, args, { models: { OrgMember } }) => {
      return OrgMember.find({ userId: user.id });
    },
    id: (user) => (user.sub ? user.sub : user.id),
    username: (user) =>
      user.username ? user.username : user.preferred_username,
    name: (user) => {
      const firstName = user.firstName ? user.firstName : user.given_name;
      const lastName = user.lastName ? user.lastName : user.family_name;

      if (firstName || lastName)
        return `${firstName ? firstName : ""} ${lastName ? lastName : ""}`;
      return null;
    },
    firstName: (user) => (user.firstName ? user.firstName : user.given_name),
    lastName: (user) => (user.lastName ? user.lastName : user.family_name),
    createdAt: (user) => user.createdTimestamp,
    verifiedEmail: (user) => user.emailVerified,
    // email: async (user, args, { currentOrgMember, models: { OrgMember } }) => {
    //   if (currentOrgMember && currentOrgMember.isOrgAdmin) {
    //     const orgMember = await OrgMember.findOne({ userId: user.id });

    //     if (
    //       orgMember &&
    //       orgMember.organizationId.toString() ==
    //         currentOrgMember.organizationId.toString()
    //     )
    //       return user.email;
    //   }
    //   return null;
    // },
    isRootAdmin: () => false, //TODO: add something in keycloak that lets us define root admins
    avatar: () => null, //TODO: what about avatars in keycloak?
  },
  Organization: {
    events: async (organization, args, { models: { Event } }) => {
      return Event.find({ organizationId: organization.id });
    },
    discourseUrl: (organization) => organization.discourse?.url,
    finishedTodos: (org, args, { currentOrgMember }) => {
      if (!(currentOrgMember && currentOrgMember.isOrgAdmin)) {
        // You need to be logged in as organization admin
        return false;
      }

      return org.finishedTodos;
    },
  },
  Event: {
    info: (event) => {
      return event.info && event.info.length
        ? event.info
        : `# Welcome to ${event.title}`;
    },
    about: (event) => {
      return event.about && event.about.length
        ? event.about
        : `# About ${event.title}`;
    },
    numberOfApprovedMembers: async (
      event,
      args,
      { models: { EventMember } }
    ) => {
      return EventMember.countDocuments({
        eventId: event.id,
        isApproved: true,
      });
    },
    totalAllocations: async (event, args, { models: { Allocation } }) => {
      const [
        { totalAllocations } = { totalAllocations: 0 },
      ] = await Allocation.aggregate([
        {
          $match: {
            eventId: mongoose.Types.ObjectId(event.id),
          },
        },
        { $group: { _id: null, totalAllocations: { $sum: "$amount" } } },
      ]);
      return totalAllocations;
    },
    totalContributions: async (event, args, { models: { Contribution } }) => {
      const [
        { totalContributions } = { totalContributions: 0 },
      ] = await Contribution.aggregate([
        {
          $match: {
            eventId: mongoose.Types.ObjectId(event.id),
          },
        },
        { $group: { _id: null, totalContributions: { $sum: "$amount" } } },
      ]);
      return totalContributions;
    },
    totalContributionsFunding: async (
      event,
      args,
      { models: { Contribution, Dream } }
    ) => {
      const fundingNowDreamIds = await Dream.distinct("_id", {
        eventId: event.id,
        fundedAt: null,
      });

      const [
        { totalContributions } = { totalContributions: 0 },
      ] = await Contribution.aggregate([
        {
          $match: {
            eventId: mongoose.Types.ObjectId(event.id),
            dreamId: { $in: fundingNowDreamIds },
          },
        },
        { $group: { _id: null, totalContributions: { $sum: "$amount" } } },
      ]);

      return totalContributions;
    },
    totalContributionsFunded: async (
      event,
      args,
      { models: { Contribution, Dream } }
    ) => {
      const fundedDreamIds = await Dream.distinct("_id", {
        eventId: event.id,
        fundedAt: { $ne: null },
      });

      const [
        { totalContributions } = { totalContributions: 0 },
      ] = await Contribution.aggregate([
        {
          $match: {
            eventId: mongoose.Types.ObjectId(event.id),
            dreamId: { $in: fundedDreamIds },
          },
        },
        { $group: { _id: null, totalContributions: { $sum: "$amount" } } },
      ]);

      return totalContributions;
    },
    totalInMembersBalances: async (
      event,
      args,
      { models: { Contribution, Allocation } }
    ) => {
      const [
        { totalAllocations } = { totalAllocations: 0 },
      ] = await Allocation.aggregate([
        {
          $match: {
            eventId: mongoose.Types.ObjectId(event.id),
          },
        },
        { $group: { _id: null, totalAllocations: { $sum: "$amount" } } },
      ]);

      const [
        { totalContributions } = { totalContributions: 0 },
      ] = await Contribution.aggregate([
        {
          $match: {
            eventId: mongoose.Types.ObjectId(event.id),
          },
        },
        { $group: { _id: null, totalContributions: { $sum: "$amount" } } },
      ]);

      return totalAllocations - totalContributions;
    },
    tags: async (event, args, { models: { Tag } }) => {
      return Tag.find({ eventId: event.id });
    },
  },
  Dream: {
    cocreators: async (dream, args, { models: { EventMember } }) => {
      return EventMember.find({ _id: { $in: dream.cocreators } });
    },
    event: async (dream, args, { models: { Event } }) => {
      return Event.findOne({ _id: dream.eventId });
    },
    totalContributions: async (dream, args, { models: { Contribution } }) => {
      const [
        { contributionsForDream } = { contributionsForDream: 0 },
      ] = await Contribution.aggregate([
        {
          $match: {
            dreamId: mongoose.Types.ObjectId(dream.id),
          },
        },
        { $group: { _id: null, contributionsForDream: { $sum: "$amount" } } },
      ]);
      return contributionsForDream;
    },
    totalContributionsFromCurrentMember: async (
      dream,
      args,
      { models: { Contribution, EventMember }, currentOrgMember }
    ) => {
      if (!currentOrgMember) {
        return 0;
      }
      const eventMember = await EventMember.findOne({
        orgMemberId: currentOrgMember.id,
        eventId: dream.eventId,
      });

      if (!eventMember) return 0;

      const [
        { contributionsForDream } = { contributionsForDream: 0 },
      ] = await Contribution.aggregate([
        {
          $match: {
            dreamId: mongoose.Types.ObjectId(dream.id),
            eventMemberId: mongoose.Types.ObjectId(eventMember.id),
          },
        },
        { $group: { _id: null, contributionsForDream: { $sum: "$amount" } } },
      ]);
      return contributionsForDream;
    },
    numberOfComments: async (dream, args, { currentOrg }) => {
      // Only display number of comments for non-Discourse orgs
      if (orgHasDiscourse(currentOrg)) {
        return;
      }

      return dream.comments.length;
    },
    raisedFlags: async (dream) => {
      const resolveFlagIds = dream.flags
        .filter((flag) => flag.type === "RESOLVE_FLAG")
        .map((flag) => flag.resolvingFlagId);

      return dream.flags.filter(
        (flag) =>
          flag.type === "RAISE_FLAG" && !resolveFlagIds.includes(flag.id)
      );
    },
    logs: async (
      dream,
      args,
      {
        models: {
          logs: { Log },
        },
      }
    ) => {
      return Log.find({ dreamId: dream.id });
    },
    discourseTopicUrl: (dream, args, { currentOrg }) => {
      if (!dream.discourseTopicId || !currentOrg.discourse?.url) return null;

      return `${currentOrg.discourse.url}/t/${dream.discourseTopicId}`;
    },
    tags: async (dream, args, { models: { Tag } }) => {
      return Tag.find({ _id: { $in: dream.tags } });
    },
  },
  Transaction: {
    __resolveType(transaction) {
      if (transaction.dreamId) {
        return "Contribution";
      }
      return "Allocation"; // GraphQLError is thrown
    },
  },
  Contribution: {
    dream: async (contribution, args, { models: { Dream } }) => {
      return Dream.findOne({ _id: contribution.dreamId });
    },
    event: async (contribution, args, { models: { Event } }) => {
      return Event.findOne({ _id: contribution.eventId });
    },
    eventMember: async (contribution, args, { models: { EventMember } }) => {
      return EventMember.findOne({ _id: contribution.eventMemberId });
    },
  },
  Comment: {
    orgMember: async (post, args, { currentOrg, models: { OrgMember } }) => {
      if (post.authorId) return OrgMember.findOne({ _id: post.authorId });
    },
  },
  Flag: {
    guideline: async (flag, args, { models: { Event } }) => {
      const event = await Event.findOne({ _id: flag.parent().eventId });

      return event.guidelines.id(flag.guidelineId);
    },
    user: async (parent, args, { models: { EventMember, Dream } }) => {
      // if not org admin or event admin or guide
      return null;
    },
  },
  Date: new GraphQLScalarType({
    name: "Date",
    description: "Date custom scalar type",
    parseValue(value) {
      return new Date(value); // value from the client
    },
    serialize(value) {
      return value.getTime(); // value sent to the client
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return parseInt(ast.value, 10); // ast value is always in string format
      }
      return null;
    },
  }),
  JSON: GraphQLJSON,
  JSONObject: GraphQLJSONObject,
  CustomFieldValue: {
    customField: async (customFieldValue, args, { models: { Event } }) => {
      const { eventId, fieldId } = customFieldValue;
      const event = await Event.findOne({ _id: eventId });
      const eventCustomField = event.customFields.filter(
        (eventCustomField) => eventCustomField.id == fieldId
      );

      if (!eventCustomField || eventCustomField.length == 0) {
        return {
          id: fieldId,
          name: "⚠️ Missing custom field ⚠️",
          description: "Custom field was removed",
          type: "TEXT",
          position: 1000,
          isRequired: false,
          createdAt: new Date(),
        };
      }
      return eventCustomField[0];
    },
  },
  Log: {
    details: (log) => log,
    user: async (log, args, { models: { User } }) => {
      return null;
      // TODO:  only show for admins
      // return User.findOne({ _id: log.userId });
    },
    type: (log) => log.__t,
    dream: async (log, args, { models: { Dream } }) => {
      return Dream.findOne({ _id: log.dreamId });
    },
    event: async (log, args, { models: { Event } }) => {
      return Event.findOne({ _id: log.eventId });
    },
  },
  LogDetails: {
    __resolveType: async (obj) => {
      if (obj.__t == "FlagRaised") return "FlagRaisedDetails";
      if (obj.__t == "FlagResolved") return "FlagResolvedDetails";
      return null;
    },
  },
  FlagRaisedDetails: {
    guideline: async (log, args, { models: { Event } }) => {
      const event = await Event.findOne({ _id: log.eventId });
      return event.guidelines.id(log.guidelineId);
    },
  },
  FlagResolvedDetails: {
    guideline: async (log, args, { models: { Event } }) => {
      const event = await Event.findOne({ _id: log.eventId });
      return event.guidelines.id(log.guidelineId);
    },
  },
};

module.exports = resolvers;
