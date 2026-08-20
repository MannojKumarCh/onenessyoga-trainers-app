export function formatRole(role) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
