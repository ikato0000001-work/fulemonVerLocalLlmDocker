// components/CodeViewer.tsx
'use client';

import React, { useState } from 'react';
import { CodeFile } from '@/types/chat';
import { downloadSingleFile } from '@/lib/zipExporter';

interface CodeViewerProps {
  file: CodeFile;
  onCodeChange?: (updatedCode: string) => void;
}

export default function CodeViewer({ file, onCodeChange }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(file.content);

  const lines = file.content.split('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? editContent : file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('コピーに失敗しました:', err);
    }
  };

  const handleDownload = () => {
    downloadSingleFile({
      ...file,
      content: isEditing ? editContent : file.content,
    });
  };

  const handleSaveEdit = () => {
    if (onCodeChange) {
      onCodeChange(editContent);
    }
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-800 text-gray-200 shadow-md">
      {/* ツールバー */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-950 border-b border-gray-800 text-xs">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="font-mono text-blue-400 font-semibold truncate" title={file.path}>
            📄 {file.path}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] uppercase">
            {file.language}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onCodeChange && (
            <button
              type="button"
              onClick={isEditing ? handleSaveEdit : () => setIsEditing(true)}
              className={`px-2 py-1 rounded transition text-xs ${
                isEditing
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              {isEditing ? '💾 保存' : '✏️ 編集'}
            </button>
          )}
          {isEditing && (
            <button
              type="button"
              onClick={() => {
                setEditContent(file.content);
                setIsEditing(false);
              }}
              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs"
            >
              キャンセル
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition text-xs"
          >
            {copied ? '✅ コピー済' : '📋 コピー'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition text-xs"
            title="ファイルを保存"
          >
            ⬇️ 保存
          </button>
        </div>
      </div>

      {/* エディタ / コード表示 */}
      <div className="flex-1 overflow-auto p-0 font-mono text-xs leading-5">
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full p-4 bg-gray-900 text-gray-100 font-mono text-xs resize-none outline-none leading-5"
            spellCheck={false}
          />
        ) : (
          <div className="flex min-w-full">
            {/* 行番号 */}
            <div className="select-none py-3 pl-3 pr-3 text-right text-gray-600 bg-gray-950/40 border-r border-gray-800/60 font-mono shrink-0">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            {/* コード本体 */}
            <pre className="p-3 text-gray-200 overflow-x-auto flex-1 font-mono">
              <code>{file.content}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
