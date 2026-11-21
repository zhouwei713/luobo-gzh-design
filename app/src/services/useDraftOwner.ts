import {useSyncExternalStore} from 'react';
import {DRAFT_OWNER_EVENT,getDraftOwner} from './draftScope.ts';
import {DEV_IDENTITY_ROLE_KEY,loadDevIdentityRole} from './accessControl';
import {phaseTwoEnabled} from './releaseScope';
function subscribe(listener:()=>void){
 const changed=(event:StorageEvent)=>{if(event.key===null||event.key==='auth_token'||event.key==='auth_user'||event.key===DEV_IDENTITY_ROLE_KEY)listener();};
 window.addEventListener('storage',changed);window.addEventListener(DRAFT_OWNER_EVENT,listener);
 return()=>{window.removeEventListener('storage',changed);window.removeEventListener(DRAFT_OWNER_EVENT,listener);};
}
export function useDraftOwner(){return useSyncExternalStore(subscribe,getDraftOwner,()=> 'guest');}

function readTopicOwner(){
 const owner=getDraftOwner();
 if(owner!=='guest'||!phaseTwoEnabled)return owner;
 try{return 'debug:'+loadDevIdentityRole();}catch{return 'guest';}
}
export function useTopicDraftOwner(){return useSyncExternalStore(subscribe,readTopicOwner,()=> 'guest');}
