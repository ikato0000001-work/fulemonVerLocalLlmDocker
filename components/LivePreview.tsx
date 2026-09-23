// components/LivePreview.tsx
'use client';

import React, { useState, useEffect } from 'react';

interface LivePreviewProps {
  htmlContent: string;
}

export default function LivePreview({ htmlContent }: LivePreviewProps) {
  const [srcDoc, setSrcDoc] = useState(htmlContent);
  const [key, setKey] = useState(0);

  useEffect(() => {
    setSrcDoc(htmlContent);
  }, [htmlContent]);

  const handleReload = () => {
    setKey((prev) => prev + 1);
  };

  const handleOpenInNewTab = () => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-b border-gray-200 text-xs text-gray-700">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-gray-800">Web ライブプレビュー</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReload}
            className="px-2 py-1 rounded bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 transition"
            title="プレビューを再読み込み"
          >
            🔄 再読み込み
          </button>
          <button
            type="button"
            onClick={handleOpenInNewTab}
            className="px-2 py-1 rounded bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 transition"
            title="新規タブで実行"
          >
            ↗️ 新規タブ
          </button>
        </div>
      </div>
      <div className="flex-1 w-full h-full min-h-[300px] bg-white relative">
        <iframe
          key={key}
          srcDoc={srcDoc}
          title="Live Preview"
          sandbox="allow-scripts allow-modals allow-forms"
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}
