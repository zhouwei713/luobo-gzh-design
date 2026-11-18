import {Component,Suspense,type ReactNode} from 'react';

interface Props {children:ReactNode;onClose:()=>void}

export class LazyTool extends Component<Props,{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    const notice=(failed:boolean)=><div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4"><div className="rounded-xl bg-white p-6 text-gray-800 shadow-xl" role={failed?'alert':'status'}><p>{failed?'工具加载失败，请关闭后刷新页面重试。':'正在加载工具…'}</p><button className="mt-4 rounded-lg border px-4 py-2" onClick={this.props.onClose}>关闭</button></div></div>;
    return this.state.failed?notice(true):<Suspense fallback={notice(false)}>{this.props.children}</Suspense>;
  }
}
