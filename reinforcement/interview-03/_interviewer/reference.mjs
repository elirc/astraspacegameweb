export function applyWorldEvent(snapshot,event) {
  if(event.worldId!==snapshot.worldId)return {status:'wrong-scope',snapshot};
  if(event.sequence<=snapshot.sequence)return {status:'ignored',snapshot};
  if(event.sequence>snapshot.sequence+1)return {status:'gap',snapshot};
  return {status:'applied',snapshot:{...snapshot,sequence:event.sequence,value:snapshot.value+event.delta}};
}
