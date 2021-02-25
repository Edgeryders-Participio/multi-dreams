const NavItem = ({
  onClick,
  href,
  as,
  currentPath = "",
  className,
  children,
  primary,
  eventColor,
}) => {
  const active = currentPath === href;

  const regularClasses = `border-transparent text-gray-800 hover:bg-gray-300`;
  const primaryClasses = `border-anthracit hover:bg-anthracit-darker hover:text-gray-200`;
  const regularEventClasses = `border-transparent text-white hover:bg-${eventColor}-darker`;
  const primaryEventClasses = `border-white text-white hover:bg-white hover:text-${eventColor}`;
  const eventActiveClasses = `border-transparent bg-${eventColor}-darker text-white`;

  const colorsClasses = eventColor
    ? primary
      ? primaryEventClasses
      : active
      ? eventActiveClasses
      : regularEventClasses
    : primary
    ? primaryClasses
    : regularClasses;

  const classes =
    "my-1 mx-1 px-3 py-1 sm:my-0 block rounded focus:outline-none font-medium transitions-colors transitions-opacity duration-75 border-2 " +
    colorsClasses +
    " " +
    className;

  if (Boolean(onClick)) {
    return (
      <button className={classes} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <Link href={href} as={as}>
      <a className={classes}>{children}</a>
    </Link>
  );
};

export default NavItem;