import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import {lazy,Suspense} from 'react';
import TypesetterView from './views/TypesetterView';
import LoginView from './views/LoginView';
import AccountView from './views/AccountView';
import PlannedFeatureView from './views/PlannedFeatureView';
import FeishuCallbackView from './views/FeishuCallbackView';
import {accountsEnabled,diagnosticsEnabled,phaseTwoEnabled} from './services/releaseScope';
import {useDraftOwner} from './services/useDraftOwner';

const VideoCompareView = lazy(() => import('./views/VideoCompareView'));
const ResearchView = phaseTwoEnabled ? lazy(() => import('./features/discovery/ResearchView')) : null;
const ArticlesView = phaseTwoEnabled ? lazy(() => import('./features/articles/ArticlesView')) : null;
const AdminView = diagnosticsEnabled ? lazy(() => import('./views/AdminView')) : null;

export default function App() {
  const owner=useDraftOwner();
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TypesetterView key={owner} draftOwner={owner}/>} />
        {ResearchView && <>
          <Route path="/discovery" element={<Suspense fallback={null}><ResearchView key={owner} mode="discovery" /></Suspense>} />
          <Route path="/topics" element={<Suspense fallback={null}><ResearchView key={owner} mode="topics" /></Suspense>} />
          <Route path="/topics/:id" element={<Suspense fallback={null}><ResearchView key={owner} mode="topics" /></Suspense>} />
        </>}
        {!ResearchView && <>
          <Route path="/discovery" element={<PlannedFeatureView feature="discovery" />} />
          <Route path="/topics" element={<PlannedFeatureView feature="topics" />} />
          <Route path="/topics/:id" element={<PlannedFeatureView feature="topics" />} />
        </>}
        <Route path="/login" element={accountsEnabled ? <LoginView /> : <PlannedFeatureView feature="account" />} />
        <Route path="/register" element={accountsEnabled ? <Navigate to="/login" replace /> : <PlannedFeatureView feature="account" />} />
        <Route path="/account" element={accountsEnabled ? <AccountView key={owner}/> : <PlannedFeatureView feature="account" />} />
        <Route path="/articles" element={ArticlesView ? <Suspense fallback={null}><ArticlesView key={owner}/></Suspense> : <PlannedFeatureView feature="articles" />} />
        <Route path="/admin" element={AdminView ? <Suspense fallback={null}><AdminView /></Suspense> : <Navigate to="/" replace />} />
        <Route path="/feishu/callback" element={accountsEnabled ? <FeishuCallbackView /> : <PlannedFeatureView feature="account" />} />
        <Route path="/video-compare" element={<Suspense fallback={<p role="status">正在加载视频对比…</p>}><VideoCompareView /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
