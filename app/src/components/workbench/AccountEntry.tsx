import {accountsEnabled} from '../../services/releaseScope';
import {Link} from 'react-router-dom';
import {ArrowRight,ChevronRight,LogOut,UserRound} from 'lucide-react';
import type {MouseEventHandler} from 'react';
export function AccountEntry({userName,realAuth,debugIdentity,active,onLogin,onLogout,onNavigate}:{userName?:string;realAuth:boolean;debugIdentity:boolean;active:boolean;onLogin:()=>void;onLogout:()=>void;onNavigate:MouseEventHandler<HTMLAnchorElement>}){
 if(!accountsEnabled)return <div className="wb-account"><Link className="wb-account-main" to="/login" onClick={onNavigate}><span className="wb-avatar"><UserRound size={17}/></span><span><strong>登录 / 注册</strong><small>后续开放 · 当前无需登录</small></span><ChevronRight size={14}/></Link></div>;
 return <div className="wb-account">{userName&&!debugIdentity?<><Link className="wb-account-main" to="/account" onClick={onNavigate} aria-label="用户中心" aria-current={active?'page':undefined}><span className="wb-avatar">{userName.slice(0,1).toUpperCase()}</span><span><strong>用户中心</strong><small>{userName}</small></span><ChevronRight size={14}/></Link><button onClick={onLogout} aria-label="退出登录" title="退出登录"><LogOut size={16}/></button></>:realAuth?<button className="wb-account-login" onClick={onLogin}><span className="wb-avatar"><UserRound size={17}/></span><span><strong>登录 / 注册</strong><small>{debugIdentity?'本地调试 · 登录真实账号':'登录后进入用户中心'}</small></span><ArrowRight size={15}/></button>:<><span className="wb-avatar"><UserRound size={16}/></span><div><strong>本地工作台</strong><small>当前浏览器中的创作空间</small></div></>}</div>;
}
