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
    if (condition(res)) {
      console.log("OK");
    } else {
      console.log("Error: ")
      console.log(res);
    }
  }).catch(err => {
      console.log("Error: ")
      console.log(err);
  });
}

let dreamBudget = 10;
let dreamMaxBudget = 20;
let dreamIncome = 2;
let dreamMaxIncome = 4;

async function initialize(grantsPerMember, totalBudget=1000) {
  let subjects = {}
  let res = await do_query("{ currentUser {id} }");
  let { data: { currentUser: { id: userId } } } = res;
  if (!userId) throw new Error("Error, no user to test with.");

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

  subjects.dreamId = dreamId;
  subjects.eventId = eventId;
  return subjects;
}

(async function main() {
  let subjects = await initialize(1000); 
  let oneGrant = await initialize(1);
  let oneTotal = await initialize(1000, 1);

  // Here follow the tests
  await check_query(
    `mutation {approveForGranting(dreamId:"${subjects.dreamId}", approved:true){approved}}`,
    '{"data":{"approveForGranting":{"approved":true}}}'
  );

  await check_query(
    `mutation {approveForGranting(dreamId:"${subjects.dreamId}", approved:false){approved}}`,
    '{"data":{"approveForGranting":{"approved":false}}}'
  );

  await check_query(
    `mutation {approveForGranting(dreamId:"${subjects.dreamId}", approved:true){approved}}`,
    '{"data":{"approveForGranting":{"approved":true}}}'
  );

  await check_query(`mutation { giveGrant(eventId:"${subjects.eventId}", dreamId: "${subjects.dreamId}", value:${dreamMaxBudget-dreamIncome+1}){value}}`,
    res => !!res.errors
  );

  let grantValue = dreamMaxBudget-dreamIncome;
  await check_query(`mutation { giveGrant(eventId:"${subjects.eventId}", dreamId: "${subjects.dreamId}", value:${grantValue}){value}}`,
    res => res.data.giveGrant && res.data.giveGrant.value == grantValue
  );

  await check_query(`mutation { giveGrant(eventId:"${subjects.eventId}", dreamId: "${subjects.dreamId}", value:1){value}}`,
    res => !!res.errors
  );

  await check_query(
    `{dream(id:"${subjects.dreamId}"){minGoalGrants,maxGoalGrants,currentNumberOfGrants}}`,
    `{"data":{"dream":{"minGoalGrants":8,"maxGoalGrants":18,"currentNumberOfGrants":18}}}`
  );

  await check_query(
    `mutation { giveGrant(eventId:"${oneGrant.eventId}", dreamId: "${oneGrant.dreamId}", value:${2}){value}}`,
    res => !!res.errors
  );

  await check_query(
    `mutation { giveGrant(eventId:"${oneGrant.eventId}", dreamId: "${oneGrant.dreamId}", value:${1}){value}}`,
    res => res.data.giveGrant && res.data.giveGrant.value == 1
  );

  await check_query(
    `mutation { giveGrant(eventId:"${oneTotal.eventId}", dreamId: "${oneTotal.dreamId}", value:${2}){value}}`,
    res => !!res.errors
  );

  await check_query(
    `mutation { giveGrant(eventId:"${oneTotal.eventId}", dreamId: "${oneTotal.dreamId}", value:${1}){value}}`,
    res => res.data.giveGrant && res.data.giveGrant.value == 1
  );


})().catch(e => console.log(e));

