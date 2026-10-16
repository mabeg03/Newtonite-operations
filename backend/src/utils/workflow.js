const transitions = {
  OPEN: ['IN_PROGRESS', 'BLOCKED', 'AWAITING_APPROVAL', 'RESOLVED'],
  IN_PROGRESS: ['OPEN', 'BLOCKED', 'AWAITING_APPROVAL', 'RESOLVED'],
  AWAITING_APPROVAL: ['IN_PROGRESS', 'RESOLVED'],
  BLOCKED: ['OPEN', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED'],
  RESOLVED: ['OPEN', 'CLOSED'],
  CLOSED: []
};

export function canTransition(from, to) {
  return from === to || Boolean(transitions[from]?.includes(to));
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const error = new Error(`Invalid status transition: ${from} → ${to}`);
    error.status = 422;
    throw error;
  }
}

export function canApprove(user) {
  return Boolean(user && ['ADMIN', 'LEAD'].includes(user.role));
}
