import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
import './workspace-modal.css';

export function Modal({title,onClose,children,compact=false,descriptionId}:{title:string;onClose:()=>void;children:ReactNode;compact?:boolean;descriptionId?:string}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const dialog=ref.current;
  dialog?.showModal();
  dialog?.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus();
  return ()=>dialog?.close();
 },[]);
 return <dialog ref={ref} className={compact?'rf-modal wb-confirmation':'rf-modal'} role={compact?'alertdialog':undefined} aria-label={title} aria-describedby={descriptionId} onCancel={event=>{event.preventDefault();onClose();}}><header><div>{!compact&&<small>CREATOR WORKSPACE</small>}<h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="关闭"><X size={20}/></button></header>{children}</dialog>;
}
