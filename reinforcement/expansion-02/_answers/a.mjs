export function planDue(events,now,limit,perWorld) {
  if(!Number.isFinite(now)||!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(perWorld)||perWorld<1)throw new RangeError('Invalid policy');
  const candidates=events.filter(e=>e.dueAt<=now).sort((a,b)=>a.dueAt-b.dueAt||(a.id<b.id?-1:a.id>b.id?1:0));
  const counts=new Map(),selected=[];
  for(const event of candidates) {
    if(selected.length===limit)break;
    const count=counts.get(event.worldId)??0;
    if(count>=perWorld)continue;
    selected.push(event.id);counts.set(event.worldId,count+1);
  }
  return selected;
}
