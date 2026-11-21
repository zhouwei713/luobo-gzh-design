import {useState} from 'react';
import {WorkbenchSettings} from '../components/workbench/WorkbenchSettings';
import {Link,useNavigate} from 'react-router-dom';
import {Clock3} from 'lucide-react';
import {WorkbenchShell} from '../components/workbench/WorkbenchShell';
import {getCurrentUser,logout} from '../services/authService';
import {usesRealAuth} from '../services/accessControl';
import './planned-feature.css';

const features={
 account:{title:'登录、注册与用户中心',description:'账号功能将在后续版本开放。现在无需登录即可使用文章排版、个人 API 设置和本地导出，正文自动保存在当前浏览器。'},
 articles:{title:'我的文章',description:'文章管理与跨设备保存将在账号功能完善后开放。当前正文会自动保存在本浏览器，也可以导出到本地。'},
 discovery:{title:'爆文发现',description:'优质文章发现与文章库将在后续版本开放。当前版本先把文章排版做好。'},
 topics:{title:'我的选题',description:'选题收藏、参考资料与创作笔记将在后续版本开放。现在可以先在排版页完成正文创作。'},
};

export default function PlannedFeatureView({feature}:{feature:keyof typeof features}){
 const [settings,setSettings]=useState(false);
 const navigate=useNavigate(),user=getCurrentUser(),item=features[feature];
 return <WorkbenchShell section={feature} toolbar={null} actions={null} userName={user?.email} realAuth={usesRealAuth()} draftState="saved" onLogin={()=>navigate('/login')} onLogout={()=>{void logout().then(()=>navigate('/'));}} onSettings={()=>setSettings(true)} onConsole={()=>navigate('/admin')} onHelp={()=>navigate('/')} onVideo={()=>navigate('/video-compare')}>
  <section className="wb-planned" aria-label={`${item.title}规划`}><Clock3 size={32}/><span className="wb-planned-status">后续实现</span><h2>{item.title}，敬请期待</h2><p>{item.description}</p><Link to="/">继续文章排版</Link></section>
  {settings&&<WorkbenchSettings onClose={()=>setSettings(false)}/>}
 </WorkbenchShell>;
}
