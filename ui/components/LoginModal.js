import gql from "graphql-tag";
import { useMutation } from "@apollo/react-hooks";
import { useForm } from "react-hook-form";
import { Modal } from "@material-ui/core";

import TextField from "components/TextField";
import Button from "components/Button";

const SEND_MAGIC_LINK_MUTATION = gql`
  mutation SendMagicLink($email: String!) {
    sendMagicLink(email: $email)
  }
`;

export default ({ open, handleClose }) => {
  const [sendMagicLink, { data, loading }] = useMutation(
    SEND_MAGIC_LINK_MUTATION
  );
  const { handleSubmit, register, errors } = useForm();
  
  return (
    <Modal
      open={open}
      onClose={handleClose}
      className="flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-lg shadow p-6 focus:outline-none flex-1 max-w-screen-sm">
        <h1 className="text-2xl font-semibold mb-4">Login or Sign up</h1>

        {data && data.sendMagicLink ? (
          <div className="text-xl py-3 text-gray-800 border-3 border-transparent animation-fade-in duration-75 animation-once">
            {process.env.IS_PROD
              ? "Magic link sent! Check your email inbox!"
              : "Find the magic link in your development console!"}
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(({ email }) => {
              sendMagicLink({ variables: { email } });
            })}
          >
            <div className="flex flex-col sm:flex-row">
              <TextField
                className="mb-4 sm:mb-0 sm:mr-4 flex-grow"
                name="email"
                disabled={loading}
                placeholder="Email"
                size="large"
                inputRef={register({
                  required: "Required",
                  pattern: {
                    value: /^[ ]{0,}[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}[ ]{0,}$/i,
                    message: "invalid email address",
                  },
                })}
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
              />
              <Button size="large" type="submit" loading={loading}>
                Send magic link
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
