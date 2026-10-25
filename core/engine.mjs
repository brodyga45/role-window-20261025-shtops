export class RoleWindow {
  constructor(store, {guildId = 'demo', roleId = 'unverified', graceMs = 900000, dryRun = true, now = Date.now} = {}) {
    if (!Number.isFinite(graceMs) || graceMs < 1000) throw new Error('A positive grace period is required');
    this.store = store;
    this.config = {guildId, roleId, graceMs, dryRun};
    this.now = now;
    this.state = store.load() || {version: 1, sequence: 0, timers: {}, audit: []};
    if (this.state.guildId && (this.state.guildId !== guildId || this.state.roleId !== roleId)) throw new Error('Use a separate database for another guild or role');
    Object.assign(this.state, {guildId, roleId});
    this.save();
    this.busy = false;
  }
  save() { this.store.save(this.state); }
  log(kind, memberId, detail = '') {
    this.state.audit.push({sequence: ++this.state.sequence, at: this.now(), kind, memberId, detail});
    this.state.audit = this.state.audit.slice(-1000);
  }
  observe(memberId, {hasRole, excluded = false, observedAt = this.now()} = {}) {
    const old = this.state.timers[memberId];
    if (!hasRole || excluded) {
      if (old) {
        delete this.state.timers[memberId];
        this.log(excluded ? 'excluded' : 'verified_or_left', memberId);
        this.save();
      }
      return;
    }
    if (old) return; // Repeated observations and restarts never restart a known timer.
    this.log('role_first_observed', memberId, 'Fresh grace; historic role age is not inferred from join time.');
    this.state.timers[memberId] = {memberId, generation: this.state.sequence, startedAt: observedAt, dueAt: observedAt + this.config.graceMs, status: 'waiting'};
    this.save();
  }
  async sweep(adapter) {
    if (this.busy) return {busy: true};
    this.busy = true;
    const outcomes = [];
    try {
      const due = Object.values(this.state.timers).filter(t => t.dueAt <= this.now() && !['unknown', 'blocked'].includes(t.status));
      for (const timer of due) {
        if (this.config.dryRun && timer.status === 'previewed') continue;
        let member;
        try { member = await adapter.fetchMember(timer.memberId); }
        catch {
          this.log('recheck_failed', timer.memberId, 'No moderation action attempted.');
          this.save();
          outcomes.push({memberId: timer.memberId, outcome: 'recheck_failed'});
          continue;
        }
        const current = this.state.timers[timer.memberId];
        if (!current || current.generation !== timer.generation || current.dueAt > this.now()) continue;
        if (!member || !member.hasRole || member.excluded) {
          this.observe(timer.memberId, {hasRole: false, excluded: !!member?.excluded});
          outcomes.push({memberId: timer.memberId, outcome: 'cancelled_after_recheck'});
          continue;
        }
        if (!member.kickable) {
          current.status = 'blocked';
          this.log('cannot_kick', timer.memberId, 'Check permissions and role hierarchy.');
          this.save();
          outcomes.push({memberId: timer.memberId, outcome: 'blocked'});
          continue;
        }
        if (this.config.dryRun) {
          current.status = 'previewed';
          this.log('would_kick', timer.memberId, 'Role rechecked; preview does not call kick.');
          this.save();
          outcomes.push({memberId: timer.memberId, outcome: 'would_kick'});
          continue;
        }
        // Persist uncertainty before the external request. A lost response must not trigger a blind replay.
        current.status = 'unknown';
        this.log('kick_requested', timer.memberId);
        this.save();
        try {
          await adapter.kick(timer.memberId, 'Unverified role grace period elapsed; role rechecked.');
          const latest = this.state.timers[timer.memberId];
          if (latest?.generation === timer.generation) delete this.state.timers[timer.memberId];
          this.log('kicked', timer.memberId);
          outcomes.push({memberId: timer.memberId, outcome: 'kicked'});
        } catch {
          this.log('kick_outcome_unknown', timer.memberId, 'Do not replay without reconciling membership and this request.');
          outcomes.push({memberId: timer.memberId, outcome: 'unknown'});
        }
        this.save();
      }
      return outcomes;
    } finally { this.busy = false; }
  }
  reviewOutcome(memberId, {member = null, startFreshGrace = false} = {}) {
    const timer = this.state.timers[memberId];
    if (!timer || !['unknown', 'blocked'].includes(timer.status)) return 'not_held';
    if (!member || !member.hasRole || member.excluded) {
      delete this.state.timers[memberId];
      this.log('review_resolved', memberId, 'Current member absent, verified or exempt. Prior request outcome is not reclassified.');
      this.save();
      return 'resolved';
    }
    if (!startFreshGrace) return 'still_held';
    delete this.state.timers[memberId];
    this.log('review_new_grace', memberId, 'Operator reviewed current membership and chose a new grace; this is not a retry of the unknown request.');
    this.observe(memberId, {hasRole: true});
    return 'new_grace';
  }
  renewAfterReconnect(memberId) {
    const timer = this.state.timers[memberId];
    if (!timer || timer.status === 'unknown') return false;
    delete this.state.timers[memberId];
    this.log('reconnect_new_grace', memberId, 'Observation was interrupted; a fresh grace is granted without claiming verification.');
    this.observe(memberId, {hasRole: true});
    return true;
  }
}
