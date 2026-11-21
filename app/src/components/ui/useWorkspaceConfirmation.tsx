import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {Modal} from './WorkspaceModal';

interface Confirmation {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
}

export function useWorkspaceConfirmation() {
  const descriptionId=useId();
  const [request,setRequest]=useState<Confirmation|null>(null);
  const pending=useRef<((accepted:boolean)=>void)|null>(null);
  const confirm=useCallback((options:Confirmation)=>{
    if(pending.current)return Promise.resolve(false);
    return new Promise<boolean>(resolve=>{
      pending.current=resolve;
      setRequest(options);
    });
  },[]);
  const close=(accepted:boolean)=>{
    const resolve=pending.current;
    pending.current=null;
    setRequest(null);
    resolve?.(accepted);
  };
  useEffect(()=>()=>{
    pending.current?.(false);
    pending.current=null;
  },[]);
  const confirmation=request&&<Modal title={request.title} compact descriptionId={descriptionId} onClose={()=>close(false)}>
    <div className="wb-confirmation-body">
      <p id={descriptionId}>{request.message}</p>
      <footer>
        <button type="button" data-dialog-initial-focus onClick={()=>close(false)}>{request.cancelLabel||'取消'}</button>
        <button type="button" className="wb-confirmation-primary" onClick={()=>close(true)}>{request.confirmLabel}</button>
      </footer>
    </div>
  </Modal>;
  return {confirm,confirmation};
}
