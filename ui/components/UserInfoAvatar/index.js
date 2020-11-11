import React, { useState, useRef } from "react";
import { useLazyQuery } from "@apollo/react-hooks";
import UserInfoTooltip from "./UserInfoTooltip";
import gql from "graphql-tag";

const USER_QUERY = gql`
  query User($id: ID!) {
    user(id: $id) {
      id
      name
      bio
      avatar
    }
  }
`;
const UserInfoAvatar = ({ currentUser, userId, avatar, alt, uniqueId = '' }) =>  {

  const [getUserInfo, {called, loading, data }] = useLazyQuery(
    USER_QUERY
  );
  
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  
  const targetRef = useRef(null);

  const toggleTooltip = event => {
    getUserInfo({
      variables: { id: userId },
    });
    // TODO - perhaps only when the lazy returns
    setIsTooltipVisible(true);
    if (event) {
      event.preventDefault();
      return;
    }
  };

  const handleClose = e => {
    setIsTooltipVisible(false);
  };

    return (
      <span
        className="user-info-avatar"
        onClick={toggleTooltip}
        ref={targetRef}
      >
        <img className="avatar" src={avatar} alt={alt} />

      { data && data.user && (
        <UserInfoTooltip
          user={data?.user}
          currentUser={currentUser}
          target={targetRef.current}
          isVisible={isTooltipVisible}
          handleClose={handleClose}
          uniqueId={uniqueId}
        />
      )}
      </span>
    );
  }

export default UserInfoAvatar;
