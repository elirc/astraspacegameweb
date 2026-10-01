export function freshness({now,heartbeatAt,oldestDueAt,maxHeartbeatAgeMs,maxBacklogAgeMs}) {
  if(!Number.isFinite(now)||!Number.isFinite(maxHeartbeatAgeMs)||maxHeartbeatAgeMs<0||!Number.isFinite(maxBacklogAgeMs)||maxBacklogAgeMs<0||[heartbeatAt,oldestDueAt].some(t=>t!==null&&!Number.isFinite(t)))throw new RangeError('Invalid telemetry');
  const heartbeatAgeMs=heartbeatAt===null?null:now-heartbeatAt;
  const backlogAgeMs=oldestDueAt===null?null:Math.max(0,now-oldestDueAt);
  const state=heartbeatAgeMs===null?'unknown':heartbeatAgeMs<0?'clock-skew':heartbeatAgeMs>maxHeartbeatAgeMs?'stalled':backlogAgeMs!==null&&backlogAgeMs>maxBacklogAgeMs?'backlogged':'healthy';
  return {state,heartbeatAgeMs,backlogAgeMs};
}
