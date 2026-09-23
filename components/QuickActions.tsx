// components/QuickActions.tsx
'use client';

import React from 'react';
import { QUICK_ACTIONS, QuickAction } from '@/lib/prompts';

interface QuickActionsProps {
  onSelectAction: (action: QuickAction) => void;
  disabled?: boolean;
}

export default function QuickActions({ onSelectAction, disabled }: QuickActionsProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1 scrollbar-thin">
      <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
        <span>⚡ 技師アクション:</span>
      </span>
      {QUICK_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelectAction(action)}
          title={action.description}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
        >
          <span>{action.icon}</span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
