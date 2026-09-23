// components/DiffModal.tsx
'use client';

import React, { useState } from 'react';

interface DiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOriginalCode?: string;
  initialModifiedCode?: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
}

function computeSimpleDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const result: DiffLine[] = [];

  const max = Math.max(origLines.length, modLines.length);
  let i = 0;
  let j = 0;

  while (i < origLines.length || j < modLines.length) {
    if (i < origLines.length && j < modLines.length) {
      if (origLines[i] === modLines[j]) {
        result.push({ type: 'unchanged', content: origLines[i] });
        i++;
        j++;
      } else {
        // 簡易行比較
        result.push({ type: 'removed', content: origLines[i] });
        result.push({ type: 'added', content: modLines[j] });
        i++;
        j++;
      }
    } else if (i < origLines.length) {
      result.push({ type: 'removed', content: origLines[i] });
      i++;
    } else if (j < modLines.length) {
      result.push({ type: 'added', content: modLines[j] });
      j++;
    }
  }

  return result;
}

export default function DiffModal({
  isOpen,
  onClose,
  initialOriginalCode = '',
  initialModifiedCode = '',
}: DiffModalProps) {
  const [original, setOriginal] = useState(initialOriginalCode);
  const [modified, setModified] = useState(initialModifiedCode);
  const [viewMode, setViewMode] = useState<'diff' | 'input'>('diff');

  if (!isOpen) return null;

  const diffLines = computeSimpleDiff(original, modified);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="flex flex-col w-full max-w-5xl h-[85vh] bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden text-gray-200">
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-950 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚖️</span>
            <h3 className="text-base font-bold text-gray-100">コード差分 (Diff) ビューア</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md bg-gray-800 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('diff')}
                className={`px-3 py-1 rounded transition ${
                  viewMode === 'diff' ? 'bg-indigo-600 text-white font-medium' : 'text-gray-400 hover:text-white'
                }`}
              >
                差分表示
              </button>
              <button
                type="button"
                onClick={() => setViewMode('input')}
                className={`px-3 py-1 rounded transition ${
                  viewMode === 'input' ? 'bg-indigo-600 text-white font-medium' : 'text-gray-400 hover:text-white'
                }`}
              >
                コード入力
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xl px-2 leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-hidden p-4">
          {viewMode === 'input' ? (
            <div className="grid grid-cols-2 gap-4 h-full">
              <div className="flex flex-col h-full">
                <label className="text-xs font-semibold text-red-400 mb-1">修正前コード (Original)</label>
                <textarea
                  value={original}
                  onChange={(e) => setOriginal(e.target.value)}
                  placeholder="修正前のコードを入力..."
                  className="flex-1 p-3 bg-gray-950 border border-gray-800 rounded-lg font-mono text-xs text-gray-100 resize-none outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex flex-col h-full">
                <label className="text-xs font-semibold text-emerald-400 mb-1">修正後コード (Modified)</label>
                <textarea
                  value={modified}
                  onChange={(e) => setModified(e.target.value)}
                  placeholder="修正後のコードを入力..."
                  className="flex-1 p-3 bg-gray-950 border border-gray-800 rounded-lg font-mono text-xs text-gray-100 resize-none outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          ) : (
            <div className="h-full overflow-auto bg-gray-950 rounded-lg border border-gray-800 p-2 font-mono text-xs">
              {diffLines.length === 0 ? (
                <div className="p-8 text-center text-gray-500">コードが入力されていません。</div>
              ) : (
                diffLines.map((line, idx) => {
                  let bgClass = 'bg-transparent text-gray-300';
                  let symbol = ' ';
                  if (line.type === 'added') {
                    bgClass = 'bg-emerald-950/60 text-emerald-300 border-l-2 border-emerald-500';
                    symbol = '+';
                  } else if (line.type === 'removed') {
                    bgClass = 'bg-red-950/60 text-red-300 border-l-2 border-red-500 line-through opacity-80';
                    symbol = '-';
                  }

                  return (
                    <div key={idx} className={`px-2 py-0.5 whitespace-pre font-mono flex items-start ${bgClass}`}>
                      <span className="w-5 select-none text-gray-500 font-bold">{symbol}</span>
                      <span className="flex-1">{line.content || ' '}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
