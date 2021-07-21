import React, { useState, useContext } from "react";
import { gql, useMutation } from "@apollo/client";
import dayjs from "dayjs";
import ReactMarkdown from "react-markdown";
import relativeTime from "dayjs/plugin/relativeTime";
import Avatar from "../../Avatar";
import { DeleteIcon, EditIcon, FlagIcon } from "components/Icons";
import EditComment from "./EditComment";
import Context from "contexts/comment";
import { LoaderIcon } from "../../Icons";

dayjs.extend(relativeTime);

const LogIcon = () => (
  <div className="bg-gray-100 text-gray-700 rounded-full h-10 w-10 flex items-center justify-center">
    <FlagIcon className="h-5 w-5" />
  </div>
);

const Comment = ({
  comment,
  showBorderBottom,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [isEditMode, setEditMode] = useState(false);
  const { deleteComment, currentOrgMember, dream } = useContext(Context);

  const canEdit =
    currentOrgMember &&
    (currentOrgMember?.id === comment.orgMember?.id ||
      currentOrgMember?.currentEventMembership?.isAdmin);

  return (
    <div className="flex my-4">
      <div className="mr-4">
        {comment.isLog ? (
          <LogIcon />
        ) : (
          <Avatar user={comment.orgMember?.user} />
        )}
      </div>
      <div className={`flex-grow ${showBorderBottom && "border-b"} pb-4`}>
        <div className="flex justify-between items-center mb-2 text-gray-900 font-medium text-sm">
          {comment.isLog ? (
            <h5>Log</h5>
          ) : (
            <h5>{comment.orgMember?.user.username}</h5>
          )}
          <div className="flex items-center">
            <span className="font-normal mr-2">
              {dayjs(comment.createdAt).fromNow()}
            </span>
          </div>
        </div>

        {isEditMode ? (
          <EditComment
            comment={comment}
            handleDone={() => setEditMode(false)}
          />
        ) : (
          <>
            {comment.htmlContent ? (
              <div
                className="text-gray-900 markdown"
                dangerouslySetInnerHTML={{ __html: comment.htmlContent }}
              />
            ) : (
              <ReactMarkdown source={comment.content} className="markdown" />
            )}

            {canEdit && (
              <div className="flex">
                <button
                  onClick={() => (
                    confirm("Are you sure you would like to delete this comment?") && (
                      deleteComment({ variables: { dreamId: dream.id, commentId: comment.id } }) && setSubmitting(true)
                    )
                  )}
                  className="mt-4 py-1 px-2 mr-2 flex items-center bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 hover:text-gray-700 focus:outline-none rounded-md focus:ring"
                >
                  {submitting ? (
                    <LoaderIcon className="w-5 h-5 animation-spin animation-linear animation-2s" />
                  ) : (
                    <DeleteIcon className="w-4 h-4 mr-1" />
                  )}
                  <span>Delete</span>
                </button>
                <button
                  onClick={() => setEditMode(true)}
                  className="mt-4 py-1 px-2 flex items-center bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 hover:text-gray-700 focus:outline-none rounded-md focus:ring"
                >
                  <EditIcon className="w-4 h-4 mr-1" />
                  <span>Edit</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Comment;
