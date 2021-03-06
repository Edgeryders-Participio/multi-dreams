import { useForm } from "react-hook-form";

import { useMutation, gql } from "@apollo/client";
import Router from "next/router";

import { Modal } from "@material-ui/core";

import TextField from "components/TextField";
import Button from "components/Button";
import dreamName from "utils/dreamName";

const CREATE_DREAM = gql`
  mutation CreateDream($eventId: ID!, $title: String!) {
    createDream(eventId: $eventId, title: $title) {
      id
      title
    }
  }
`;

export default ({ event, handleClose, currentOrg }) => {
  const [createDream, { loading }] = useMutation(CREATE_DREAM, {
    variables: { eventId: event.id },
    refetchQueries: ["Dreams"],
  });

  const { handleSubmit, register, errors } = useForm();

  const onSubmitCreate = (variables) => {
    createDream({
      variables,
    })
      .then(({ data }) => {
        Router.push(
          "/[event]/[dream]",
          `/${event.slug}/${data.createDream.id}`
        );
        handleClose();
      })
      .catch((err) => {
        console.log({ err });
        alert(err.message);
      });
  };

  return (
    <Modal
      open={true}
      onClose={handleClose}
      className="flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-lg shadow p-6 focus:outline-none flex-1 max-w-screen-sm">
        <form onSubmit={handleSubmit(onSubmitCreate)}>
          <h1 className="text-xl font-semibold">New {dreamName(currentOrg)}</h1>

          <TextField
            className="my-3"
            name="title"
            size="large"
            placeholder="Title"
            inputRef={register({
              required: "Required",
            })}
            autoFocus
            error={Boolean(errors.title)}
            helperText={errors.title?.message}
            color={event.color}
          />

          <div className="flex justify-end">
            <Button
              size="large"
              variant="secondary"
              onClick={handleClose}
              className="mr-3"
              color={event.color}
            >
              Cancel
            </Button>
            <Button
              size="large"
              type="submit"
              loading={loading}
              color={event.color}
            >
              Create
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
