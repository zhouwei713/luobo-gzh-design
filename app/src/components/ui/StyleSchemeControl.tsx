import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  LayoutGrid,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  TextCursorInput,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { STYLE_SCHEMES, type StyleScheme } from '../../core/styleScheme';

interface StyleSchemeControlProps {
  activeSchemeId?: string;
  customSchemes: StyleScheme[];
  editingSchemeId?: string | null;
  editingDirty?: boolean;
  onApply: (scheme: StyleScheme) => void;
  onCreate: (name: string) => boolean;
  onRename: (id:string,name:string) => boolean;
  onEdit: (scheme: StyleScheme) => void;
  onEditFeatured: (scheme: StyleScheme) => void;
  onDuplicate: (scheme: StyleScheme) => void;
  onDelete: (schemeId: string) => void;
  onMove: (schemeId: string, direction: -1 | 1) => void;
  onSaveEditing: () => void;
  onSaveAs: (name: string) => boolean;
  onResetEditing: () => void;
  onImport: (raw: string) => void;
  onExport: () => void;
}

interface SchemeCardProps {
  scheme: StyleScheme;
  selected: boolean;
  editing: boolean;
  actions: ReactNode;
  onApply: (scheme: StyleScheme) => void;
}

function SchemePreview({ scheme }: { scheme: StyleScheme }) {
  const { paper, ink, accent, soft } = scheme.preview;

  return (
    <div
      className="relative h-[72px] overflow-hidden rounded-lg border border-black/5 p-2.5"
      style={{ background: paper, color: ink }}
    >
      <div className="mb-2 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: soft }} />
        <span className="h-1.5 w-1.5 rounded-full bg-black/10" />
      </div>
      <div className="mb-2 flex items-end gap-1.5">
        <span className="text-[12px] font-black leading-none" style={{ color: accent }}>01</span>
        <span className="h-2 w-16 rounded-sm" style={{ background: ink, opacity: 0.88 }} />
      </div>
      <div className="grid grid-cols-[3px_1fr] gap-2">
        <span className="rounded-full" style={{ background: accent }} />
        <div className="space-y-1.5 py-0.5">
          <span className="block h-1 w-full rounded-full" style={{ background: ink, opacity: 0.16 }} />
          <span className="block h-1 w-4/5 rounded-full" style={{ background: ink, opacity: 0.12 }} />
          <span className="block h-3 w-3/5 rounded-sm" style={{ background: soft }} />
        </div>
      </div>
      <span
        className="absolute bottom-0 right-0 h-7 w-7 rounded-tl-full opacity-50"
        style={{ background: soft }}
      />
    </div>
  );
}

function SchemeCard({ scheme, selected, editing, actions, onApply }: SchemeCardProps) {
  return (
    <div className={`group relative rounded-xl border p-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${
      editing
        ? 'border-amber-300 bg-amber-50/40 ring-1 ring-amber-100'
        : selected
        ? 'border-emerald-400 bg-emerald-50/40 ring-1 ring-emerald-100'
        : 'border-gray-200 bg-white hover:border-gray-300'
    }`}>
      <button
        type="button"
        onClick={() => onApply(scheme)}
        className="block w-full text-left"
        aria-label={`应用方案 ${scheme.name}`}
        aria-pressed={selected}
      >
        <SchemePreview scheme={scheme} />
        <div className="px-1 pt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-800">{scheme.name}</span>
            {editing ? (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">编辑中</span>
            ) : selected && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
          <p className="mt-1 min-h-8 text-[10px] leading-4 text-gray-400">{scheme.description}</p>
        </div>
      </button>
      <div className="mt-1 flex h-6 items-center justify-end gap-1 border-t border-gray-100 pt-1">
        {actions}
      </div>
    </div>
  );
}

const actionButtonClass = 'flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30';

export function StyleSchemeControl({
  activeSchemeId,
  customSchemes,
  editingSchemeId,
  editingDirty = false,
  onApply,
  onCreate,
  onRename,
  onEdit,
  onEditFeatured,
  onDuplicate,
  onDelete,
  onMove,
  onSaveEditing,
  onSaveAs,
  onResetEditing,
  onImport,
  onExport,
}: StyleSchemeControlProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'featured' | 'mine'>('featured');
  const [renaming,setRenaming]=useState<{id:string;name:string}|null>(null);
  const [creating, setCreating] = useState(false);
  const [schemeName, setSchemeName] = useState('');
  const [savingAs, setSavingAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [fileError,setFileError]=useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const allSchemes = [...STYLE_SCHEMES, ...customSchemes];
  const activeScheme = allSchemes.find((scheme) => scheme.id === activeSchemeId);
  const editingScheme = customSchemes.find((scheme) => scheme.id === editingSchemeId);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);event.stopPropagation();}};

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown',handleKeyDown);
    return () => {document.removeEventListener('mousedown', handlePointerDown);document.removeEventListener('keydown',handleKeyDown);};
  }, [open]);

  const handleCreate = () => {
    const name = schemeName.trim();
    if (!name) return;
    if(!onCreate(name))return;
    setSchemeName('');
    setCreating(false);
    setTab('mine');
  };

  const handleSaveAs = () => {
    const name = saveAsName.trim();
    if (!name) return;
    if(!onSaveAs(name))return;
    setSaveAsName('');
    setSavingAs(false);
  };

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    try {
      if(file.size>1024*1024){setFileError('方案文件不能超过1MB。');return;}
      setFileError('');onImport(await file.text());setTab('mine');
    } catch {setFileError('无法读取文件，请重新选择JSON方案文件。');}
    finally {if (importRef.current) importRef.current.value = '';}
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold shadow-sm transition-colors ${
          activeScheme
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
        }`}
        aria-label="排版方案"
        aria-expanded={open}
        title={activeScheme ? `当前方案：${activeScheme.name}` : '当前为自定义组合'}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        排版方案
      </button>

      {open && (
        <div className="wb-control-popover absolute left-0 top-9 z-50 w-[460px] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl shadow-gray-900/15" aria-label="排版方案库">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                排版方案库
              </div>
              <div className="mt-1 text-[11px] leading-4 text-gray-400">无需登录，仅保存在当前浏览器；清理站点数据前请导出备份。</div>
            </div>
            <button
              type="button"
              onClick={() => setCreating((current) => !current)}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Plus className="h-3 w-3" />
              保存当前
            </button>
          </div>

          {fileError&&<p role="alert" className="mb-3 text-xs text-rose-600">{fileError}</p>}
          {renaming&&<form className="mb-3 flex gap-2" onSubmit={event=>{event.preventDefault();if(onRename(renaming.id,renaming.name))setRenaming(null);}}><input aria-label="新的预设名称" autoFocus maxLength={40} value={renaming.name} onChange={event=>setRenaming({...renaming,name:event.target.value})} className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"/><button type="submit" disabled={!renaming.name.trim()} className="text-xs text-emerald-700">确认改名</button><button type="button" onClick={()=>setRenaming(null)} className="text-xs">取消</button></form>}

          {creating && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-2">
              <input
                autoFocus
                value={schemeName}
                onChange={(event) => setSchemeName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCreate();
                  if (event.key === 'Escape') setCreating(false);
                }}
                placeholder="输入方案名称"
                maxLength={40}
                className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 outline-none focus:border-emerald-400"
                aria-label="方案名称"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!schemeName.trim()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                创建
              </button>
            </div>
          )}

          {editingScheme && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                    <Pencil className="h-3.5 w-3.5" />
                    正在编辑：{editingScheme.name}
                  </div>
                  <div className="mt-1 text-[10px] text-amber-700">
                    {editingDirty ? '有未保存修改，保存后会更新本地方案。' : '已保存，可继续调整排版配置。'}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onSaveEditing}
                    disabled={!editingDirty}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[10px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Save className="h-3 w-3" />
                    保存修改
                  </button>
                  <button
                    type="button"
                    onClick={() => setSavingAs((current) => !current)}
                    className="rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    另存为
                  </button>
                  <button
                    type="button"
                    onClick={onResetEditing}
                    disabled={!editingDirty}
                    className="flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RotateCcw className="h-3 w-3" />
                    恢复
                  </button>
                </div>
              </div>
              {savingAs && (
                <div className="mt-2 flex items-center gap-2 border-t border-amber-200/70 pt-2">
                  <input
                    autoFocus
                    value={saveAsName}
                    onChange={(event) => setSaveAsName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleSaveAs();
                      if (event.key === 'Escape') setSavingAs(false);
                    }}
                    placeholder="输入新方案名称"
                    maxLength={40}
                    className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 outline-none focus:border-amber-400"
                    aria-label="另存为方案名称"
                  />
                  <button
                    type="button"
                    onClick={handleSaveAs}
                    disabled={!saveAsName.trim()}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    创建
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mb-3 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setTab('featured')}
                className={`border-b-2 pb-2 text-xs font-semibold ${tab === 'featured' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-400'}`}
              >
                精选方案
              </button>
              <button
                type="button"
                onClick={() => setTab('mine')}
                className={`border-b-2 pb-2 text-xs font-semibold ${tab === 'mine' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-400'}`}
              >
                我的方案 {customSchemes.length}
              </button>
            </div>

            {tab === 'mine' && (
              <div className="flex items-center gap-1 pb-1.5">
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => void handleImportFile(event.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => importRef.current?.click()}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <Upload className="h-3 w-3" />
                  导入
                </button>
                <button
                  type="button"
                  onClick={onExport}
                  disabled={customSchemes.length === 0}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Download className="h-3 w-3" />
                  导出
                </button>
              </div>
            )}
          </div>

          {tab === 'featured' ? (
            <div className="grid max-h-[560px] grid-cols-2 gap-3 overflow-y-auto pr-0.5">
              {STYLE_SCHEMES.map((scheme) => (
                <SchemeCard
                  key={scheme.id}
                  scheme={scheme}
                  selected={scheme.id === activeSchemeId}
                  editing={false}
                  onApply={onApply}
                  actions={(
                    <button
                      type="button"
                      onClick={() => {
                        onEditFeatured(scheme);
                        setTab('mine');
                      }}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label={`复制并编辑方案 ${scheme.name}`}
                    >
                      <Pencil className="h-3 w-3" />
                      复制并编辑
                    </button>
                  )}
                />
              ))}
            </div>
          ) : customSchemes.length > 0 ? (
            <div className="grid max-h-[560px] grid-cols-2 gap-3 overflow-y-auto pr-0.5">
              {customSchemes.map((scheme, index) => (
                <SchemeCard
                  key={scheme.id}
                  scheme={scheme}
                  selected={scheme.id === activeSchemeId}
                  editing={scheme.id === editingSchemeId}
                  onApply={onApply}
                  actions={(
                    <>
                      <button type="button" onClick={() => onMove(scheme.id, -1)} disabled={index === 0} className={actionButtonClass} aria-label={`前移方案 ${scheme.name}`}>
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => onMove(scheme.id, 1)} disabled={index === customSchemes.length - 1} className={actionButtonClass} aria-label={`后移方案 ${scheme.name}`}>
                        <ChevronRight className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => onEdit(scheme)} className={actionButtonClass} aria-label={`编辑方案 ${scheme.name}`}>
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={()=>setRenaming({id:scheme.id,name:scheme.name})} className={actionButtonClass} aria-label={`重命名方案 ${scheme.name}`} title="重命名"><TextCursorInput className="h-3 w-3" /></button>
                      <button type="button" onClick={() => onDuplicate(scheme)} className={actionButtonClass} aria-label={`复制方案 ${scheme.name}`}>
                        <Copy className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => setPendingDeleteId(scheme.id)} className={`${actionButtonClass} hover:bg-rose-50 hover:text-rose-600`} aria-label={`删除方案 ${scheme.name}`}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 text-center">
              <LayoutGrid className="h-7 w-7 text-gray-300" />
              <p className="mt-2 text-xs font-semibold text-gray-500">还没有个人方案</p>
              <p className="mt-1 text-[10px] text-gray-400">保存当前组合，或从精选方案复制一份</p>
            </div>
          )}

          {pendingDeleteId && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
              <span className="text-[11px] font-medium text-rose-700">确认删除这个本地方案？</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPendingDeleteId(null)} className="text-[11px] text-gray-500">取消</button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(pendingDeleteId);
                    setPendingDeleteId(null);
                  }}
                  className="rounded bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white"
                >
                  确认删除
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 border-t border-gray-100 pt-3 text-[10px] leading-4 text-gray-400">
            个人方案保存在当前浏览器，JSON 可用于备份或迁移到其他设备。
          </div>
        </div>
      )}
    </div>
  );
}
