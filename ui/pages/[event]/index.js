import { useEffect, useState } from "react";
import { useQuery, gql } from "@apollo/client";
import Link from "next/link";
import DreamCard from "components/DreamCard";
import Filterbar from "components/Filterbar";
import SubMenu from "components/SubMenu";
import PageHero from "components/PageHero";
import Button from "components/Button";
import NewDreamModal from "components/NewDreamModal";
import EditableField from "components/EditableField";
import LoadMore from "components/LoadMore";
import dreamName from "utils/dreamName";

export const DREAMS_QUERY = gql`
  query Dreams(
    $eventSlug: String!
    $textSearchTerm: String
    $tag: String
    $timeSeed: Int
    $offset: Int
    $limit: Int
  ) {
    dreamsPage(
      eventSlug: $eventSlug
      textSearchTerm: $textSearchTerm
      tag: $tag
      timeSeed: $timeSeed
      offset: $offset
      limit: $limit
    ) {
      moreExist
      dreams(
        eventSlug: $eventSlug
        textSearchTerm: $textSearchTerm
        tag: $tag
        timeSeed: $timeSeed
        offset: $offset
        limit: $limit
      ) {
        id
        description
        summary
        title
        minGoal
        maxGoal
        income
        totalContributions
        numberOfComments
        favorite
        published
        approved
        canceled
        customFields {
          value
          customField {
            id
            name
            type
            limit
            description
            isRequired
            position
            isShownOnFrontPage
            createdAt
          }
        }
        images {
          id
          small
          large
        }
      }
    }
  }
`;

const EventPage = ({ currentOrgMember, event, router, currentOrg }) => {
  const [filterLabels, setFilterLabels] = useState();
  const [newDreamModalOpen, setNewDreamModalOpen] = useState(false);
  const [timeSeed, setTimeSeed] = useState(undefined);

  const { tag, s } = router.query;

  useEffect(() => {
    const msPerDay = 1000 * 60 * 60 * 30; // one day being 30hrs :P
    setTimeSeed(
      Math.floor(((new Date().getTime() % msPerDay) / msPerDay) * 1000)
    );
  }, []);

  let {
    data: { dreamsPage: { moreExist, dreams } } = {
      dreamsPage: { dreams: [] },
    },
    loading,
    error,
    fetchMore,
  } = useQuery(DREAMS_QUERY, {
    variables: {
      eventSlug: router.query.event,
      timeSeed,
      offset: 0,
      limit: 9,
      ...(!!s && { textSearchTerm: s }),
      ...(!!tag && { tag }),
    },
    notifyOnNetworkStatusChange: true,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
    skip: timeSeed === undefined,
  });

  const allDreams = dreams;

  if (error) {
    console.error(error);
  }
  if (!event) return null;

  if (filterLabels) {
    dreams = dreams.filter((dream) => {
      if (!dream.customFields || dream.customFields.length == 0) return;
      const existingField = dream.customFields.filter((field) => {
        return field.customField.id == filterLabels.id;
      });
      if (existingField && existingField.length > 0) {
        return existingField[0].value;
      }
    });
  }

  return (
    <>
      <SubMenu currentOrgMember={currentOrgMember} event={event} />
      <PageHero>
        <div className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="col-span-2">
              <EditableField
                value={event.info}
                label="Add homepage message"
                placeholder={`# Welcome to ${event.title}'s dream page`}
                canEdit={
                  currentOrgMember?.isOrgAdmin ||
                  currentOrgMember?.currentEventMembership?.isAdmin
                }
                name="info"
                className="h-10"
                MUTATION={gql`
                  mutation EditHomepageMessage($eventId: ID!, $info: String) {
                    editEvent(eventId: $eventId, info: $info) {
                      id
                      info
                    }
                  }
                `}
                variables={{ eventId: event.id }}
              />
            </div>
            <div className="flex justify-end items-start">
              {event.dreamCreationIsOpen &&
                currentOrgMember?.currentEventMembership?.isApproved && (
                  <>
                    <Button
                      size="large"
                      color={event.color}
                      onClick={() => setNewDreamModalOpen(true)}
                    >
                      New {dreamName(currentOrg)}
                    </Button>
                    {newDreamModalOpen && (
                      <NewDreamModal
                        event={event}
                        handleClose={() => setNewDreamModalOpen(false)}
                        currentOrg={currentOrg}
                      />
                    )}
                  </>
                )}
            </div>
          </div>
        </div>
      </PageHero>

      <div className="page flex-1">
        <Filterbar
          textSearchTerm={s}
          currentOrgMember={currentOrgMember}
          customFields={event.customFields}
          filterLabels={filterLabels}
          setFilterLabels={setFilterLabels}
          tag={tag}
          event={event}
          currentOrg={currentOrg}
        />
        {dreams.length ? (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {dreams.map((dream) => (
              <Link
                href="/[event]/[dream]"
                as={`/${event.slug}/${dream.id}`}
                key={dream.id}
              >
                <a className="flex focus:outline-none focus:ring rounded-lg">
                  <DreamCard
                    dream={dream}
                    event={event}
                    currentOrgMember={currentOrgMember}
                    filterLabels={filterLabels}
                  />
                </a>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex-grow flex flex-col justify-center items-center h-64">
            <h1 className="text-3xl text-gray-500 text-center ">
              No {dreamName(currentOrg)}s...
            </h1>
          </div>
        )}
        <LoadMore
          moreExist={moreExist}
          loading={loading}
          onClick={() => fetchMore({ variables: { offset: allDreams.length } })}
        />
      </div>
    </>
  );
};

export default EventPage;
