import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Bookmark, Check, CircleHelp, FileText, FolderOpen, LogOut, Maximize2, Menu, Minimize2, MonitorPlay, PenTool, Radar, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { HeaderMenu } from '../ui/HeaderMenu';
import {AccountEntry} from './AccountEntry';
import {guardNavigation} from './guardNavigation';
import './workbench.css';
import {accountsEnabled,diagnosticsEnabled,phaseTwoEnabled} from '../../services/releaseScope';

interface WorkbenchShellProps {
  children: ReactNode;
  toolbar: ReactNode;
  actions: ReactNode;
  userName?: string;
  userRole?: string;
  realAuth: boolean;
  debugIdentity?: boolean;
  draftState: 'saving' | 'saved' | 'error';
  onLogin: () => void;
  onLogout: () => void;
  onSettings: () => void;
  onConsole: () => void;
  onHelp: () => void;
  onVideo: () => void;
  section?: 'typesetter' | 'discovery' | 'topics' | 'account' | 'articles';
  onLeave?: () => boolean|Promise<boolean>;
}

export function WorkbenchShell({ children, toolbar, actions, userName, realAuth, debugIdentity = false, draftState, onLogin, onLogout, onSettings, onConsole, onHelp, onVideo, section = 'typesetter', onLeave }: WorkbenchShellProps) {

  const navigate = useNavigate();
  const title = section === 'articles' ? '我的文章' : section === 'account' ? '用户中心' : section === 'discovery' ? '爆文发现' : section === 'topics' ? '我的选题' : '文章排版';
  const planned = (!accountsEnabled && section==='account') || (!phaseTwoEnabled && ['articles','discovery','topics'].includes(section));
  const heading = planned ? '更多创作能力，后续实现。' : section === 'articles' ? '写过的每一篇，都有自己的位置。' : section === 'account' ? '你的账号，你的创作空间。' : section === 'discovery' ? '好选题，先从值得读的文章开始。' : section === 'topics' ? '留住灵感，写出自己的角度。' : '把内容写好，把样子交给这里。';
  const subtitle = planned ? '当前先专注文章排版，更多功能正在准备中。' : section === 'articles' ? '保存正文，随时接着写。' : section === 'account' ? '查看个人信息，管理账号与登录安全。' : section === 'discovery' ? '从文章库里寻找灵感，留下你的下一篇。' : section === 'topics' ? '参考有出处，观点有自己的来由。' : '专注写作，实时预览，复制到公众号。';
  const guard = (event: MouseEvent<HTMLAnchorElement>) => guardNavigation(event,onLeave,navigate);
  const go = async (path: string) => { if (!onLeave || await onLeave()) navigate(path); };
  const [focusMode, setFocusMode] = useState(false);
  const [focusBusy, setFocusBusy] = useState(false);
  const focusRequestedRef = useRef(false);
  const ownsFullscreenRef = useRef(false);
  const leaveFocus = useCallback(async () => {
    focusRequestedRef.current = false;
    if (ownsFullscreenRef.current && document.fullscreenElement === document.documentElement) {
      try { await document.exitFullscreen(); }
      catch { if (document.fullscreenElement === document.documentElement) { focusRequestedRef.current = true; return; } }
    }
    setFocusMode(false);
  }, []);
  const enterFocus = async () => {
    focusRequestedRef.current = true;
    setFocusMode(true);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      setFocusBusy(true);
      ownsFullscreenRef.current = true;
      try {
        // Keep sibling export, AI and notification layers inside the native fullscreen root.
        await document.documentElement.requestFullscreen();
        if (!focusRequestedRef.current && document.fullscreenElement === document.documentElement) await document.exitFullscreen();
      } catch {
        ownsFullscreenRef.current = false;
        // The page-level focus layout also works when native fullscreen is unavailable.
      } finally { setFocusBusy(false); }
    }
  };
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (ownsFullscreenRef.current && document.fullscreenElement !== document.documentElement) {
        ownsFullscreenRef.current = false;
        focusRequestedRef.current = false;
        setFocusMode(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !focusRequestedRef.current) return;
      if (document.querySelector('dialog[open], .wb-control-popover, .wb-actions [aria-expanded="true"]')) return;
      void leaveFocus();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleEscape);
      focusRequestedRef.current = false;
      if (ownsFullscreenRef.current && document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [leaveFocus]);
  const draftLabel = draftState === 'saving' ? '正在保存草稿' : draftState === 'saved' ? '草稿已保存到本机' : '草稿保存失败';
  return (
    <div className={`workbench-shell${focusMode ? ' is-focus-mode' : ''}`}>
      <aside className="wb-sidebar" aria-label="工作台导航">
        <Link className="wb-brand" to="/" onClick={guard} aria-label="公众号工作台首页"><span className="wb-brand-mark"><PenTool size={21} /></span><span><strong>公众号工作台</strong><small>CREATOR WORKSPACE</small></span></Link>
        <p className="wb-nav-label">创作空间</p>
        <Link to="/" onClick={guard} className={`wb-nav-item${section === 'typesetter' ? ' is-active' : ''}`} aria-current={section === 'typesetter' ? 'page' : undefined}><FileText size={18} /><span>文章排版</span></Link>
        <Link to="/articles" onClick={guard} className={`wb-nav-item${section === 'articles' ? ' is-active' : ''}`} aria-current={section === 'articles' ? 'page' : undefined}><FolderOpen size={18}/><span>我的文章</span>{!phaseTwoEnabled && <small className="wb-tag">后续实现</small>}</Link>
        <p className="wb-nav-label wb-nav-section">选题与灵感</p>
        <Link to="/discovery" onClick={guard} className={`wb-nav-item${section === 'discovery' ? ' is-active' : ''}`} aria-current={section === 'discovery' ? 'page' : undefined}><Radar size={18} /><span>爆文发现</span><small className={phaseTwoEnabled?"wb-tag green":"wb-tag"}>{phaseTwoEnabled?'文章库':'后续实现'}</small></Link>
        <Link to="/topics" onClick={guard} className={`wb-nav-item${section === 'topics' ? ' is-active' : ''}`} aria-current={section === 'topics' ? 'page' : undefined}><Bookmark size={18} /><span>我的选题</span>{!phaseTwoEnabled && <small className="wb-tag">后续实现</small>}</Link>
        <p className="wb-nav-label wb-nav-section">更多工具</p>
        <button className="wb-nav-item" onClick={onVideo}><MonitorPlay size={18} /><span>视频对比</span></button>
        <div className="wb-sidebar-bottom">
          <div className="wb-phase"><small>你的创作工作台</small><strong>{phaseTwoEnabled ? '灵感与文章，在一起。' : '专注写作，轻松排版。'}</strong><p>{phaseTwoEnabled ? <>发现值得研究的内容，<br />留下自己的观点与素材。</> : <>写好正文，调整样式，<br />复制到公众号。</>}</p><span className="wb-phase-line"></span><footer><span>{phaseTwoEnabled ? '发现 · 选题 · 排版' : '写作 · 排版 · 导出'}</span></footer></div>
          <button className="wb-nav-item" onClick={onSettings} aria-label="工作台设置"><Settings size={18} /><span>工作台设置</span></button>
          {diagnosticsEnabled && <button className="wb-nav-item" onClick={onConsole}><CircleHelp size={18} /><span>配置与诊断</span></button>}
          <AccountEntry userName={userName} realAuth={realAuth} debugIdentity={debugIdentity} active={section === "account"} onLogin={onLogin} onLogout={onLogout} onNavigate={guard} />
        </div>
      </aside>
      <div className="wb-content">
        <header className="wb-topbar"><div className="wb-breadcrumb"><span className="wb-mobile-brand"><PenTool size={18} />公众号工作台</span><span className="wb-desktop-crumb">创作空间</span><span className="wb-divider">/</span><strong>{title}</strong></div><div className="wb-top-tools"><button onClick={onHelp}><BookOpen size={15} /><span>使用指南</span></button><button className="wb-mobile-settings" onClick={onSettings} aria-label="工作台设置"><Settings size={18} /></button><div className="wb-mobile-navigation"><HeaderMenu label="导航" icon={<Menu size={16} />} buttonClassName="wb-mobile-menu-button" items={[
          { key: 'video', label: '视频对比', icon: <MonitorPlay size={15} className="mr-2" />, onSelect: onVideo },
          ...(diagnosticsEnabled ? [{ key: 'console', label: '配置与诊断', icon: <Settings size={15} className="mr-2" />, onSelect: onConsole }] : []),
          { key: 'typesetter', label: '文章排版', icon: <FileText size={15} className="mr-2" />, onSelect: () => go('/') },
          { key: 'articles', label: phaseTwoEnabled?'我的文章':'我的文章 · 后续实现', icon: <FolderOpen size={15} className="mr-2" />, onSelect: () => go('/articles') },
          { key: 'discovery', label: phaseTwoEnabled?'爆文发现':'爆文发现 · 后续实现', icon: <Radar size={15} className="mr-2" />, onSelect: () => go('/discovery') },
          { key: 'topics', label: phaseTwoEnabled?'我的选题':'我的选题 · 后续实现', icon: <Bookmark size={15} className="mr-2" />, onSelect: () => go('/topics') },
          ...(accountsEnabled && userName && !debugIdentity ? [{ key: 'account', label: '用户中心', icon: <PenTool size={15} className="mr-2" />, onSelect: () => go('/account') }, { key: 'logout', label: '退出登录', icon: <LogOut size={15} className="mr-2" />, onSelect: onLogout }] : []),
        ]} /></div>{realAuth && (!userName || debugIdentity) && <button className="wb-login" onClick={onLogin}>{accountsEnabled?'登录 / 注册':'登录 / 注册 · 后续开放'}</button>}{accountsEnabled && userName && !debugIdentity ? <Link className="wb-top-role" to="/account" onClick={guard} aria-label="用户中心">{userName}</Link> : <span className="wb-top-role">{userName || (realAuth ? '访客' : '本地模式')}</span>}</div></header>
        <div className="wb-workspace">
          <div className="wb-heading"><div><p className="wb-eyebrow">WRITE WITH CLARITY</p><h1>{heading}</h1><p className="wb-subtitle">{subtitle}</p></div><div className="wb-heading-right">{section === 'typesetter' && <span className={`wb-draft-state ${draftState === 'error' ? 'is-error' : ''}`} role="status">{draftState === 'saved' ? <Check size={12} /> : <span className="wb-status-dot"></span>}{draftLabel}</span>}<div className="wb-actions">{actions}{focusMode && <button className="wb-focus-settings" onClick={onSettings} aria-label="工作台设置" title="工作台设置"><Settings size={15} /></button>}{section === 'typesetter' && <button className="wb-focus-toggle" onClick={() => void (focusMode ? leaveFocus() : enterFocus())} disabled={focusBusy} aria-label={focusMode ? '退出专注全屏' : '进入专注全屏'} aria-pressed={focusMode} title={focusMode ? '退出专注全屏（Esc）' : '收起外围界面，进入专注全屏'}>{focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}<span>{focusMode ? '退出全屏' : '专注全屏'}</span>{focusMode && <kbd>Esc</kbd>}</button>}</div></div></div>
          {toolbar && <div className="wb-toolbar" aria-label={section === 'typesetter' ? '文章外观设置' : '筛选与查询'}>{toolbar}</div>}
          {children}
          {phaseTwoEnabled && section === 'typesetter' && <div className="wb-next"><span><strong>下一篇，从值得读的文章开始。</strong></span><Link to="/discovery" onClick={guard}>前往爆文文章库 <ArrowRight size={13} /></Link></div>}
        </div>
      </div>
    </div>
  );
}
