import { useForm } from "react-hook-form";
import { useMutation, gql } from "@apollo/client";
import Card from "components/styled/Card";
import { Box, Button, TextField } from "@material-ui/core";

const EDIT_EVENT = gql`
  mutation editEvent($eventId: ID!, $about: String) {
    editEvent(eventId: $eventId, about: $about) {
      id
      about
    }
  }
`;

export default ({ closeModal, event }) => {
  const [editEvent] = useMutation(EDIT_EVENT, {
    variables: {
      eventId: event.id,
    },
  });
  const { handleSubmit, register, errors } = useForm();

  return (
    <Card>
      <Box p={3}>
        <h1 className="text-3xl">Set about</h1>
        <form
          onSubmit={handleSubmit((variables) => {
            editEvent({ variables })
              .then(() => {
                closeModal();
              })
              .catch((err) => {
                console.log({ err });
                alert(err.message);
              });
          })}
        >
          <Box m="15px 0">
            <TextField
              name="about"
              label="About (markdown)"
              defaultValue={event.about}
              inputRef={register}
              fullWidth
              multiline
              variant="outlined"
            />
          </Box>

          <Button
            type="submit"
            size="large"
            variant="contained"
            color="primary"
          >
            Save
          </Button>
        </form>
      </Box>
    </Card>
  );
};
