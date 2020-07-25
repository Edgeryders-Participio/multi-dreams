const UserSchema = require('./models/user');
const MemberSchema = require('./models/member');
const EventSchema = require('./models/event');
const DreamSchema = require('./models/dream');
const GrantSchema = require('./models/grant');
const {createLogEntryModels} = require('./models/logentry');

let models = null;
const getModels = (db) => {
  if (models === null) models = {
    User: db.model('User', UserSchema),
    Member: db.model('Member', MemberSchema),
    Event: db.model('Event', EventSchema),
    Dream: db.model('Dream', DreamSchema),
    Grant: db.model('Grant', GrantSchema),
    LogEntries: createLogEntryModels(db)
  }

  return models;
};

module.exports = { getModels };
