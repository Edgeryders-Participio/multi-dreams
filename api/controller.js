const mongoose = require('mongoose');
// I envision this file to be the Business Logic Layer. That's a fuzzy concept, but the goal is:
//  1. To keep business rules here (e.g. only an adming can approve X)
//  2. To push boilerplate outside, making focus on the ruels here easier
const createController = ({ Dream, Member, Event, Grant, LogEntries : { LogEntry, GrantGivenLogEntry }}) => ({
  setDreamApproval: async (aDreamId, newApprovalStatus, issuingUser) => {
    const aDream = await Dream.findOne({_id:aDreamId});

    if (!aDream) 
      throw new Error( "Dream does not exist");
    if (!issuingUser) 
      throw new Error( "User needed to approve");
    if (typeof newApprovalStatus != "boolean") 
      throw new Error( newApprovalStatus + " is not a boolean.");

    const membership = await Member.findOne({
      userId: issuingUser.id,
      eventId: aDream.eventId,
    });

    if (!membership || (!membership.isAdmin && !membership.isGuide))
      throw new Error(
        'User must be admin or guide of the event to approve for granting'
      );

    aDream.approved = newApprovalStatus;
    return aDream.save();
  },
  minGoalGrants: async (aDream) => {
      const { grantValue } = await Event.findOne({ _id: aDream.eventId });
      if (aDream.minGoal === null || !grantValue) {
        return null;
      }
      return Math.ceil(aDream.minGoal / grantValue);
  },
  maxGoalGrants: async (aDream) => {
    const { grantValue } = await Event.findOne({ _id: aDream.eventId });
    if (aDream.maxGoal === null || !grantValue) {
      return null;
    }
    return Math.ceil(aDream.maxGoal / grantValue);
  },
  currentNumberOfGrants: async (aDream) => {
      const [
        { grantsForDream } = { grantsForDream: 0 },
      ] = await Grant.aggregate([
        {
          $match: {
            dreamId: mongoose.Types.ObjectId(aDream.id),
            reclaimed: false,
          },
        },
        { $group: { _id: null, grantsForDream: { $sum: '$value' } } },
      ]);
      return grantsForDream;
  },
  hasRoomInBudgetForGrantOfSize: async (dream, grantSize) => {
    const grantsForDream = await controller.currentNumberOfGrants(dream);
    const maxGoalGrants = await controller.maxGoalGrants(dream);

    return (grantsForDream + grantSize <= maxGoalGrants)
  },
  numberOfGivenGrants: async (aMember) => {
    const [
      { grantsFromUser } = { grantsFromUser: 0 },
    ] = await Grant.aggregate([
      {
        $match: {
          memberId: mongoose.Types.ObjectId(aMember.id),
          type: 'USER',
        },
      },
      { $group: { _id: null, grantsFromUser: { $sum: '$value' } } },
    ]);
    return grantsFromUser;
  },
  canGiveNumberOfGrantsMore: async (aMember, anEvent, numGrants) => {
    let grantsFromUser = await controller.numberOfGivenGrants(aMember);
    return (grantsFromUser + numGrants <= anEvent.grantsPerMember)
  },
  eventBudgetWontBeExceededBy: async(anEvent, grantAmount) => {
    const [
      { grantsFromEverybody } = { grantsFromEverybody: 0 },
    ] = await Grant.aggregate([
      {
        $match: {
          eventId: mongoose.Types.ObjectId(anEvent.eventId),
          reclaimed: false,
        },
      },
      { $group: { _id: null, grantsFromEverybody: { $sum: '$value' } } },
    ]);

    const totalGrantsToSpend = Math.floor(
      anEvent.totalBudget / anEvent.grantValue
    );

    return (grantsFromEverybody + grantAmount <= totalGrantsToSpend)

  },
  giveGrant: async (eventId, dreamId, fromUser, value) => {
    const [event, currentMember, dream] = await Promise.all([
      Event.findOne({ _id: eventId }),
      Member.findOne({ userId: fromUser.id, eventId, }),
      Dream.findOne({ _id: dreamId, eventId })
    ]);

    if (value <= 0) 
      throw new Error('Value needs to be more than zero');

    if (!currentMember || !currentMember.isApproved)
      throw new Error( 'Approved member necessary to give grants');

    if (!event.grantingIsOpen) 
      throw new Error('Granting is not open');

    if (!dream.approved)
      throw new Error('Dream is not approved for granting');

    // Check that the max goal of the dream is not exceeded
    if(!await controller.hasRoomInBudgetForGrantOfSize(dream, value))
      throw new Error("This grant would overfund this dream");

    // Check that it is not more than is allowed per dream (if this number is set)
    // TODO This value seems illogical anyway, what if there are two grants?
    if (event.maxGrantsToDream && value > event.maxGrantsToDream) {
      throw new Error(
        `You can give a maximum of ${event.maxGrantsToDream} grants to one dream`
      );
    }

    // Check that user has not spent more grants than he has
    if (!await controller.canGiveNumberOfGrantsMore(currentMember, event, value))
      throw new Error('You are trying to spend too many grants.');

    if (!await controller.eventBudgetWontBeExceededBy(event, value))
      throw new Error('Total budget of event is exeeced with this grant');

    let [savedGrant] = await Promise.all([
      new Grant({
        eventId: currentMember.eventId,
        dreamId,
        value,
        memberId: currentMember.id,
      }).save(),
      new GrantGivenLogEntry({
        when: Date.now(),
        givingUser: fromUser,
        receivingDream: dream,
        numberOfGrants: value,
        grantValue: event.grantValue,
        eventCurrency: event.currency
      }).save()
    ]);
    return savedGrant;
  },
  deleteGrant: async (grantId, currentUser) => {
    const grant = await Grant.findOne({ _id: grantId });
    const currentMember = await Member.findOne({
      userId: currentUser.id,
      eventId: grant.eventId,
    });

    if (!currentMember || !currentMember.isApproved)
      throw new Error(
          'You need to be a logged in approved member to remove a grant'
      );

    const event = await Event.findOne({ _id: grant.eventId });

    // Check that granting is open
    if (!event.grantingIsOpen)
      throw new Error("Can't remove grant when granting is closed");

    return await Grant.findOneAndDelete({
      _id: grantId,
      memberId: currentMember.id,
    });
  },
  hasReceivedMinimumFunding: async(aDream) => {
    const grantsForDream = await controller.currentNumberOfGrants(aDream);
    const minGoalGrants = await controller.minGoalGrants(aDream)
    return grantsForDream >= minGoalGrants;
  },
  reclaimGrantsForDream: async (dreamId, currentUser) => {
    const dream = await Dream.findOne({ _id: dreamId });
    // For parallellization
    const [event, currentMember] = await Promise.all([
        Event.findOne({ _id: dream.eventId }),
        Member.findOne({
          userId: currentUser.id,
          eventId: dream.eventId,
        })
    ]);

    if (!currentMember || !currentMember.isAdmin)
      throw new Error('You need to be admin to reclaim grants');

    // Granting needs to be closed before you can reclaim grants
    if (!event.grantingHasClosed)
      throw new Error("You can't reclaim grants before granting has closed");

    // If dream has reached minimum funding, you can't reclaim its grants
    if(await controller.hasReceivedMinimumFunding(dream))
      throw new Error(
          "You can't reclaim grants if it has reached minimum funding"
      );

    await Grant.updateMany({ dreamId }, { reclaimed: true });

    return dream;
  }
})

let controller = null

module.exports = models => {
  if (controller == null) controller = createController(models);
  return controller;
}
