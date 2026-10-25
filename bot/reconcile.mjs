export function reconcileMembers(engine, members, policy) {
  if (!['fresh_grace', 'preserve_known'].includes(policy)) throw new Error('Unknown reconnect policy');
  const current = new Map(members.map(m => [m.id, m]));
  for (const timer of Object.values(engine.state.timers)) {
    const member = current.get(timer.memberId);
    if (!member || !member.hasRole || member.excluded) engine.observe(timer.memberId, {hasRole: false, excluded: !!member?.excluded});
    else if (policy === 'fresh_grace') engine.renewAfterReconnect(timer.memberId);
  }
  for (const member of members) engine.observe(member.id, member);
}
