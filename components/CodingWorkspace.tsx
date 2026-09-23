// components/CodingWorkspace.tsx
'use client';

import React, { useState } from 'react';
import { CodeFile } from '@/types/chat';
import CodeViewer from './CodeViewer';
import LivePreview from './LivePreview';
import DiffModal from './DiffModal';
import { buildPreviewDocument } from '@/lib/codeExtractor';
import { downloadFilesAsZip } from '@/lib/zipExporter';

interface CodingWorkspaceProps {
  files: CodeFile[];
  onUpdateFile: (fileId: string, updatedContent: string) => void;
  onClose: () => void;
}

export default function CodingWorkspace({ files, onUpdateFile, onClose }: CodingWorkspaceProps) {
  const [activeFileId, setActiveFileId] = useState<string>(files[0]?.id || '');
  const [viewTab, setViewTab] = useState<'code' | 'preview'>('code');
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  // ファイルが更新された際に activeFileId を追従
  const activeFile = files.find((f) => f.id === activeFileId) || files[0];
  const previewDoc = buildPreviewDocument(files);
  const hasPreview = !!previewDoc;

  const handleDownloadZip = async () => {
    if (files.length === 0) return;
    setIsZipping(true);
    try {
      await downloadFilesAsZip(files, 'fulemon-agent-project.zip');
    } catch (err) {
      console.error('ZIP生成に失敗しました:', err);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700 text-slate-100 shadow-2xl">
      {/* ワークスペース最上部ヘッダー */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white shadow-xs">
            🛠️
          </span>
          <span className="font-bold text-sm tracking-wide text-indigo-200">
            コードワークスペース
          </span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 text-xs font-mono">
            {files.length} ファイル
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* ZIP ダウンロード */}
          <button
            type="button"
            disabled={files.length === 0 || isZipping}
            onClick={handleDownloadZip}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-white transition shadow-sm"
            title="生成された全ファイルをZIPで保存"
          >
            <span>📦</span>
            <span>{isZipping ? '圧縮中...' : 'ZIP一括保存'}</span>
          </button>

          {/* Diff比較モーダル起動 */}
          <button
            type="button"
            onClick={() => setIsDiffOpen(true)}
            className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
            title="コード差分を比較"
          >
            ⚖️ 差分比較
          </button>

          {/* ワークスペース閉じる */}
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white transition"
            title="ワークスペースを閉じる"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ファイルタブバー & 表示切替 */}
      <div className="flex items-center justify-between bg-slate-950/70 border-b border-slate-800/80 px-2 overflow-x-auto text-xs scrollbar-thin">
        {/* ファイルリストタブ */}
        <div className="flex items-center gap-1 py-1">
          {files.map((file) => {
            const isActive = activeFile?.id === file.id && viewTab === 'code';
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => {
                  setActiveFileId(file.id);
                  setViewTab('code');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md font-mono transition text-xs border-b-2 ${
                  isActive
                    ? 'bg-slate-900 text-blue-300 border-indigo-500 font-semibold'
                    : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200 border-transparent'
                }`}
              >
                <span>📄</span>
                <span>{file.name}</span>
              </button>
            );
          })}
          {files.length === 0 && (
            <span className="text-slate-500 italic py-1 px-2">まだコードがありません</span>
          )}
        </div>

        {/* ライブプレビュー切替タブ */}
        {hasPreview && (
          <div className="flex items-center py-1 pl-2 shrink-0">
            <button
              type="button"
              onClick={() => setViewTab(viewTab === 'preview' ? 'code' : 'preview')}
              className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition ${
                viewTab === 'preview'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-950/50 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-900/50'
              }`}
            >
              <span>🌐</span>
              <span>Webプレビュー</span>
            </button>
          </div>
        )}
      </div>

      {/* メインコンテンツエリア */}
      <div className="flex-1 overflow-hidden p-3 bg-slate-900">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 border-2 border-dashed border-slate-800 rounded-xl">
            <span className="text-4xl mb-3">🛠️</span>
            <h4 className="text-base font-bold text-slate-300 mb-1">
              コーディングエージェントの作業領域
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
              チャットでコードの生成を依頼すると、Ful衛門 技師が作成したファイルが自動的にここにマッピングされます。
            </p>
            <div className="bg-slate-950 p-3 rounded-lg text-left text-xs font-mono text-slate-300 space-y-1 border border-slate-800">
              <div className="text-indigo-400 font-semibold mb-1">💡 おすすめのプロンプト:</div>
              <div>• 「ReactとTailwindでTODOアプリのコンポーネントを作って」</div>
              <div>• 「HTMLとCanvasでブロック崩しゲームを作って」</div>
              <div>• 「CSV解析のPythonスクリプトを単体テスト付きで書いて」</div>
            </div>
          </div>
        ) : viewTab === 'preview' && previewDoc ? (
          <LivePreview htmlContent={previewDoc} />
        ) : activeFile ? (
          <CodeViewer
            file={activeFile}
            onCodeChange={(newCode) => onUpdateFile(activeFile.id, newCode)}
          />
        ) : null}
      </div>

      {/* Diff比較モーダル */}
      <DiffModal
        isOpen={isDiffOpen}
        onClose={() => setIsDiffOpen(false)}
        initialOriginalCode=""
        initialModifiedCode={activeFile?.content || ''}
      />
    </div>
  );
}
