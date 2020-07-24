const slugify = require('../utils/slugify');
const {
  sendMagicLinkEmail,
  sendInviteEmails,
  sendRequestToJoinNotifications,
} = require('../utils/email');
const { GraphQLScalarType } = require('graphql');
const GraphQLJSON = require('graphql-type-json');
const { GraphQLJSONObject } = require('graphql-type-json');
const { Kind } = require('graphql/language');
const mongoose = require('mongoose');
const dayjs = require('dayjs');

const resolvers = {
  Query: {
    // currentMember: (parent, args, { currentMember }) => {
    //   return currentMember;
    // },
    currentUser: (parent, args, { currentUser }) => {
      return currentUser;
    },
    events: async (parent, args, { models: { Event } }) => {
      return Event.find();
    },
    event: async (parent, { slug }, { models: { Event } }) => {
      if (!slug) return null;
      return Event.findOne({ slug });
    },
    dream: async (parent, { id }, { models: { Dream } }) => {
      return Dream.findOne({ _id: id });
    },
    dreams: async (
      parent,
      { eventId, textSearchTerm },
      { currentUser, models: { Dream, Member } }
    ) => {
      const currentMember = await Member.findOne({
        userId: currentUser && currentUser.id,
        eventId,
      });

      // if admin or guide, show all dreams (published or unpublished)
      if (currentMember && (currentMember.isAdmin || currentMember.isGuide)) {
        return Dream.find({
          eventId,
          ...(textSearchTerm && { $text: { $search: textSearchTerm } }),
        });
      }

      // todo: create appropriate index for this query
      if (currentMember) {
        return Dream.find({
          eventId,
          $or: [{ published: true }, { cocreators: currentMember.id }],
          ...(textSearchTerm && { $text: { $search: textSearchTerm } }),
        });
      }

      return Dream.find({
        eventId,
        published: true,
        ...(textSearchTerm && { $text: { $search: textSearchTerm } }),
      });
    },
    grant: async(
        parent,
        { grantId },
        { models: { Grant } }
    ) => {
      let grant = await Grant.findOne({_id: grantId});
      if(!grant)
        throw new Error("That grant does not exist.");
      return grant;
    },
    members: async (
      parent,
      { eventId, isApproved },
      { currentUser, models: { Member } }
    ) => {
      if (!currentUser) throw new Error('You need to be logged in');

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId,
      });

      if (!currentMember || !currentMember.isApproved)
        throw new Error('You need to be an approved member');

      return Member.find({
        eventId,
        ...(typeof isApproved === 'boolean' && { isApproved }),
      });
    },
  },
  Mutation: {
    createEvent: async (
      parent,
      { slug, title, description, summary, currency, registrationPolicy },
      { currentUser, models: { Event, Member } }
    ) => {
      if (!currentUser || !currentUser.isOrgAdmin)
        throw new Error('You need to be logged in as organisation admin.');
      // maybe add check to be org admin or so.

      // check slug..
      const event = await new Event({
        slug,
        title,
        description,
        summary,
        currency,
        registrationPolicy,
      });

      const member = await new Member({
        userId: currentUser.id,
        eventId: event.id,
        isAdmin: true,
        isApproved: true,
      });

      const [savedEvent] = await Promise.all([event.save(), member.save()]);

      return savedEvent;
    },
    editEvent: async (
      parent,
      {
        eventId,
        slug,
        title,
        registrationPolicy,
        info,
        guidelines,
        color,
        about,
      },
      { currentUser, models: { Event, Member } }
    ) => {
      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId,
      });

      if (!currentMember || !currentMember.isAdmin)
        throw new Error('You need to be admin of this event.');

      const event = await Event.findOne({ _id: eventId });

      if (slug) event.slug = slugify(slug);
      if (title) event.title = title;
      if (registrationPolicy) event.registrationPolicy = registrationPolicy;
      if (typeof info !== 'undefined') event.info = info;
      if (typeof guidelines !== 'undefined') event.guidelines = guidelines;
      if (typeof about !== 'undefined') event.about = about;
      if (color) event.color = color;

      return event.save();
    },
    addCustomField: async (
      parent,
      { eventId, customField },
      { currentUser, models: { Member, Event } }
    ) => {
      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId,
      });
      if (!currentMember || !currentMember.isAdmin)
        throw new Error('You need to be event admin to add custom field');

      const event = await Event.findOne({ _id: eventId });

      event.customFields.push({ ...customField });

      return event.save();
    },
    editCustomField: async (
      parent,
      { eventId, fieldId, customField },
      { currentUser, models: { Member, Event } }
    ) => {
      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId,
      });
      if (!currentMember || !currentMember.isAdmin)
        throw new Error('You need to be event admin to edit a custom field');

      const event = await Event.findOne({ _id: eventId });

      let doc = event.customFields.id(fieldId);
      // doc = { ...doc, ...customField };
      doc.name = customField.name;
      doc.type = customField.type;
      doc.description = customField.description;
      doc.isRequired = customField.isRequired;
      doc.isShownOnFrontPage = customField.isShownOnFrontPage;

      return event.save();
    },
    deleteCustomField: async (
      parent,
      { eventId, fieldId },
      { currentUser, models: { Member, Event } }
    ) => {
      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId,
      });
      if (!currentMember || !currentMember.isAdmin)
        throw new Error('You need to be event admin to remove a custom field');

      const event = await Event.findOne({ _id: eventId });

      let doc = event.customFields.id(fieldId);
      doc.remove();

      return event.save();
    },
    createDream: async (
      parent,
      {
        eventId,
        title,
        description,
        summary,
        budgetDescription,
        minGoal,
        maxGoal,
        images,
        budgetItems,
      },
      { currentUser, models: { Member, Dream, Event } }
    ) => {
      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId,
      });

      if (!currentMember || !currentMember.isApproved)
        throw new Error('You need to be logged in and/or approved');

      const event = await Event.findOne({ _id: eventId });

      if (!event.dreamCreationIsOpen)
        throw new Error('Dream creation is not open');

      // if maxGoal is defined, it needs to be larger than minGoal, that also needs to be defined
      if (maxGoal && (maxGoal <= minGoal || minGoal == null))
        throw new Error('max goal needs to be larger than min goal');

      return new Dream({
        eventId,
        title,
        description,
        summary,
        cocreators: [currentMember.id], // could argue for different thangs here?..
        budgetDescription,
        minGoal,
        ...(event.allowStretchGoals && { maxGoal }),
        images,
        budgetItems,
      }).save();
    },
    editDream: async (
      parent,
      { dreamId, title, description, summary, images, budgetItems },
      { currentUser, models: { Member, Dream, Event } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });

      if (
        !currentMember ||
        (!dream.cocreators.includes(currentMember.id) &&
          !currentMember.isAdmin &&
          !currentMember.isGuide)
      )
        throw new Error('You are not a cocreator of this dream.');

      if (title) dream.title = title;
      if (typeof description !== 'undefined') dream.description = description;
      if (typeof summary !== 'undefined') dream.summary = summary;
      if (typeof images !== 'undefined') dream.images = images;
      if (typeof budgetItems !== 'undefined') dream.budgetItems = budgetItems;

      return dream.save();
    },
    editDreamCustomField: async (
      parent,
      { dreamId, customField },
      { currentUser, models: { Member, Dream, Event } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });

      if (
        !currentMember ||
        (!dream.cocreators.includes(currentMember.id) &&
          !currentMember.isAdmin &&
          !currentMember.isGuide)
      )
        throw new Error('You are not a cocreator of this dream.');

      const existingField = dream.customFields.filter((field) => {
        return field.fieldId == customField.fieldId;
      });

      if (existingField.length > 0) {
        existingField[0].value = customField.value;
      } else {
        dream.customFields.push(customField);
      }

      return dream.save();
    },
    deleteDream: async (
      parent,
      { dreamId },
      { currentUser, models: { Dream, Member, Grant } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });

      if (
        !currentMember ||
        (!dream.cocreators.includes(currentMember.id) &&
          !currentMember.isAdmin &&
          !currentMember.isGuide)
      )
        throw new Error('You are not a cocreator of this dream.');

      const [
        { grantsForDream } = { grantsForDream: 0 },
      ] = await Grant.aggregate([
        { $match: { dreamId: mongoose.Types.ObjectId(dreamId) } },
        { $group: { _id: null, grantsForDream: { $sum: '$value' } } },
      ]);

      if (grantsForDream > 0) {
        throw new Error('You cant delete a Dream that has received grants');
      }

      return dream.remove();
    },
    addCocreator: async (
      parent,
      { dreamId, memberId },
      { currentUser, models: { Member, Dream } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });

      if (
        !currentMember.isAdmin &&
        !currentMember.isGuide &&
        !dream.cocreators.includes(currentMember.id)
      )
        throw new Error('You need to be a cocreator to add co-creators.');

      // check that added memberId is not already part of the thing
      if (dream.cocreators.includes(memberId))
        throw new Error('Member is already cocreator of dream');

      // check that memberId is a member of event
      const member = await Member.findOne({
        _id: memberId,
        eventId: dream.eventId,
      });
      if (!member) throw new Error('No member found with this id');

      dream.cocreators.push(memberId);

      return dream.save();
    },
    removeCocreator: async (
      parent,
      { dreamId, memberId },
      { currentUser, models: { Member, Dream } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });

      if (
        !currentMember.isAdmin &&
        !currentMember.isGuide &&
        !dream.cocreators.includes(currentMember.id)
      )
        throw new Error('You need to be a cocreator to remove co-creators.');

      // check that added memberId is not already part of the thing
      if (!dream.cocreators.includes(memberId))
        throw new Error('Member is not a co-creator of this dream.');

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
      { currentUser, models: { Member, Dream } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });

      if (
        !currentMember.isAdmin &&
        !currentMember.isGuide &&
        !dream.cocreators.includes(currentMember.id)
      )
        throw new Error(
          'You need to be a cocreator or admin to publish/unpublish a dream'
        );

      dream.published = !unpublish;

      return dream.save();
    },
    addComment: async (
      parent,
      { content, dreamId },
      { currentUser, models: { Member, Dream } }
    ) => {
      const dream = await Dream.findOne({
        _id: dreamId,
      });

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });

      if (!currentMember || !currentMember.isApproved)
        throw new Error('You need to be a member and/or approved');

      if (content.length === 0) throw new Error('You need content!');

      dream.comments.push({
        authorId: currentUser.id,
        content,
      });

      return await dream.save();
    },

    deleteComment: async (
      parent,
      { dreamId, commentId },
      { currentUser, models: { Member, Dream } }
    ) => {
      const dream = await Dream.findOne({
        _id: dreamId,
      });

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });

      if (!currentMember || !currentMember.isApproved)
        throw new Error('You need to be logged in and/or approved');

      dream.comments = dream.comments.filter((comment) => {
        if (
          comment._id.toString() === commentId &&
          (comment.authorId.toString() === currentUser.id ||
            currentMember.isAdmin)
        )
          return false;
        return true;
      });

      return dream.save();
    },

    editComment: async (
      parent,
      { dreamId, commentId, content },
      { currentUser, models: { Member, Dream } }
    ) => {
      const dream = await Dream.findOne({
        _id: dreamId,
      });

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });

      if (!currentMember || !currentMember.isApproved)
        throw new Error('You need to be logged in and/or approved');

      const comment = dream.comments.filter(
        (comment) =>
          comment._id.toString() === commentId &&
          (comment.authorId.toString() === currentUser.id ||
            currentMember.isAdmin)
      );

      if (comment.length == 0) {
        throw new Error(
          'Cant find that comment - Does this comment belongs to you?'
        );
      }
      comment[0].content = content;
      comment[0].updatedAt = new Date();

      return dream.save();
    },
    sendMagicLink: async (
      parent,
      { email: inputEmail },
      { models: { User, Member, Event } }
    ) => {
      const email = inputEmail.toLowerCase();
      const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

      if (!emailRegex.test(email)) throw new Error('Not a valid email address');

      // const event = await Event.findOne({ _id: eventId });
      // if (!event) throw new Error('Did not find event');

      let user = await User.findOne({ email });

      if (!user) {
        //  let isApproved;

        //   switch (event.registrationPolicy) {
        //     case 'OPEN':
        //       isApproved = true;
        //       break;
        //     case 'REQUEST_TO_JOIN':
        //       isApproved = false;
        //       break;
        //     case 'INVITE_ONLY':
        //       throw new Error('This event is invite only');
        //     default:
        //       throw new Error('Event has no registration policy');
        //   }

        user = await new User({ email }).save();
      }

      return await sendMagicLinkEmail(user);
    },
    updateProfile: async (parent, { name, avatar, bio }, { currentUser }) => {
      if (!currentUser) throw new Error('You need to be logged in..');

      // TODO figure this shit out

      // const member = await Member.findOne({ _id: currentMember.id });

      if (!currentUser.name && name) {
        currentUser.verifiedEmail = true;
      }
      // // first time a member signs in
      // if (!member.name) {
      //   member.verifiedEmail = true;

      //   if (!member.isApproved) {
      //     // ping admins that there is a request to join
      //     const event = await Event.findOne({ _id: currentMember.eventId });
      //     const admins = await Member.find({
      //       eventId: currentMember.eventId,
      //       isAdmin: true,
      //     });
      //     await sendRequestToJoinNotifications(member, event, admins);
      //   }
      // }

      if (name) currentUser.name = name;
      if (avatar) currentUser.avatar = avatar;
      if (bio) currentUser.bio = bio;

      return currentUser.save();
    },
    // inviteMembers: async (
    //   parent,
    //   { emails },
    //   { currentMember, models: { Member, Event } }
    // ) => {
    //   if (!currentMember || !currentMember.isAdmin)
    //     throw new Error('You need to be admin to invite new members');

    //   const emailArray = emails.split(',');

    //   if (emailArray.length > 1000)
    //     throw new Error('You can only invite 1000 people at a time.');

    //   const memberObjs = emailArray.map((email) => ({
    //     email: email.trim(),
    //     eventId: currentMember.eventId,
    //     isApproved: true,
    //   }));

    //   let members = [];

    //   for (memberObj of memberObjs) {
    //     try {
    //       members.push(await new Member(memberObj).save());
    //     } catch (error) {
    //       console.log(error);
    //     }
    //   }

    //   const event = await Event.findOne({ _id: currentMember.eventId });

    //   if (members.length > 0) await sendInviteEmails(members, event);

    //   return members;
    // },
    updateMember: async (
      parent,
      { eventId, memberId, isApproved, isAdmin, isGuide },
      { currentUser, models: { Member } }
    ) => {
      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId,
      });

      if (!currentMember || !currentMember.isAdmin)
        throw new Error('You need to be admin to update member');

      const member = await Member.findOne({
        _id: memberId,
        eventId,
      });

      if (!member) throw new Error('No member to update found');

      if (typeof isApproved !== 'undefined') {
        member.isApproved = isApproved;
      } // send notification on approving?
      if (typeof isAdmin !== 'undefined') {
        member.isAdmin = isAdmin;
      }
      if (typeof isGuide !== 'undefined') {
        member.isGuide = isGuide;
      }
      return member.save();
    },
    deleteMember: async (
      parent,
      { eventId, memberId },
      { currentUser, models: { Member } }
    ) => {
      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId,
      });

      if (!currentMember || !currentMember.isAdmin)
        throw new Error('You need to be admin to delete member');

      const member = await Member.findOneAndDelete({
        _id: memberId,
        eventId,
      });
      // TODO: doesit actually delete?
      return member;
    },
    approveForGranting: async (
      parent,
      { dreamId, approved },
      { currentUser, models: { Dream }, controller }
    ) => {
      console.log(dreamId);
      return controller.setDreamApproval(dreamId, approved, currentUser);
    },
    giveGrant: async (
      parent,
      { eventId, dreamId, value },
      { currentUser, controller }
    ) => {
      return await controller.giveGrant(eventId, dreamId, currentUser, value);
    },
    deleteGrant: async (
      parent,
      { eventId, grantId },
      { currentUser, controller }
    ) => {
      return await controller.deleteGrant(grantId, currentUser);
    },
    reclaimGrants: async (
      parent,
      { dreamId },
      { currentUser, controller }
    ) => {
        return controller.reclaimGrantsForDream(dreamId, currentUser);
    },
    preOrPostFund: async (
      parent,
      { dreamId, value },
      { currentUser, models: { Grant, Dream, Event, Member } }
    ) => {
      const dream = await Dream.findOne({ _id: dreamId });

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });

      if (!currentMember || !currentMember.isAdmin)
        throw new Error('You need to be admin to pre or post fund');

      if (value <= 0) throw new Error('Value needs to be more than zero');

      const event = await Event.findOne({ _id: dream.eventId });

      // TODO: check whether certain settings are set, like grant value and total budget

      if (!dream.approved)
        throw new Error('Dream is not approved for granting');

      // Check that the max goal of the dream is not exceeded
      const [
        { grantsForDream } = { grantsForDream: 0 },
      ] = await Grant.aggregate([
        {
          $match: {
            dreamId: mongoose.Types.ObjectId(dreamId),
            reclaimed: false,
          },
        },
        { $group: { _id: null, grantsForDream: { $sum: '$value' } } },
      ]);

      const maxGoalGrants = Math.ceil(
        Math.max(dream.maxGoal, dream.minGoal) / event.grantValue
      );

      if (grantsForDream + value > maxGoalGrants)
        throw new Error("You can't overfund this dream.");

      // Check that total budget of event will not be exceeded
      const [
        { grantsFromEverybody } = { grantsFromEverybody: 0 },
      ] = await Grant.aggregate([
        {
          $match: {
            eventId: mongoose.Types.ObjectId(dream.eventId),
            reclaimed: false,
          },
        },
        { $group: { _id: null, grantsFromEverybody: { $sum: '$value' } } },
      ]);

      const totalGrantsToSpend = Math.floor(
        event.totalBudget / event.grantValue
      );

      if (grantsFromEverybody + value > totalGrantsToSpend)
        throw new Error('Total budget of event is exeeced with this grant');

      return new Grant({
        eventId: dream.eventId,
        dreamId,
        value,
        type: event.grantingHasClosed ? 'POST_FUND' : 'PRE_FUND',
        memberId: currentMember.id,
      }).save();
    },
    updateGrantingSettings: async (
      parent,
      {
        eventId,
        currency,
        grantsPerMember,
        maxGrantsToDream,
        totalBudget,
        grantValue,
        dreamCreationCloses,
        grantingOpens,
        grantingCloses,
        allowStretchGoals,
      },
      { currentUser, models: { Event, Member } }
    ) => {
      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId,
      });

      if (!currentMember || !currentMember.isAdmin)
        throw new Error('You need to be admin to update granting settings');

      const event = await Event.findOne({ _id: eventId });

      const grantingHasStarted = dayjs(event.grantingOpens).isBefore(dayjs());
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
        event.totalBudget = undefined;
        event.grantValue = undefined;
      }

      if (grantsPerMember) {
        // granting can't have started to change grants per member
        if (grantingHasStarted) {
          throw new Error(
            "You can't change grants per member once granting has started"
          );
        }
        event.grantsPerMember = grantsPerMember;
        event.grantValue = undefined;
      }

      if (maxGrantsToDream) {
        if (grantingHasStarted) {
          throw new Error(
            "You can't change max grants to dream once granting has started"
          );
        }
        event.maxGrantsToDream = maxGrantsToDream;
      }

      if (totalBudget) {
        // can only increase total budget after granting has started
        if (grantingHasStarted && totalBudget < event.totalBudget) {
          throw new Error(
            "You can't decrease total budget once granting has started"
          );
        }
        event.totalBudget = totalBudget;
      }

      if (grantValue) {
        // granting can't have started to change grant value
        if (grantingHasStarted) {
          throw new Error(
            "You can't change grant value once granting has started"
          );
        }
        event.grantValue = grantValue;
      }

      if (dreamCreationCloses) {
        event.dreamCreationCloses = dreamCreationCloses;
      }

      if (grantingOpens) {
        if (
          !event.totalBudget ||
          !event.grantValue ||
          !event.dreamCreationCloses
        ) {
          throw new Error(
            "You can't set granting opening date before setting total budget, grant value & dream creation close date"
          );
        }

        if (dayjs(grantingOpens).isBefore(dayjs(event.dreamCreationCloses))) {
          throw new Error(
            'Granting opens date needs to be after dream creation closing date'
          );
        }

        event.grantingOpens = grantingOpens;
      }

      if (grantingCloses) {
        if (
          !event.grantingOpens ||
          dayjs(grantingCloses).isBefore(dayjs(event.grantingOpens))
        ) {
          throw new Error(
            "You can't set granting close date before opening date"
          );
        }
        event.grantingCloses = grantingCloses;
      }

      if (typeof allowStretchGoals !== 'undefined') {
        if (grantingHasStarted) {
          throw new Error(
            "You can't change stretch goal setting once granting has started"
          );
        }
        event.allowStretchGoals = allowStretchGoals;
      }

      return event.save();
    },
    toggleFavorite: async (
      parent,
      { dreamId },
      { currentUser, models: { Dream, Member } }
    ) => {
      const dream = await Dream.findOne({
        _id: dreamId,
      });

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });

      if (!currentMember)
        throw new Error('You need to be a member to favorite something.');

      if (currentMember.favorites.includes(dreamId)) {
        currentMember.favorites = currentMember.favorites.filter(
          (favoriteId) => favoriteId != dreamId
        );
        await currentMember.save();
      } else {
        currentMember.favorites.push(dreamId);
        await currentMember.save();
      }

      return dream;
    },
    registerForEvent: async (
      parent,
      { eventId },
      { currentUser, models: { Member, Event } }
    ) => {
      if (!currentUser)
        throw new Error('You need to be logged in to register for an event.');

      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId,
      });

      if (currentMember) throw new Error('You are already a member');

      const event = await Event.findOne({ _id: eventId });

      let newMember = {
        isAdmin: false,
        eventId,
        userId: currentUser.id,
      };

      switch (event.registrationPolicy) {
        case 'OPEN':
          newMember.isApproved = true;
          break;
        case 'REQUEST_TO_JOIN':
          newMember.isApproved = false;

          // send request to join notification emails
          const admins = await Member.find({
            eventId,
            isAdmin: true,
          }).populate('userId');

          const adminEmails = admins.map((member) => member.userId.email);
          await sendRequestToJoinNotifications(currentUser, event, adminEmails);
          break;

        case 'INVITE_ONLY':
          throw new Error('This event is invite only');
      }

      return new Member(newMember).save();
    },
  },
  Member: {
    user: async (member, args, { models: { User } }) => {
      return User.findOne({ _id: member.userId });
    },
    event: async (member, args, { models: { Event } }) => {
      return Event.findOne({ _id: member.eventId });
    },
    availableGrants: async (member, args, { models: { Grant, Event } }) => {
      if (!member.isApproved) return 0;

      const event = await Event.findOne({
        _id: member.eventId,
      });

      const [
        { grantsFromMember } = { grantsFromMember: 0 },
      ] = await Grant.aggregate([
        {
          $match: {
            memberId: mongoose.Types.ObjectId(member.id),
            type: 'USER',
          },
        },
        { $group: { _id: null, grantsFromMember: { $sum: '$value' } } },
      ]);

      if (!event.grantingIsOpen) return 0;

      return event.grantsPerMember - grantsFromMember;
    },
    givenGrants: async (member, args, { models: { Grant } }) => {
      return Grant.find({ memberId: member.id });
    },
  },
  User: {
    memberships: async (user, args, { models: { Member } }) => {
      return Member.find({ userId: user.id });
    },
    membership: async (user, { slug }, { models: { Member, Event } }) => {
      if (!slug) return null;
      const event = await Event.findOne({ slug });
      return Member.findOne({ userId: user.id, eventId: event.id });
    },
  },
  Event: {
    members: async (event, args, { models: { Member } }) => {
      return Member.find({ eventId: event.id });
    },
    dreams: async (event, args, { models: { Dream } }) => {
      return Dream.find({ eventId: event.id });
    },
    numberOfApprovedMembers: async (event, args, { models: { Member } }) => {
      return Member.countDocuments({ eventId: event.id, isApproved: true });
    },
    totalBudgetGrants: async (event) => {
      return Math.floor(event.totalBudget / event.grantValue);
    },
    remainingGrants: async (event, args, { models: { Grant } }) => {
      const [
        { grantsFromEverybody } = { grantsFromEverybody: 0 },
      ] = await Grant.aggregate([
        {
          $match: {
            eventId: mongoose.Types.ObjectId(event.id),
            reclaimed: false,
          },
        },
        { $group: { _id: null, grantsFromEverybody: { $sum: '$value' } } },
      ]);
      return (
        Math.floor(event.totalBudget / event.grantValue) - grantsFromEverybody
      );
    },
  },
  Dream: {
    cocreators: async (dream, args, { models: { Member } }) => {
      return Member.find({ _id: { $in: dream.cocreators } });
    },
    event: async (dream, args, { models: { Event } }) => {
      return Event.findOne({ _id: dream.eventId });
    },
    minGoalGrants: async (dream, args, {controller}) => {
      return await controller.minGoalGrants(dream); },
    maxGoalGrants: async (dream, args, {controller}) => {
      return await controller.maxGoalGrants(dream); },
    currentNumberOfGrants: async (dream, args, {controller} ) => {
      return await controller.currentNumberOfGrants(dream); },
    numberOfComments: (dream) => {
      return dream.comments.length;
    },
    favorite: async (dream, args, { currentUser, models: { Member } }) => {
      if (!currentUser) return false;
      const currentMember = await Member.findOne({
        userId: currentUser.id,
        eventId: dream.eventId,
      });
      if (!currentMember) return false;
      return currentMember.favorites.includes(dream.id);
    },
  },
  Grant: {
    dream: async (grant, args, { models: { Dream } }) => {
      return Dream.findOne({ _id: grant.dreamId });
    },
  },
  Date: new GraphQLScalarType({
    name: 'Date',
    description: 'Date custom scalar type',
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
      if (ast.kind === Kind.STRING) {
        return new Date(ast.value);
      }
      return null;
    },
  }),
  Comment: {
    author: async (comment, args, { models: { User } }) => {
      return User.findOne({ _id: comment.authorId });
    },
  },
  JSON: GraphQLJSON,
  JSONObject: GraphQLJSONObject,
  CustomFieldValue: {
    customField: async (customFieldValue, args, { models: { Event } }) => {
      const { eventId, fieldId, value } = customFieldValue;
      const event = await Event.findOne({ _id: eventId });
      const eventCustomField = event.customFields.filter(
        (eventCustomField) => eventCustomField.id == fieldId
      );
      return eventCustomField[0];
    },
  },
};

module.exports = resolvers;
