import type {MouseEvent} from 'react';
import type {NavigateFunction} from 'react-router-dom';

export function guardNavigation(
  event: MouseEvent<HTMLAnchorElement>,
  check: (()=>boolean|Promise<boolean>)|undefined,
  navigate: NavigateFunction,
) {
  if (!check || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const result=check();
  if (typeof result==='boolean') {
    if (!result) event.preventDefault();
    return;
  }
  const path=event.currentTarget.getAttribute('href');
  event.preventDefault();
  void result.then(accepted=>{if(accepted&&path)navigate(path);});
}
