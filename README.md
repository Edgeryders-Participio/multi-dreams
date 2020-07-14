# Race conditions

I wanted to check how gql handles multiple queries so I did a small demonstration. Race conditions are definitely possible.

To replicate: `docker-compose up` and in `/api`, do `npm start`. No need for ui.

Then, open graphql playground and open three tabs. In tabs 1 and 2, paste:
```
mutation {
    increment
}
```
In tab 3, paste:
```
{
    globalNumber
}
```

Run tab 3 first. It will give you the current state of a counter. It starts at 1.
If you run tab 1 or 2, they will increment that number but with a delay of 5 seconds to represent a db query.
Do it once if you want, and then check in tab 3 that it increments.

Then, to observe the race condition, note the current number, and start both tabs 1 and 2 quickly. 
If you start one before the other finishes, and then later observe the nunber, you'll see it was only incremented once, instead of the expected two.

This shows that separate queries happen in parallell, and can be used for hacking and breaking what the code in the resolvers thinks it is doing,
if it's not written atomically.

See included screenshots too.

# Dreams

[Building a multi-tentant dreams platform](https://edgeryders.eu/t/rewrite-of-dreams-for-multi-tenancy-and-wider-adoption/11476)

## Tech stack

The project consists of two parts:

- `/api`: a GraphQL API built with Node.js, MongoDB and Apollo Server
- `/ui`: a front-end application built with React and Next.js

Everything on `master` is automatically deployed to [Now](https://zeit.co/) as [dreams.wtf](https://dreams.wtf)

## Development

### Prerequisites

- [Install and run](https://docs.docker.com/compose/install/) Docker-compose
- [Install Node.js](https://nodejs.org/en/) version >= 12.
  - Or run `nvm use` in this directory
- Install dependencies: `npm i`
  - This also installs dependencies in `/ui` and `/api`
- Copy `.env.default` to `.env`

### Running the project

#### Option 1

Run the whole stack (db + code) from the root with:

```
npm run dev
```

#### Option 2

Run the mongo db and the code separately using 2 terminals::

```
npm run db:up
```

```
npm start
```

> This last command calls `now dev`.

This builds and serves both the API and the UI with one command, and provides hot reloading.
`now dev` simulates the serverless deployment platform [Now](https://zeit.co/) where the project is deployed.

### Resetting the db to its initial state

While the db is running, in a new terminal:

```
npm run db:reset
```

### Using the local mongodb admin UI

Just visit http://localhost:8081

## License

Released under the AGPLv3+ which is included in the file [LICENSE](LICENSE) in the git repository
