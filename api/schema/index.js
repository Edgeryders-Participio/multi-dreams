const { gql } = require("apollo-server-express");

const schema = gql`
  scalar JSON
  scalar JSONObject

  type Query {
    currentUser: User
    currentOrgMember: OrgMember
    currentOrg: Organization
    organizations: [Organization!]
    organization(id: ID!): Organization!
    events(limit: Int): [Event!]
    event(slug: String): Event
    dream(id: ID!): Dream
    dreamsPage(
      eventSlug: String!
      textSearchTerm: String
      tag: String
      offset: Int
      limit: Int
    ): DreamsPage
    commentSet(dreamId: ID!, from: Int, limit: Int, order: String): CommentSet!
    orgMembersPage(offset: Int, limit: Int): OrgMembersPage
    membersPage(
      eventId: ID!
      isApproved: Boolean
      offset: Int
      limit: Int
    ): MembersPage
    categories: [Category!]
    contributionsPage(eventId: ID!, offset: Int, limit: Int): ContributionsPage
  }

  type Mutation {
    createOrganization(
      name: String!
      logo: String
      subdomain: String!
    ): Organization!

    editOrganization(
      organizationId: ID!
      name: String!
      logo: String
      subdomain: String!
    ): Organization!
    setTodosFinished: Organization

    createEvent(
      slug: String!
      title: String!
      currency: String!
      description: String
      registrationPolicy: RegistrationPolicy!
    ): Event!
    editEvent(
      eventId: ID!
      slug: String
      title: String
      archived: Boolean
      registrationPolicy: RegistrationPolicy
      info: String
      color: String
      about: String
      dreamReviewIsOpen: Boolean
      discourseCategoryId: Int
    ): Event!
    deleteEvent(eventId: ID!): Event

    addGuideline(eventId: ID!, guideline: GuidelineInput!): Event!
    editGuideline(
      eventId: ID!
      guidelineId: ID!
      guideline: GuidelineInput!
    ): Event!
    setGuidelinePosition(
      eventId: ID!
      guidelineId: ID!
      newPosition: Float
    ): Event!
    deleteGuideline(eventId: ID!, guidelineId: ID!): Event!

    addCustomField(eventId: ID!, customField: CustomFieldInput!): Event!
    editCustomField(
      eventId: ID!
      fieldId: ID!
      customField: CustomFieldInput!
    ): Event!
    setCustomFieldPosition(
      eventId: ID!
      fieldId: ID!
      newPosition: Float
    ): Event!
    deleteCustomField(eventId: ID!, fieldId: ID!): Event!

    editDreamCustomField(
      dreamId: ID!
      customField: CustomFieldValueInput!
    ): Dream!

    createDream(
      eventId: ID!
      title: String!
      description: String
      summary: String
      minGoal: Int
      maxGoal: Int
      images: [ImageInput]
      budgetItems: [BudgetItemInput]
    ): Dream
    editDream(
      dreamId: ID!
      title: String
      description: String
      summary: String
      images: [ImageInput]
      budgetItems: [BudgetItemInput]
      tags: [String!]
    ): Dream
    deleteDream(dreamId: ID!): Dream

    addCocreator(dreamId: ID!, memberId: ID!): Dream
    removeCocreator(dreamId: ID!, memberId: ID!): Dream

    addTag(dreamId: ID!, tagId: ID, tagValue: String): Dream
    removeTag(dreamId: ID!, tagId: ID!): Dream

    publishDream(dreamId: ID!, unpublish: Boolean): Dream

    addComment(dreamId: ID!, content: String!): Comment
    editComment(dreamId: ID!, commentId: ID!, content: String!): Comment
    deleteComment(dreamId: ID!, commentId: ID!): Comment

    raiseFlag(dreamId: ID!, guidelineId: ID!, comment: String!): Dream
    resolveFlag(dreamId: ID!, flagId: ID!, comment: String!): Dream
    allGoodFlag(dreamId: ID!): Dream

    joinOrg: OrgMember

    updateProfile(
      username: String
      firstName: String
      lastName: String
      bio: String
    ): User
    inviteEventMembers(emails: String!, eventId: ID!): [EventMember]
    inviteOrgMembers(emails: String!): [OrgMember]
    updateOrgMember(memberId: ID!, isOrgAdmin: Boolean): OrgMember
    updateMember(
      eventId: ID!
      memberId: ID!
      isApproved: Boolean
      isAdmin: Boolean
      isGuide: Boolean
    ): EventMember
    deleteMember(eventId: ID!, memberId: ID!): EventMember

    deleteOrganization(organizationId: ID!): Organization

    approveForGranting(dreamId: ID!, approved: Boolean!): Dream
    updateGrantingSettings(
      eventId: ID!
      currency: String
      maxAmountToDreamPerUser: Int
      grantingOpens: Date
      grantingCloses: Date
      dreamCreationCloses: Date
      allowStretchGoals: Boolean
    ): Event

    allocate(
      eventMemberId: ID!
      amount: Int!
      type: AllocationType!
    ): EventMember
    bulkAllocate(
      eventId: ID!
      amount: Int!
      type: AllocationType!
    ): [EventMember]
    contribute(eventId: ID!, dreamId: ID!, amount: Int!): Dream

    cancelFunding(dreamId: ID!): Dream
    acceptFunding(dreamId: ID!): Dream
    markAsCompleted(dreamId: ID!): Dream

    registerForEvent(eventId: ID!): EventMember
  }

  type Organization {
    id: ID!
    name: String!
    subdomain: String
    customDomain: String
    logo: String
    events: [Event]
    discourseUrl: String
    finishedTodos: Boolean
  }

  type Event {
    id: ID!
    slug: String!
    title: String!
    archived: Boolean
    organization: Organization!
    info: String
    color: String
    numberOfApprovedMembers: Int
    # visibility: Visibility
    registrationPolicy: RegistrationPolicy!
    currency: String!
    maxAmountToDreamPerUser: Int
    dreamCreationCloses: Date
    dreamCreationIsOpen: Boolean
    grantingOpens: Date
    grantingCloses: Date
    grantingIsOpen: Boolean
    guidelines: [Guideline]
    about: String
    allowStretchGoals: Boolean
    customFields: [CustomField]
    dreamReviewIsOpen: Boolean
    totalAllocations: Int
    totalContributions: Int
    totalContributionsFunding: Int
    totalContributionsFunded: Int
    totalInMembersBalances: Int
    discourseCategoryId: Int
    tags: [Tag!]
  }

  type Tag {
    id: ID!
    value: String!
  }

  type Guideline {
    id: ID!
    title: String!
    description: String!
    position: Float!
  }

  input GuidelineInput {
    title: String!
    description: String!
  }

  scalar Date

  enum RegistrationPolicy {
    OPEN
    REQUEST_TO_JOIN
    INVITE_ONLY
  }

  enum AllocationType {
    ADD
    SET
  }

  type User {
    id: ID
    username: String!
    email: String
    name: String
    firstName: String
    lastName: String
    verifiedEmail: Boolean!
    isRootAdmin: Boolean
    orgMemberships: [OrgMember!]
    avatar: String
    createdAt: Date
    currentOrgMember: OrgMember
  }

  type OrgMember {
    id: ID!
    organization: Organization!
    user: User!
    isOrgAdmin: Boolean
    bio: String #what do we do with this one?
    createdAt: Date
    currentEventMembership(slug: String): EventMember #this is weird syntax...
    eventMemberships: [EventMember!]
    discourseUsername: String
    hasDiscourseApiKey: Boolean
  }

  type OrgMembersPage {
    moreExist: Boolean
    orgMembers(offset: Int, limit: Int): [OrgMember]
  }

  type EventMember {
    id: ID!
    event: Event!
    orgMember: OrgMember!
    isAdmin: Boolean!
    isGuide: Boolean
    isApproved: Boolean!
    createdAt: Date
    balance: Int # stored as cents
    # roles: [Role]
  }

  type MembersPage {
    moreExist: Boolean
    members(
      eventId: ID!
      isApproved: Boolean
      offset: Int
      limit: Int
    ): [EventMember]
  }

  # enum Role {
  #   ADMIN
  #   GUIDE
  # }

  type Dream {
    id: ID!
    event: Event!
    title: String!
    description: String
    summary: String
    images: [Image!]
    cocreators: [EventMember]!
    budgetItems: [BudgetItem!]
    customFields: [CustomFieldValue]
    approved: Boolean
    published: Boolean
    flags: [Flag]
    raisedFlags: [Flag]
    logs: [Log]
    discourseTopicUrl: String
    # reactions: [Reaction]
    tags: [Tag!]
    minGoal: Int
    maxGoal: Int
    income: Int
    totalContributions: Int
    totalContributionsFromCurrentMember: Int
    numberOfComments: Int

    fundedAt: Date
    funded: Boolean
    completedAt: Date
    completed: Boolean
    canceledAt: Date
    canceled: Boolean
  }

  type DreamsPage {
    moreExist: Boolean
    dreams(
      eventSlug: String!
      textSearchTerm: String
      tag: String
      offset: Int
      limit: Int
    ): [Dream]
  }

  type Comment {
    id: ID!
    orgMember: OrgMember
    createdAt: Date!
    updatedAt: Date
    content: String!
    htmlContent: String
  }

  type CommentSet {
    total(dreamId: ID!, order: String): Int
    comments(dreamId: ID!, order: String): [Comment]
  }

  type CommentAction {
    comment: Comment!
    action: String
  }

  type Category {
    id: ID!
    name: String
    color: String
  }

  type Flag {
    id: ID!
    guideline: Guideline
    user: User
    comment: String
    type: String
  }

  type Image {
    id: ID!
    small: String
    large: String
  }

  input ImageInput {
    small: String
    large: String
  }

  type BudgetItem {
    id: ID!
    description: String!
    min: Int!
    max: Int
    type: BudgetItemType!
  }

  enum BudgetItemType {
    INCOME
    EXPENSE
  }

  input BudgetItemInput {
    description: String!
    min: Int!
    max: Int
    type: BudgetItemType!
  }

  interface Transaction {
    id: ID!
    event: Event!
    eventMember: EventMember!
    amount: Int!
    createdAt: Date
  }

  type Contribution implements Transaction {
    id: ID!
    event: Event!
    eventMember: EventMember!
    amount: Int!
    createdAt: Date
    dream: Dream!
  }

  type ContributionsPage {
    moreExist: Boolean
    contributions(eventId: ID!, offset: Int, limit: Int): [Contribution]
  }

  type Allocation implements Transaction {
    id: ID!
    event: Event!
    eventMember: EventMember!
    amount: Int!
    createdAt: Date
  }

  # enum Visibility {
  #   PUBLIC
  #   PRIVATE # only for paid
  #   HIDDEN # only for paid
  # }

  # type GrantingPeriod {
  #   event: Event!
  #   submissionCloses: Date
  #   grantingStarts: Date
  #   grantingCloses: Date # when this happens. all grants to non-funded projects go back into the pool
  #   name: String
  #   budget: Int
  #   distributeGrants: DistributeGrantStrategy
  # }

  # enum DistributeGrantStrategy {
  #   DISTRIBUTE_EQUALLY # is this possible?
  #   DISTRIBUTE_TO_ACTIVE_USERS
  #   COMMITTEE
  # }

  # type Emoji {
  #   unicode: String!
  #   event: Event!
  # }

  # type Reaction {
  #   emoji: Emoji!
  #   by: Member!
  #   # createdAt
  # }

  type CustomFieldValue {
    id: ID!
    customField: CustomField
    value: JSON
  }

  input CustomFieldValueInput {
    fieldId: ID!
    eventId: ID!
    value: JSON
  }

  enum CustomFieldType {
    TEXT
    MULTILINE_TEXT
    BOOLEAN
    FILE
  }

  type CustomField {
    id: ID!
    name: String!
    description: String!
    type: CustomFieldType!
    limit: Int
    isRequired: Boolean!
    position: Float!
    createdAt: Date!
  }

  input CustomFieldInput {
    name: String!
    description: String!
    type: CustomFieldType!
    limit: Int
    isRequired: Boolean!
    createdAt: Date
  }

  type Log {
    createdAt: Date
    user: User
    dream: Dream
    event: Event
    details: LogDetails
    type: String
  }

  type FlagRaisedDetails {
    guideline: Guideline
    comment: String
  }

  type FlagResolvedDetails {
    guideline: Guideline
    comment: String
  }

  type Subscription {
    commentsChanged(dreamId: ID!): CommentAction!
  }

  union LogDetails = FlagRaisedDetails | FlagResolvedDetails

  # type QuestionAnswer {
  #   question: Question
  #   answer: String
  # }

  # type Question {
  #   richtext: String
  #   isRequired: Boolean!
  # }

  # type Image {}
`;

module.exports = schema;
