# Easy approach: shell testing!

# First time setup: 
# 1: you need to ensure there is some user in the test database that is an admin. No matter who.
# 2: set NODE_ENV=development in .env. 
# 3: Create a test event and dream: e.g. in playground do
#	mutation {createEvent(slug:"test", title:"test", currency:"EUR", registrationPolicy:OPEN){id}}
# 	mutation {createDream(eventId:"----RESULTING-ID-INTO-HERE------",title:"test"){id}}
# 4: Insert that dream ID into .env in this directory, at TEST_DREAM. Then testing will be available!
#    The following line reads that. 
. ./.env
if [ ! $TEST_DREAM ]; then echo "Please perform the first-time setup in test.sh."; exit; fi

# Poor man's testing: use this to write queries and expected answers. Will print OK if expected answer returned, ERROR otherwise.
check_query()
{
JSON='{"query": "'$1'"}'
RESULT=`curl -s -X POST \
-H "Content-Type: application/json" \
-d  "$JSON" \
http://localhost:4000/graphql`
if [ "$RESULT" = "$2" ]
then 
	echo "OK"
else 
	echo "ERROR:"
	echo $RESULT
fi
}

# Here follow the tests
check_query 'mutation {approveForGranting(dreamId:\"'$TEST_DREAM'\", approved:false){approved}}' '{"data":{"approveForGranting":{"approved":false}}}'
check_query 'mutation {approveForGranting(dreamId:\"'$TEST_DREAM'\", approved:true){approved}}' '{"data":{"approveForGranting":{"approved":true}}}'
check_query 'mutation {approveForGranting(dreamId:\"'$TEST_DREAM'\", approved:false){approved}}' '{"data":{"approveForGranting":{"approved":false}}}'

