const { getModels } = require("../database/models");
const { db } = require("@sensestack/plato-core");

const mongodbSubscriber = require("./mongodb.subscriber");
const discourseSubscriber = require("./discourse.subscriber");
const loomioSubscriber = require("./loomio.subscriber");
const emailSubscriber = require("./email.subscriber");
module.exports = {
  initialize: async (eventHub) => {
    const models = getModels(await db.getConnection(process.env.MONGO_URL));

    mongodbSubscriber.initialize(eventHub, models);
    discourseSubscriber.initialize(eventHub, models);
    loomioSubscriber.initialize(eventHub, models);
    emailSubscriber.initialize(eventHub, models);
  },
};
