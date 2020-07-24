const util = require("util")
const fetch = require("node-fetch");
require('dotenv').config();

async function do_query(query) {
  const json = {query};
  const result = await fetch("http://localhost:4000/graphql", {
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(json)
  });
  return await result.json();
}

async function check_query(query, condition) {
  if(typeof condition === "string") {
    let old = condition;
    condition = res => JSON.stringify(res) === old;
  }

  await do_query(query).then(res => {
    try{
      if (condition(res)) {
        console.log("OK");
      } else {
        console.log("Error: ")
        console.log(err);
      }

    } catch(e) {
      console.log("Error: ")
      console.log(util.inspect(res, {showHidden: false, depth: null}))
    }
  }).catch(err => {
      console.log("Error: ")
      console.log(util.inspect(res, {showHidden: false, depth: null}))
  });
}

let dreamBudget = 10;
let dreamMaxBudget = 20;
let dreamIncome = 2;
let dreamMaxIncome = 4;

async function createTestEventAndDream({grantsPerMember=1000, totalBudget=1000, grantValue=1}, withGrant = false) {
  let subjects = {}
  res = await do_query(`mutation {createEvent(slug:"test${Date.now()}", title:"test", currency:"EUR", registrationPolicy:OPEN){id}}`);
  let { data: { createEvent: {id: eventId} } } = res;
  if (!eventId) throw new Error("Failed to setup event");

  res = await do_query(`mutation {createDream(eventId:"${eventId}",title:"test"){id}}`);
  let { data: { createDream : { id: dreamId } } } = res;
  if (!dreamId) throw new Error("Failed to setup dream");

  res = await do_query(`mutation {updateGrantingSettings(
  eventId:"${eventId}",
  grantingOpens: "2020-01-02",
  grantingCloses: "2022-01-01",
  dreamCreationCloses: "2020-01-01",
  grantsPerMember: ${grantsPerMember},
  totalBudget:${totalBudget},
  grantValue: 1
){id, grantingOpens, grantingCloses}}`);
  let { resEventId, grantingOpens, grantingCloses } = res.data.updateGrantingSettings;
  if (!resEventId === eventId) throw new Error("Not same event returned");

  res = await do_query(`mutation { editDream(
  dreamId:"${dreamId}",
  budgetItems:[
    {description:"test", min:${dreamBudget/2}, max:${dreamMaxBudget/2},type:EXPENSE},
    {description:"test2", min:${dreamBudget/2}, max:${dreamMaxBudget/2},type:EXPENSE},
    {description:"test3", min:${dreamIncome}, max:${dreamMaxIncome},type:INCOME},
  ]
){id,maxGoal,maxGoalGrants,budgetItems{description,min,max}}}`);
  let {description, min, max} = res.data.editDream.budgetItems[0];
  if(min != dreamBudget/2) throw new Error("Min not set right");

  res = await do_query(`mutation {approveForGranting(dreamId:"${dreamId}", approved:true){approved}}`);
  let {approved} = res.data.approveForGranting;
  if(approved !== true) throw new Error("Could not approve for granting.");

  if(withGrant) {
    let res = await do_query( `mutation { giveGrant(eventId:"${eventId}", dreamId: "${dreamId}", value:${grantValue}){id,value,reclaimed}}`);
    if(!res.data || !res.data.giveGrant || res.data.giveGrant.value !== grantValue || res.data.giveGrant.reclaimed !== false)
      throw new Error("Not able to set up grant.");
    let grantId = res.data.giveGrant.id;
    subjects.grantId = grantId;
  }

  subjects.dreamId = dreamId;
  subjects.eventId = eventId;
  return subjects;
}

async function initialize(grantsPerMember=1000, totalBudget=1000) {
  let res = await do_query("{ currentUser {id} }");
  let { data: { currentUser: { id: userId } } } = res;
  if (!userId) throw new Error("Error, no user to test with.");
  let ret =  await createTestEventAndDream({grantsPerMember, totalBudget});
  ret.userId = userId;
  return ret;
}

(async function main() {
  let regular = await initialize(1000);
  let userId = regular.userId;

  // Here follow the tests
  await check_query(
      `mutation {approveForGranting(dreamId:"${regular.dreamId}", approved:true){approved}}`,
      '{"data":{"approveForGranting":{"approved":true}}}'
  );

  await check_query(
      `mutation {approveForGranting(dreamId:"${regular.dreamId}", approved:false){approved}}`,
      '{"data":{"approveForGranting":{"approved":false}}}'
  );

  await check_query(
      `mutation {approveForGranting(dreamId:"${regular.dreamId}", approved:true){approved}}`,
      '{"data":{"approveForGranting":{"approved":true}}}'
  );

  await check_query(`mutation { giveGrant(eventId:"${regular.eventId}", dreamId: "${regular.dreamId}", value:${dreamMaxBudget - dreamIncome + 1}){value}}`,
      res => !!res.errors
  );

  let grantValue = dreamMaxBudget - dreamIncome;
  await check_query(`mutation { giveGrant(eventId:"${regular.eventId}", dreamId: "${regular.dreamId}", value:${grantValue}){value}}`,
      res => res.data.giveGrant && res.data.giveGrant.value == grantValue
  );

  await check_query(`mutation { giveGrant(eventId:"${regular.eventId}", dreamId: "${regular.dreamId}", value:1){value}}`,
      res => !!res.errors
  );

  await check_query(
      `{dream(id:"${regular.dreamId}"){minGoalGrants,maxGoalGrants,currentNumberOfGrants}}`,
      `{"data":{"dream":{"minGoalGrants":8,"maxGoalGrants":18,"currentNumberOfGrants":18}}}`
  );

  let oneGrant = await initialize(1);

  await check_query(
      `mutation { giveGrant(eventId:"${oneGrant.eventId}", dreamId: "${oneGrant.dreamId}", value:${2}){value}}`,
      res => !!res.errors
  );

  await check_query(
      `mutation { giveGrant(eventId:"${oneGrant.eventId}", dreamId: "${oneGrant.dreamId}", value:${1}){value}}`,
      res => res.data.giveGrant && res.data.giveGrant.value == 1
  );

  let oneTotal = await initialize(1000, 1);

  await check_query(
      `mutation { giveGrant(eventId:"${oneTotal.eventId}", dreamId: "${oneTotal.dreamId}", value:${2}){value}}`,
      res => !!res.errors
  );

  await check_query(
      `mutation { giveGrant(eventId:"${oneTotal.eventId}", dreamId: "${oneTotal.dreamId}", value:${1}){value}}`,
      res => res.data.giveGrant && res.data.giveGrant.value == 1
  );

  let withGrant = await createTestEventAndDream({totalBudget: 1000, grantsPerMember: 1000}, true);

  await check_query(
      `mutation { reclaimGrants(dreamId:"${withGrant.dreamId}"){id}}`,
      res => res.data.reclaimGrants.id === withGrant.dreamId
  )
  await check_query(`{ grant(grantId: "${withGrant.grantId}"){reclaimed}}`,
      res => res.data.grant.reclaimed === true
  );

  // Deleting grant
  await check_query(
      `mutation { deleteGrant(eventId:"${withGrant.eventId}", grantId:"${withGrant.grantId}"){id,reclaimed}}`,
      res => res.data.deleteGrant.id === withGrant.grantId && res.data.deleteGrant.reclaimed === true
  )
  await check_query(`{ grant(grantId: "${withGrant.grantId}"){id}}`,
      res => !!res.errors);

  let fullyFunded = await createTestEventAndDream({totalBudget: 1000, grantsPerMember: 1000, grantValue: dreamBudget}, true);
  await check_query(
      `mutation { reclaimGrants(dreamId:"${fullyFunded.dreamId}"){id}}`,
      res => !!res.errors
  )


})().catch(e => console.log(e));

