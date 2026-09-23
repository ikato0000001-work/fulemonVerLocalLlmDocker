// lib/prompts.ts
import { Message, ModelOption } from '@/types/chat';

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'gemma4:e4b', name: 'Gemma4 4B (コード・推論・高性能・202604)', isCodingSpecialized: true },
  { id: 'gemma4:e2b', name: 'Gemma4 2B (軽量・高速・202604)', isCodingSpecialized: true },
  { id: 'qwen3.5:9b', name: 'Qwen3.5 9B (コード・推論推奨・202603)', isCodingSpecialized: true },
  { id: 'qwen3:14b', name: 'Qwen3 14B (コード特化・高性能・202604)', isCodingSpecialized: true },
  { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B (推論特化・軽量・202501)', isCodingSpecialized: false },
  { id: 'phi4', name: 'phi4(推論特化・小型・202412)', isCodingSpecialized: false },
  { id: 'llama3.2:3b', name: 'Llama3.2 3B (壁打ち、日常的なタスク処理・超軽量・202409)', isCodingSpecialized: false },
  { id: 'codestral', name: 'Codestral (コード特化・高性能・202409)', isCodingSpecialized: true },
];

export const GENERAL_SYSTEM_PROMPT: Message = {
  role: 'system',
  content:
    'あなたは非常に優秀なIT専門家「Ful衛門」です。ユーザーの質問に対して、丁寧で分かりやすい日本語で回答してください。挨拶や自己紹介は一切行わず、質問への回答のみを簡潔に、直接的にお出しください。',
};

export const CODING_AGENT_SYSTEM_PROMPT: Message = {
  role: 'system',
  content: `あなたは卓越したフルスタック・ソフトウェアエンジニア「Ful衛門 技師」です。
ユーザーの開発タスク、プログラミング、アーキテクチャ設計、バグ修正、リファクタリング、テスト作成を強力に支援します。

以下の指示に厳格に従ってください：
1. 【ファイル指定コードブロック】
   コードを出力する際は、必ずファイル名またはパスをコードブロックの言語識別子に付与してください。
   形式: \`\`\`言語:パスまたはファイル名 (例: \`\`\`typescript:src/components/Button.tsx, \`\`\`python:main.py, \`\`\`html:index.html)
   ファイル名が特定できない場合でも、推測される適切なファイル名を付けてください (例: \`\`\`javascript:index.js)。
2. 【高品質なコード】
   省略せず、実行可能で完全なコードを書いてください（「// ここに処理を書く」などの省略を避け、動く状態にする）。
   エラーハンドリング、型安全性（TypeScript）、クリーンアーキテクチャ、エッジケースの考慮を徹底してください。
3. 【構成と解説】
   - まず変更方針や設計概要を簡潔に説明してください。
   - 完全なコードブロックを出力してください。
   - 最後に実行・検証方法や注意点を簡潔に補足してください。
4. 【Webプレビュー配慮】
   HTML/CSS/JavaScriptなどのフロントエンド実装を求められた場合、単一HTMLファイル（\`\`\`html:index.html）としてインラインCSS/JSを含む形で出力すると、プレビュー機能で即座に動作確認できます。`,
};

export const ANSWER_SEPARATOR = 'ーーーーーーーーーーーーーーーーーーーーーーーーーーーーー';
export const GENERAL_ANSWER_CLOSING = '回答ここまででござる';
export const CODING_ANSWER_CLOSING = 'コーディング任務、これにて完了でござる！';

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  description: string;
  promptTemplate: (selectedCode?: string) => string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'generate',
    label: '新規作成',
    icon: '🚀',
    description: '要件からファイル一式・完全なコードを新規設計・実装',
    promptTemplate: () =>
      '以下の要件を満たすコードを新規作成してください。\n- 要件:\n  1. \n  2. \n- 使用技術/フレームワーク: \n- 出力ファイル形式: 完全な実装（ファイル名付きコードブロック）',
  },
  {
    id: 'debug',
    label: 'バグ修正',
    icon: '🐛',
    description: 'エラー原因を特定し、修正前後の比較と修正コードを提示',
    promptTemplate: (code) =>
      code
        ? `以下のコードで発生している問題を調査し、バグを修正してください。\n\n\`\`\`\n${code}\n\`\`\`\n\nエラー内容/期待する動作:\n- `
        : '以下のコードで発生しているエラー/バグを特定し、修正してください。\n- エラーメッセージ:\n- 現象:\n- 対象コード:\n```\n\n```',
  },
  {
    id: 'refactor',
    label: 'リファクタリング',
    icon: '⚡',
    description: '可読性、保守性、パフォーマンス、型安全性の改善',
    promptTemplate: (code) =>
      code
        ? `以下のコードをクリーンコードの観点からリファクタリングしてください。\n改善点（可読性・パフォーマンス・保守性・型安全性）と修正後コードを提示してください。\n\n\`\`\`\n${code}\n\`\`\``
        : '以下のコードをリファクタリングしてください。\n可読性、保守性、パフォーマンスを改善した完全なコードを提示してください。\n```\n\n```',
  },
  {
    id: 'test',
    label: '単体テスト',
    icon: '🧪',
    description: '正常系・異常系・境界値を網羅したユニットテスト生成',
    promptTemplate: (code) =>
      code
        ? `以下のコードに対する網羅的な単体テスト（正常系・異常系・エッジケース）を作成してください。\nテストフレームワーク（Jest / Vitest / pytest 等）に合わせてください。\n\n\`\`\`\n${code}\n\`\`\``
        : '以下のコードに対する単体テストを作成してください。\n- テスト対象コード:\n```\n\n```\n- テストフレームワーク: ',
  },
  {
    id: 'review',
    label: 'コードレビュー',
    icon: '🔍',
    description: 'セキュリティ脆弱性、計算量、品質の総合レビュー',
    promptTemplate: (code) =>
      code
        ? `以下のコードをシニアエンジニアの視点から総合レビューしてください。\n- セキュリティ上の懸念\n- パフォーマンス・計算量\n- 設計や命名・エッジケース\n- 具体的な改善案\n\n\`\`\`\n${code}\n\`\`\``
        : '以下のコードを詳細にレビューし、改善点を指摘してください。\n```\n\n```',
  },
  {
    id: 'explain',
    label: 'コード解説',
    icon: '📖',
    description: 'アーキテクチャや処理の流れをステップ解説',
    promptTemplate: (code) =>
      code
        ? `以下のコードのアーキテクチャ、アルゴリズム、各処理の流れを分かりやすく丁寧に解説してください。\n\n\`\`\`\n${code}\n\`\`\``
        : '以下のコードの処理の流れや仕組みを分かりやすく解説してください。\n```\n\n```',
  },
];
