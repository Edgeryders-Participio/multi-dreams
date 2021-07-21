import React, { useState, useContext } from "react";
import TextField from "components/TextField";
import Button from "components/Button";
import { useForm } from "react-hook-form";
import Context from "contexts/comment";

const EditComment = ({ comment, handleDone }) => {
  const [submitting, setSubmitting] = useState(false);
  const { handleSubmit, register, errors } = useForm();
  const { editComment, dream, event } = useContext(Context);

  return (
    <form
      onSubmit={handleSubmit(({ content }) => {
        setSubmitting(true);
        editComment({ variables: { dreamId: dream.id, commentId: comment.id, content } })
          .then(() => handleDone())
          .finally(() => setSubmitting(false))
          .catch((err) => alert(err.message));
      })}
    >
      <TextField
        name="content"
        className="mb-2"
        placeholder="Comment"
        multiline
        error={Boolean(errors.content)}
        helperText={errors.content?.message}
        defaultValue={comment.content}
        inputRef={register({ required: "Required" })}
        autoFocus
        color={event.color}
      />
      <div className="flex justify-end">
        <Button
          onClick={handleDone}
          className="mr-2"
          variant="secondary"
          color={event.color}
        >
          Cancel
        </Button>
        <Button type="submit" loading={submitting} color={event.color}>
          Save
        </Button>
      </div>
    </form>
  );
};

export default EditComment;
