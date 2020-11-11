import React from 'react';
import Popover from 'react-simple-popover';
import Link from "next/link";
import Avatar from "components/Avatar";
import ReactMarkdown from "react-markdown";
// import './user-info-tooltip.css';

const UserInfoTooltip = ({
  currentUser,
  isVisible,
  target,
  handleClose,
  uniqueId,
  user }) => {
    const isSelfView = currentUser?.id === user?.id;

    const userComponent = user ? (
      <span className="username">{user.name}</span>
    ) : (
      <></>
    );

    return (
      <Popover
        show={isVisible}
        target={target.current}
        onHide={handleClose}
        placement="bottom"
        containerStyle={Object.assign({}, { 'z-index': '10000' })}
        id={`user-info-tooltip-${uniqueId}`}
      >
        <div className="user-info-tooltip-container">
          {/* TODO - Uncomment this when we'll have a me page or instead popup the modal */}
          { isSelfView && (userComponent)
          }
          {/* {isSelfView && (
            <Link className={`edit-icon-container`} href={`/me`}>
              {userComponent}
              <EditIcon className="h-6 w-6" />
            </Link>
          )} */}

          {!isSelfView && userComponent}

          {user && (
            <>
              <Avatar user={user} size="small" className="tooltip-avatar" />
              <ReactMarkdown source={user.bio} />
            </>
          )}
        </div>
      </Popover>
    );
  }

export default UserInfoTooltip;
