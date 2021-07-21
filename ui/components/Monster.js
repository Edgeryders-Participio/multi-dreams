import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useMutation, gql } from "@apollo/client";
import AutoScroll from "@brianmcallister/react-auto-scroll";

import { CloseIcon, ArrowUpIcon } from "components/Icons";
import TextField from "components/TextField";
import ExpandButton from "components/ExpandButton";
import dreamName from "utils/dreamName";

const GUIDELINE = "GUIDELINE";
const MESSAGE = "MESSAGE";
const ACTION = "ACTION";
const ANSWER = "ANSWER";
const INPUT = "INPUT";

const GuidelineComponent = ({ guideline }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative w-full">
      <h2 className="mb-1 font-semibold">{guideline.title}</h2>
      <div
        className={expanded ? "" : "line-clamp-2"}
        style={{ minHeight: "36px" }}
      >
        <ReactMarkdown
          source={guideline.description}
          className="markdown text-sm"
        />
      </div>

      <ExpandButton expanded={expanded} setExpanded={setExpanded} />
    </div>
  );
};

const InputAction = ({ item, setChatItems, chatItems, color }) => {
  const [input, setInput] = useState("");
  const disabled = input.length === 0;
  return (
    <div className="my-2 mx-3 flex items-end">
      <TextField
        multiline
        placeholder="Write here..."
        color={color}
        className="flex-grow"
        autoFocus
        inputProps={{ value: input, onChange: (e) => setInput(e.target.value) }}
      />

      <button
        onClick={() => {
          item.sideEffect(input);
          setChatItems([
            ...chatItems,
            { type: ANSWER, message: input },
            ...item.chatItems,
          ]);
        }}
        disabled={disabled}
        className={`bg-${
          disabled ? "gray-200" : color
        } transition-colors duration-75 rounded-full p-2 text-white ml-2`}
      >
        <ArrowUpIcon className="h-6 w-6" />
      </button>
    </div>
  );
};

const RAISE_FLAG_MUTATION = gql`
  mutation RaiseFlag($dreamId: ID!, $guidelineId: ID!, $comment: String!) {
    raiseFlag(dreamId: $dreamId, guidelineId: $guidelineId, comment: $comment) {
      id
      raisedFlags {
        id
        comment
        guideline {
          id
          title
        }
      }
    }
  }
`;

const RESOLVE_FLAG_MUTATION = gql`
  mutation ResolveFlag($dreamId: ID!, $flagId: ID!, $comment: String!) {
    resolveFlag(dreamId: $dreamId, flagId: $flagId, comment: $comment) {
      id
      raisedFlags {
        id
        comment
        guideline {
          id
          title
        }
      }
    }
  }
`;

const ALL_GOOD_FLAG_MUTATION = gql`
  mutation AllGoodFlag($dreamId: ID!) {
    allGoodFlag(dreamId: $dreamId) {
      id
    }
  }
`;

const raiseFlagFlow = (guidelines, raiseFlag, currentOrg) => [
  {
    type: ACTION,
    message: "Which one?",
    actions: guidelines.map((guideline) => ({
      label: guideline.title,
      chatItems: [
        {
          type: INPUT,
          message: `Please provide a reason, why do you think this guideline is not met? Your answer will be anonymous to the ${dreamName(
            currentOrg
          )} creators.`,
          sideEffect: (answer) => {
            raiseFlag({
              variables: {
                guidelineId: guideline.id,
                comment: answer,
              },
            }).then((data) => console.log({ data }));
          },
          chatItems: [
            {
              type: MESSAGE,
              message: "Thank you! Your answer has been recorded.",
            },
          ],
        },
      ],
    })),
  },
];

const resolveFlagFlow = (flagId, resolveFlag) => [
  {
    type: INPUT,
    message:
      "You can resolve this flag if you feel the issue has been fixed or if it should not be raised. Please provide a comment: ",
    sideEffect: (answer) => {
      resolveFlag({
        variables: {
          flagId,
          comment: answer,
        },
      }).then((data) => console.log({ data }));
    },
    chatItems: [
      {
        type: MESSAGE,
        message: "Thank you!",
      },
    ],
  },
];

const Monster = ({ event, dream, currentOrg }) => {
  const [open, setOpen] = useState(false);
  const isAngry = dream.raisedFlags.length > 0;
  const [bubbleOpen, setBubbleOpen] = useState(true);
  const closeBubble = () => setBubbleOpen(false);

  const [raiseFlag] = useMutation(RAISE_FLAG_MUTATION, {
    variables: { dreamId: dream.id },
  });
  const [resolveFlag] = useMutation(RESOLVE_FLAG_MUTATION, {
    variables: { dreamId: dream.id },
  });
  const [allGoodFlag] = useMutation(ALL_GOOD_FLAG_MUTATION, {
    variables: { dreamId: dream.id },
  });

  const { raisedFlags } = dream;

  const guidelines = event.guidelines.map((guideline) => ({
    type: GUIDELINE,
    guideline,
  }));

  let items;

  if (raisedFlags.length > 0) {
    items = [
      {
        type: MESSAGE,
        message: `This ${dreamName(
          currentOrg
        )} has been flagged for breaking guidelines. Please help review it!`,
      },
      {
        type: MESSAGE,
        message: `Here are the guidelines that ${dreamName(
          currentOrg
        )}s need to follow:`,
      },
      ...guidelines,
      ...raisedFlags.map((raisedFlag) => ({
        type: MESSAGE,
        message: `Someone flagged this ${dreamName(
          currentOrg
        )} for breaking the "${
          raisedFlag.guideline.title
        }" guideline with this comment:

          "${raisedFlag.comment}"`,
      })),
      {
        type: ACTION,
        message: `Could you help review this?`,
        actions: [
          {
            label: "It is breaking another guideline",
            chatItems: raiseFlagFlow(
              event.guidelines.filter(
                (guideline) =>
                  !raisedFlags
                    .map((flag) => flag.guideline.id)
                    .includes(guideline.id)
              ),
              raiseFlag,
              currentOrg
            ),
          },
          raisedFlags.length > 1
            ? {
                label: "I'd like to resolve a flag",
                chatItems: [
                  {
                    type: ACTION,
                    message: "Which one?",
                    actions: raisedFlags.map((raisedFlag) => ({
                      label: `${raisedFlag.guideline.title}: ${raisedFlag.comment}`,
                      chatItems: resolveFlagFlow(raisedFlag.id, resolveFlag),
                    })),
                  },
                ],
              }
            : {
                label: "I'd like to resolve the flag",
                chatItems: resolveFlagFlow(raisedFlags[0].id, resolveFlag),
              },
        ],
      },
    ];
  } else {
    items = [
      ...[
        {
          type: MESSAGE,
          message: `Please help review this ${dreamName(currentOrg)}!`,
        },
        {
          type: MESSAGE,
          message: `Here are the guidelines that ${dreamName(
            currentOrg
          )}s need to follow:`,
        },
      ],
      ...guidelines,
      ...[
        {
          type: ACTION,
          message: `Does this ${dreamName(
            currentOrg
          )} comply with the guidelines?`,
          actions: [
            {
              label: "Yes, looks good to me!",
              sideEffect: () =>
                allGoodFlag().then((data) => console.log({ data })),
              chatItems: [{ type: MESSAGE, message: "Alright, thank you!" }],
            },
            {
              label: "No, it's breaking a guideline",
              chatItems: raiseFlagFlow(event.guidelines, raiseFlag),
            },
          ],
        },
      ],
    ];
  }

  const [chatItems, setChatItems] = useState(items);

  const renderChatItem = (item, i) => {
    switch (item.type) {
      case MESSAGE:
      case ACTION:
      case INPUT:
        return (
          <div className="my-2 mx-3 flex justify-start" key={i}>
            <div className="text-gray-800 bg-white shadow p-3 rounded">
              {item.message}
            </div>
          </div>
        );
      case GUIDELINE:
        return (
          <div
            className="text-gray-800 bg-white shadow p-3 my-2 rounded mx-3"
            key={i}
          >
            <GuidelineComponent guideline={item.guideline} />
          </div>
        );
      case ANSWER:
        return (
          <div className={`mt-1 my-2 mx-3 flex justify-end`} key={i}>
            <div
              className={`rounded-full border-2 border-${event.color} bg-${event.color} font-semibold py-2 px-3 text-white`}
              key={i}
            >
              {item.message}
            </div>
          </div>
        );
    }
  };
  return (
    <div
      className={
        "fixed right-0 bottom-0 p-4 z-30 flex flex-col items-end max-w-6xl"
      }
    >
      {open && (
        <div
          className={`fixed inset-0 sm:relative sm:h-148 sm:w-100 bg-gray-100 sm:rounded-lg shadow-lg border-${event.color} overflow-hidden border-3 flex flex-col`}
        >
          <div
            className={`bg-${event.color} text-lg text-white p-3 font-semibold flex items-center justify-center relative`}
          >
            <div className="">Review</div>
            <button
              className="absolute mr-2 right-0 focus:outline-none"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="relative h-full">
            <div className="absolute inset-0">
              <AutoScroll
                showOption={false}
                className="h-full overflow-y-scroll"
              >
                {chatItems.map((item, i) => renderChatItem(item, i))}

                {chatItems[chatItems.length - 1].actions && (
                  <div className="flex min-w-full justify-end flex-wrap -mx-1 p-3">
                    {chatItems[chatItems.length - 1].actions.map((action) => (
                      <button
                        className={`border-2 border-${event.color} m-1 hover:bg-${event.color} text-${event.color}-dark hover:text-white font-semibold py-2 px-3 rounded-full focus:outline-none`}
                        key={action.label}
                        onClick={() => {
                          action.sideEffect && action.sideEffect();
                          setChatItems([
                            ...chatItems,
                            { type: ANSWER, message: action.label },
                            ...action.chatItems,
                          ]);
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}

                {chatItems[chatItems.length - 1].type === INPUT && (
                  <InputAction
                    item={chatItems[chatItems.length - 1]}
                    chatItems={chatItems}
                    setChatItems={setChatItems}
                    color={event.color}
                  />
                )}
              </AutoScroll>
            </div>
          </div>
        </div>
      )}

      {bubbleOpen && !open && (
        <>
          <div
            className="relative bg-white text-gray-800 w-64 cursor-pointer rounded-lg p-4 shadow-lg mb-2 animation-once animation-fade-in"
            onClick={() => {
              setOpen(true);
              closeBubble();
            }}
          >
            {chatItems[0].message}
            <button
              className="absolute p-1 m-1 top-0 right-0 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                closeBubble();
              }}
              tabIndex="-1"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {!open && (
        <img
          onClick={() => {
            closeBubble();
            setOpen(!open);
          }}
          className={`w-40 cursor-pointer hover:animate-none`}
          src={isAngry ? "/angry-monster.gif" : "/calm-monster.gif"}
        />
      )}
    </div>
  );
};

export default Monster;
