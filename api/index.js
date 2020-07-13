// const { ApolloServer } = require('apollo-server-micro');
//const { ApolloServer, gql } = require('apollo-server');

const express = require('express');
const { ApolloServer } = require('apollo-server-express');

const jwt = require('jsonwebtoken');
require('dotenv').config();
const bodyParser = require('body-parser');
const pretixHandler = require('./webhooks/pretix');
// const microCors = require('micro-cors');
// const cors = microCors({
//   allowHeaders: [
//     'X-Requested-With',
//     'Access-Control-Allow-Origin',
//     'X-HTTP-Method-Override',
//     'Content-Type',
//     'Authorization',
//     'Accept',
//     'Dreams-Subdomain',
//   ],
// });

const schema = require('./schema');
const resolvers = require('./resolvers');
const { getModels } = require('./database');
const { getConnection } = require('./database/connection');

const server = new ApolloServer({
  typeDefs: schema,
  resolvers,
  context: async ({ req }) => {
    const db = await getConnection();
    const models = getModels(db);

    let organization = null;
    const subdomain = req.headers['dreams-subdomain'];

    if (subdomain) {
      console.log({ subdomain });
      // organization = await models.Organization.findOne({ subdomain });
    }

    let currentUser = null;

    let token = req.headers.authorization
      ? req.headers.authorization.split(' ')[1]
      : null;

    // Verify token if available
    if (token) {
      try {
        token = jwt.verify(token, process.env.JWT_SECRET);
        currentUser = await models.User.findOne({ _id: token.sub });
      } catch (error) {
        // throw new AuthenticationError(
        //   'Authentication token is invalid, please log in.'
        // );
        console.error('Authentication token is invalid');
      }
    }

    return {
      models,
      currentUser,
      organization,
    };
  },
  playground: true,
  introspection: true,
});

const app = express();
server.applyMiddleware({ app });

app.use(bodyParser.json());

app.post('/pretix', pretixHandler);

app.listen({ port: 4000 }, () =>
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
);

// module.exports = cors((req, res) => {
//   if (req.method === 'OPTIONS') {
//     res.end();
//     return;
//   }
//   return server.createHandler({ path: '/api' })(req, res);
// });
