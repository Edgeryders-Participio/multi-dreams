import React, { useRef, useState, useContext } from "react";
import Context from "contexts/comment";
import { useForm } from "react-hook-form";
import Link from "next/link";

import TextField from "components/TextField";
import Button from "components/Button";
import Avatar from "components/Avatar";

function AddComment() {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { handleSubmit, register, errors } = useForm();
  const inputRef = useRef();
  const { addComment, dream, event, currentOrg, currentOrgMember } = useContext(Context);
  if (currentOrg.discourseUrl && !currentOrgMember.hasDiscourseApiKey) {
    return (
      <Link href={"/connect-discourse"} passHref>
        <Button color={event.color} nextJsLink className="my-2">
          You need to connect to Discourse to comment
        </Button>
      </Link>
    );
  }
  return (
    <form
      onSubmit={handleSubmit(() => {
        setSubmitting(true);
        addComment({ variables: { dreamId: dream.id, content } })
          .then(() => {
            inputRef.current.blur();
            setContent("");
          })
          .finally(() => setSubmitting(false))
          .catch((err) => alert(err.message));
      })}
    >
      <div className="flex">
        <div className="mr-4">
          <Avatar user={currentOrgMember.user} />
        </div>
        <div className="flex-grow">
          <div className="mb-2">
            <TextField
              name="content"
              placeholder="Add comment"
              multiline
              rows={1}
              error={Boolean(errors.content)}
              helperText={errors.content?.message}
              value={content}
              inputProps={{
                value: content,
                onChange: (e) => setContent(e.target.value),
              }}
              inputRef={(e) => {
                register({ required: "Required" });
                inputRef.current = e;
              }}
              color={event.color}
            />
          </div>
          {content.length > 0 && (
            <div className="flex justify-end">
              <Button
                onClick={() => setContent("")}
                variant="secondary"
                color={event.color}
                className="mr-2"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={content.length === 0}
                color={event.color}
                loading={submitting}
              >
                Submit
              </Button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

export default AddComment;
