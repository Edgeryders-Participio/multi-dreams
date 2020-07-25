const { Schema } = require('mongoose');


const LogEntrySchema = new Schema({
  when: {type: Date, required: true}
});

const GrantGivenSchema = new Schema({
  givingUser: { type: Schema.Types.ObjectId, index: true, required: true },
  receivingDream: { type: Schema.Types.ObjectId, index: true, required: true },
  numberOfGrants: { type: Number, required: true },
  grantValue: { type: Number, required: true },
  eventCurrency: { type: String, required: true },
})

function createModels(db) {
  const discriminatorOptions = {discriminatorKey: "kind"};
  const LogEntry = db.model('LogEntry', LogEntrySchema);
  const GrantGivenLogEntry =
      LogEntry.discriminator("GrantGiven", GrantGivenSchema,discriminatorOptions);

  return {
    LogEntry,
    GrantGivenLogEntry
  }
}

module.exports = { createLogEntryModels: createModels };
