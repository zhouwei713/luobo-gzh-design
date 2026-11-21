import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {ArrowUpRight,Check,KeyRound,LogOut,ShieldCheck,UserRound} from 'lucide-react';
import {WorkbenchShell} from '../components/workbench/WorkbenchShell';
import {WorkbenchSettings} from '../components/workbench/WorkbenchSettings';
import {phaseTwoEnabled} from '../services/releaseScope';
import {changePassword,logout,refreshUser,type User} from '../services/authService';
import './account.css';
const roles={free:'普通用户',vip:'VIP用户',admin:'管理员'};
const createdText=(value?:string)=>value?new Date(value.includes('T')?value:value.replace(' ','T')+'Z').toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'暂无记录';
export default function AccountView(){
 const navigate=useNavigate();const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [settings,setSettings]=useState(false),[busy,setBusy]=useState(false),[oldPassword,setOldPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[confirm,setConfirm]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const value=await refreshUser();if(!value){navigate('/login',{replace:true,state:{from:'/account'}});return;}setUser(value);}catch(e){setError(e instanceof Error?e.message:'账号信息暂时不可用');}finally{setLoading(false);}},[navigate]);
 useEffect(()=>{let active=true;void refreshUser().then(value=>{if(!active)return;if(!value)navigate('/login',{replace:true,state:{from:'/account'}});else setUser(value);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'账号信息暂时不可用');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[navigate]);
 const signOut=async()=>{if(busy)return;setBusy(true);await logout();navigate('/login',{replace:true,state:{from:'/account'}});};
 const savePassword=async(event:FormEvent)=>{
  event.preventDefault();if(busy)return;setError('');setNotice('');
  if(newPassword!==confirm){setError('两次输入的新密码不一致');return;}
  if(newPassword.length<8||!/[A-Za-z]/.test(newPassword)||!/[0-9]/.test(newPassword)){setError('新密码至少8位，需同时包含字母和数字');return;}
  setBusy(true);try{await changePassword(oldPassword,newPassword);setOldPassword('');setNewPassword('');setConfirm('');setNotice('密码已更新，其他设备需要重新登录。');}catch(e){setError(e instanceof Error?e.message:'修改密码失败');}finally{setBusy(false);}
 };
 return <WorkbenchShell section="account" userName={user?.email} userRole={user?.role} realAuth draftState="saved" toolbar={null} actions={<Link className="account-button" to={phaseTwoEnabled?'/topics':'/articles'}>{phaseTwoEnabled?'我的选题':'我的文章'}<ArrowUpRight size={14}/></Link>} onLogin={()=>navigate('/login',{state:{from:'/account'}})} onLogout={()=>void signOut()} onSettings={()=>setSettings(true)} onConsole={()=>navigate('/admin')} onVideo={()=>navigate('/video-compare')} onHelp={()=>setNotice('文章管理后续开放，当前可在排版页编辑、导出并保存本机草稿。')}>
  <main className="account-content" aria-label="用户中心">{error&&<p className="account-error" role="alert">{error}</p>}{notice&&<p className="account-notice" role="status"><Check size={16}/>{notice}</p>}
   {loading?<div className="account-panel">正在读取账号信息…</div>:!user?<div className="account-panel"><h2>暂时无法读取账号</h2><button className="account-button" onClick={()=>void load()}>重新加载</button></div>:<div className="account-grid">
    <section className="account-panel account-profile"><span className="account-kicker">YOUR ACCOUNT</span><div className="account-profile-heading"><span className="account-avatar"><UserRound size={25}/></span><div><h2>个人信息</h2><p>{roles[user.role]}</p></div></div><dl><div><dt>邮箱账号</dt><dd>{user.email}</dd></div><div><dt>账号类型</dt><dd>{roles[user.role]}</dd></div><div><dt>注册时间</dt><dd>{createdText(user.created_at)}</dd></div></dl><div className="account-shortcuts"><Link to={phaseTwoEnabled?'/topics':'/articles'}>{phaseTwoEnabled?'我的选题':'我的文章'}<ArrowUpRight size={14}/></Link><Link to="/">回到文章排版<ArrowUpRight size={14}/></Link></div><p className="account-muted">账号功能仍在完善，文章管理后续开放；当前正文草稿保存在本浏览器。</p><button className="account-button account-signout" aria-label="退出登录" disabled={busy} onClick={()=>void signOut()}><LogOut size={15}/>退出登录</button></section>
    <section className="account-panel"><span className="account-kicker">ACCOUNT SECURITY</span><h2 className="account-security-heading"><KeyRound size={20}/>修改密码</h2><p className="account-muted">设置至少8位、包含字母和数字的密码。</p><form className="account-password-form" onSubmit={savePassword}><label htmlFor="account-current-password">当前密码</label><input id="account-current-password" type="password" required autoComplete="current-password" value={oldPassword} disabled={busy} onChange={e=>setOldPassword(e.target.value)}/><label htmlFor="account-new-password">新密码</label><input id="account-new-password" type="password" required minLength={8} autoComplete="new-password" value={newPassword} disabled={busy} onChange={e=>setNewPassword(e.target.value)}/><label htmlFor="account-confirm-password">确认新密码</label><input id="account-confirm-password" type="password" required minLength={8} autoComplete="new-password" value={confirm} disabled={busy} onChange={e=>setConfirm(e.target.value)}/><button className="account-password-submit" type="submit" disabled={busy}>{busy?'正在保存…':'更新密码'}</button></form><p className="account-muted account-security-note"><ShieldCheck size={15}/>修改后其他设备需重新登录，当前会话继续保留。</p></section>
   </div>}
  </main>{settings&&<WorkbenchSettings onClose={()=>setSettings(false)}/>}
 </WorkbenchShell>;
}
