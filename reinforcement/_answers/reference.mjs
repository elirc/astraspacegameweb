export function initialRefresh() {return {inFlight:false,dirty:false,disposed:false,starts:0};}
export function stepRefresh(state,event) {
  if (state.disposed) return state;
  if (event.type === 'dispose') return {...state,inFlight:false,dirty:false,disposed:true};
  if (event.type === 'hint') return state.inFlight?{...state,dirty:true}:{...state,inFlight:true,dirty:false,starts:state.starts+1};
  if (event.type === 'settled' && state.inFlight) return state.dirty?{...state,dirty:false,starts:state.starts+1}:{...state,inFlight:false};
  return state;
}
