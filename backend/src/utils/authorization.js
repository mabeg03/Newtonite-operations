export function canAccessWorkItem(user, item, teamIds = []) {
  if (!user || !item) return false;
  if (user.role === 'ADMIN') return true;
  return teamIds.map(Number).includes(Number(item.team_id));
}


export function canManageWorkItem(user, item, teamIds = []) {
  if (!canAccessWorkItem(user, item, teamIds)) return false;

  return (
    user.role === 'ADMIN' ||
    user.role === 'MANAGER' ||
    (
      user.role === 'LEAD' &&
      teamIds.map(Number).includes(Number(item.team_id))
    ) ||
    Number(item.created_by) === Number(user.id)
  );
}

