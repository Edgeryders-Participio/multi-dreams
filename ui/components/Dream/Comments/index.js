import { useState, useEffect, useContext } from "react";
import AddComment from "./AddComment";
import Comment from "./Comment";
import Log from "./Log";
import HappySpinner from "components/HappySpinner";
import Context, { useCommentContext } from "contexts/comment";
import LoadMore from "components/LoadMore";

const Comments = ({ currentOrgMember, currentOrg, dream, event }) => {
  const context = useCommentContext({
    from: 0,
    limit: 10,
    order: "desc",
    currentOrg,
    currentOrgMember,
    event,
    dream,
  });
  const { comments, from, setFrom, limit, total, loading } = context;

  return (
    <Context.Provider value={context}>
      {(comments.length > 0 || currentOrgMember?.currentEventMembership) && (
        <>
          <div className="flex justify-between items-center">
            <h2 className="mb-4 text-2xl font-medium" id="comments">
              {`${comments.length} of ${total} ${
                total === 1 ? "comment" : "comments"
              }`}
            </h2>

            {dream.discourseTopicUrl && (
              <a target="_blank" href={dream.discourseTopicUrl}>
                View on Discourse
              </a>
            )}
          </div>
          <LoadMore
            moreExist={total > comments.length}
            loading={loading}
            reverse
            onClick={() => setFrom((f) => f + limit)}
          />
        </>
      )}
      {comments.map((comment, index) => {
        if (comment._type === "LOG") return <Log log={comment} key={index} />;
        return (
          <Comment
            comment={comment}
            showBorderBottom={Boolean(index + 1 !== comments.length)}
            key={comment.id}
          />
        );
      })}
      {currentOrgMember && <AddComment />}
    </Context.Provider>
  );
};

export default Comments;
