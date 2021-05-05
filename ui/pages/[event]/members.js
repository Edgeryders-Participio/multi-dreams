import Members from "components/members";
import DashboardMenu from "components/SubMenu";
const EventMembersPage = ({ event, currentOrgMember }) => {
  const isAdmin =
    currentOrgMember?.currentEventMembership?.isAdmin ||
    currentOrgMember?.isOrgAdmin;
  if (!isAdmin || !event) return null;
  return (
    <div className="flex-1">
      <DashboardMenu currentOrgMember={currentOrgMember} event={event} />
      <Members event={event} />
    </div>
  );
};

export default EventMembersPage;
