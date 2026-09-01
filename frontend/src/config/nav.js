import {
  Squares2X2Icon,
  UsersIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  QueueListIcon,
  BookOpenIcon,
  HomeIcon,
  CheckBadgeIcon
} from '@heroicons/react/24/outline';

// Precedence when a user has multiple roles: later roles win on a path
// collision (e.g. both Admin and Trainer have a '/sequences' entry).
export const ROLE_PRECEDENCE = ['trainer', 'kids_yoga_trainer', 'sequence_creator', 'super_admin'];

const TRAINER_NAV = [
  { to: '/', label: 'Home', Icon: HomeIcon, exact: true },
  { to: '/sessions', label: 'Sessions', Icon: CalendarDaysIcon },
  { to: '/completed', label: 'Completed', Icon: CheckBadgeIcon },
  { to: '/leaves', label: 'Leaves', Icon: DocumentTextIcon },
  { to: '/sequences', label: 'Sequences', Icon: QueueListIcon },
  { to: '/resources', label: 'Resources', Icon: BookOpenIcon }
];

export const NAV_BY_ROLE = {
  trainer: TRAINER_NAV,
  // Kids Yoga Trainer is its own role, but behaves identically to a regular
  // trainer for now - its distinct features are still to be designed.
  kids_yoga_trainer: TRAINER_NAV,
  sequence_creator: [
    { to: '/sequences', label: 'Sequences', Icon: QueueListIcon, exact: true }
  ],
  super_admin: [
    { to: '/', label: 'Dashboard', Icon: Squares2X2Icon, exact: true },
    { to: '/trainers', label: 'Trainers', Icon: UsersIcon },
    { to: '/sessions', label: 'Sessions', Icon: CalendarDaysIcon },
    { to: '/leaves', label: 'Leaves', Icon: DocumentTextIcon },
    { to: '/sequences', label: 'Sequences', Icon: QueueListIcon },
    { to: '/resources', label: 'Resources', Icon: BookOpenIcon }
  ]
};

// Merges NAV_BY_ROLE for every role the user holds, in precedence order.
// A path already present keeps its original position but takes on the
// higher-precedence role's label/icon.
export function buildNav(roles) {
  const merged = new Map();
  for (const role of ROLE_PRECEDENCE) {
    if (!roles.includes(role)) continue;
    for (const item of NAV_BY_ROLE[role]) {
      merged.set(item.to, item);
    }
  }
  return [...merged.values()];
}
