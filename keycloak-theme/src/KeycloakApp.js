import React from "react";
import { KcApp, defaultKcProps, kcContext } from "keycloakify";
import "./index.css";
import Terms from "./components/Terms";

const DefaultApp = ({ ctx }) => {
  return (
    <KcApp
      kcContext={ctx}
      {...{
        ...defaultKcProps,
        kcHeaderWrapperClass: "top-class",
      }}
    />
  );
};

const KeycloakApp = ({ mock }) => {
  const ctx = mock ?? kcContext;

  return (
    <React.StrictMode>
      {(() => {
        // Add new custom pages by taking components from the keycloakify
        // project and then modifying those.
        switch (ctx.pageId) {
          //case "login.ftl":
          //  return <Login ctx={ctx} />;
          //case "register.ftl":
          //  return <Register {...{ kcContext, ...props }} />;
          //case "info.ftl":
          //  return <Info {...{ kcContext, ...props }} />;
          //case "error.ftl":
          //  return <Error {...{ kcContext, ...props }} />;
          //case "login-reset-password.ftl":
          //  return <LoginResetPassword {...{ kcContext, ...props }} />;
          //case "login-verify-email.ftl":
          //  return <LoginVerifyEmail {...{ kcContext, ...props }} />;
          case "terms.ftl":
            return <Terms ctx={ctx} />;
          //case "login-otp.ftl":
          //  return <LoginOtp {...{ kcContext, ...props }} />;
          default:
            return <DefaultApp ctx={ctx} />;
        }
      })()}
    </React.StrictMode>
  );
};

export default KeycloakApp;
