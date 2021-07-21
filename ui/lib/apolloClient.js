import { ApolloClient, HttpLink, split } from "@apollo/client";
import { InMemoryCache } from "@apollo/client/cache";
import {
  getMainDefinition,
  offsetLimitPagination,
} from "@apollo/client/utilities";
import { WebSocketLink } from "@apollo/client/link/ws";
import { setContext } from "@apollo/client/link/context";
import fetch from "isomorphic-unfetch";
import getHostInfo from "utils/getHostInfo";
import auth from "lib/auth";

export default function createApolloClient(initialState, ctx) {
  // The `ctx` (NextPageContext) will only be present on the server.
  // use it to extract auth headers (ctx.req) or similar.

  const wsLink = process.browser
    ? new WebSocketLink({
        uri: process.env.GRAPHQL_SUBSCRIPTIONS_URL,
        options: { reconnect: true },
      })
    : null;

  const httpLink = new HttpLink({
    uri: process.env.GRAPHQL_URL, // Server URL (must be absolute)
    credentials: "same-origin", // Additional fetch() options like `credentials` or `headers`
    fetch,
  });

  const appLink = process.browser
    ? split(
        ({ query }) => {
          const { kind, operation } = getMainDefinition(query);
          return kind === "OperationDefinition" && operation === "subscription";
        },
        wsLink,
        httpLink
      )
    : httpLink;

  const authLink = setContext(async (graphqlRequest, { headers }) => {
    let token;

    // strategy to get token from here: https://gist.github.com/BryceAMcDaniel/a710afe4fd877a04e55a921e4e74a21c

    if (ctx?.req) {
      try {
        const { accessToken } = await auth(ctx.req).getAccessToken(
          ctx.req,
          ctx.res
        );
        token = accessToken;
      } catch (error) {
        console.log(error);
      }
    } else {
      const response = await fetch("/api/getToken", {
        credentials: "same-origin",
      });

      token = await response.text();
    }

    let { host, subdomain } = getHostInfo(ctx?.req);
    let customdomain;

    if (
      !(
        host.endsWith(process.env.DEPLOY_URL) ||
        host.endsWith("localhost:3000") ||
        host.endsWith("staging.dreams.wtf")
      )
    ) {
      customdomain = host;
      subdomain = null;
    }

    return {
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : "",
        ...(subdomain && {
          ["dreams-subdomain"]: subdomain,
        }),
        ...(customdomain && {
          ["dreams-customdomain"]: customdomain,
        }),
      },
    };
  });

  return new ApolloClient({
    ssrMode: Boolean(ctx),
    link: authLink.concat(appLink),
    cache: new InMemoryCache({
      typePolicies: {
        CommentSet: {
          fields: {
            comments: {
              keyArgs: true,
              merge(existing = [], incoming = [], { readField, mergeObjects }) {
                const merged = existing.slice(0);

                incoming.forEach((comment) => {
                  const current = existing.findIndex(
                    (c) => readField("id", c) == readField("id", comment)
                  );

                  if (current === -1) {
                    merged.push(comment);
                  } else {
                    merged[current] = mergeObjects(existing[current], comment);
                  }
                });

                return merged.sort((c1, c2) =>
                  readField("createdAt", c1) < readField("createdAt", c2)
                    ? -1
                    : 1
                );
              },
            },
          },
        },
        OrgMembersPage: {
          fields: {
            orgMembers: offsetLimitPagination(),
          },
        },
        DreamsPage: {
          fields: {
            dreams: offsetLimitPagination([
              "eventSlug",
              "textSearchTerm",
              "tag",
            ]),
          },
        },
        MembersPage: {
          fields: {
            members: offsetLimitPagination(["eventId", "isApproved"]),
          },
        },
        ContributionsPage: {
          fields: {
            contributions: offsetLimitPagination(["eventId"]),
          },
        },
      },
      dataIdFromObject: (object) =>
        `${object.__typename}:${object.id}:${object.eventId}`,
    }).restore(initialState),
  });
}
