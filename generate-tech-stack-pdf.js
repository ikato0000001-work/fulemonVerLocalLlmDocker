const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outputPath = path.join(__dirname, 'tech-stack-summary.pdf');
const regularFont = 'C:/Windows/Fonts/yumin.ttf';
const boldFont = 'C:/Windows/Fonts/yumindb.ttf';

if (!fs.existsSync(regularFont) || !fs.existsSync(boldFont)) {
  throw new Error('Japanese TrueType font files were not found in C:/Windows/Fonts.');
}

const tableRows = [
  ['分類', '技術・実装', '役割 / 詳細'],
  ['アプリ基盤', 'Next.js 16.3.4', 'App Router、画面配信、API ルートの基盤'],
  ['UI', 'React 19.2.8', 'チャット画面、サイドバー、フォームの描画と状態更新'],
  ['型・品質', 'TypeScript 5 / ESLint 9', '型安全な実装とコード品質の維持'],
  ['スタイリング', 'Tailwind CSS 4', 'レスポンシブなレイアウトと UI スタイル'],
  ['API', 'Next.js Route Handler', 'app/api/chat/route.ts で POST リクエストを処理'],
  ['AI 実行基盤', 'Ollama API', 'localhost:11434/api/chat へ会話履歴とモデル名を送信'],
  ['モデル', 'Gemma4 e2b / e4b', '軽量モデルと高性能モデルを UI から切り替え'],
  ['状態管理', 'React useState', '入力、選択モデル、ローディング、現在トピックを管理'],
  ['永続化', 'ブラウザ localStorage', 'Record<string, Message[]> 形式でチャット履歴を保存'],
  ['履歴機能', 'トピック CRUD', '新規作成、質問からの自動命名、編集、削除、再開'],
];

const sections = [
  ['設計方針', 'フロントエンドと API を同一の Next.js プロジェクトにまとめ、ローカル LLM とブラウザ保存を組み合わせている。外部 API キーを使わず、開発・検証・社内利用を始めやすい構成である。'],
  ['リクエスト処理', 'ユーザーの入力と選択モデルをクライアントから API ルートへ送信する。API ルートは Ollama のチャット API に履歴を渡し、生成された応答テキストを JSON として画面へ返す。'],
  ['データモデル', 'チャット履歴はトピック名をキー、Message 配列を値とする Record として管理する。各トピックには system、user、assistant のメッセージが時系列で保存される。'],
  ['拡張ポイント', '認証、サーバー側データベース、ストリーミング応答、利用ログ、権限管理を追加する場合も、API ルートと履歴管理を境界として段階的に拡張できる。'],
];

const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 38, bottom: 38, left: 42, right: 42 }, bufferPages: true });
const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

const pageWidth = 842;
const contentWidth = 758;
const navy = '#102a43';
const blue = '#247ba0';
const teal = '#2a9d8f';
const ink = '#243b53';
const muted = '#627d98';
const pale = '#eef6f8';

function heading(text, size = 16) {
  doc.font(boldFont).fontSize(size).fillColor(navy).text(text);
  doc.moveDown(0.35);
}

function footer(pageNumber) {
  doc.font(regularFont).fontSize(8).fillColor(muted).text(`AI Chat Fulemon | 技術スタック分析 | ${pageNumber}`, 42, 555, { width: contentWidth, align: 'right' });
}

function drawTable(rows) {
  const widths = [100, 205, 453];
  const x = 42;
  let y = doc.y;
  const padding = 8;

  rows.forEach((row, index) => {
    const isHeader = index === 0;
    const fontSize = isHeader ? 10 : 9.5;
    const heights = row.map((cell, cellIndex) => doc.heightOfString(cell, { width: widths[cellIndex] - padding * 2, font: isHeader ? boldFont : regularFont, size: fontSize, lineGap: 2 }));
    const height = Math.max(30, Math.max(...heights) + padding * 2);

    if (y + height > 525) {
      footer(doc.bufferedPageRange().count);
      doc.addPage();
      y = 42;
      heading('技術スタック一覧（続き）', 15);
    }

    let columnX = x;
    row.forEach((cell, cellIndex) => {
      doc.fillColor(isHeader ? navy : index % 2 === 0 ? '#f7fafc' : '#ffffff').rect(columnX, y, widths[cellIndex], height).fill();
      doc.strokeColor('#d9e2ec').lineWidth(0.6).rect(columnX, y, widths[cellIndex], height).stroke();
      doc.font(isHeader || cellIndex === 0 ? boldFont : regularFont).fontSize(fontSize).fillColor(isHeader ? '#ffffff' : ink).text(cell, columnX + padding, y + padding, { width: widths[cellIndex] - padding * 2, lineGap: 2 });
      columnX += widths[cellIndex];
    });
    y += height;
  });
  doc.y = y + 14;
}

function drawBox(x, y, width, height, title, body, color) {
  doc.roundedRect(x, y, width, height, 8).fillColor('#ffffff').fill();
  doc.roundedRect(x, y, width, height, 8).strokeColor(color).lineWidth(1.6).stroke();
  doc.font(boldFont).fontSize(12).fillColor(color).text(title, x + 12, y + 12, { width: width - 24, align: 'center' });
  doc.font(regularFont).fontSize(9).fillColor(ink).text(body, x + 12, y + 36, { width: width - 24, align: 'center', lineGap: 2 });
}

function arrow(x1, y1, x2, y2) {
  doc.strokeColor(blue).lineWidth(2).moveTo(x1, y1).lineTo(x2, y2).stroke();
  doc.fillColor(blue).polygon([x2, y2], [x2 - 8, y2 - 5], [x2 - 8, y2 + 5]).fill();
}

// Cover and executive summary.
doc.rect(0, 0, pageWidth, 595).fillColor('#f4f8fa').fill();
doc.rect(0, 0, 18, 595).fillColor(teal).fill();
doc.font(boldFont).fontSize(30).fillColor(navy).text('技術スタック分析レポート', 60, 90);
doc.font(regularFont).fontSize(15).fillColor(blue).text('AI Chat Fulemon | 会社向け詳細版', 62, 145);
doc.moveTo(62, 185).lineTo(420, 185).strokeColor(teal).lineWidth(3).stroke();
doc.font(regularFont).fontSize(12).fillColor(ink).text('Next.js と Ollama を組み合わせた\nローカル AI チャットアプリの構成資料', 62, 220, { lineGap: 7 });
doc.roundedRect(540, 92, 220, 190, 12).fillColor('#ffffff').fill().strokeColor('#d9e2ec').stroke();
doc.font(boldFont).fontSize(13).fillColor(navy).text('エグゼクティブサマリー', 560, 118);
doc.font(regularFont).fontSize(10).fillColor(ink).text('• ローカル LLM による AI 応答\n• トピック単位の履歴管理\n• モデル選択と会話の継続\n• 外部 API キー不要\n• 段階的な機能拡張が可能', 560, 155, { lineGap: 8 });
doc.font(regularFont).fontSize(9).fillColor(muted).text('作成日: 2026年9月4日', 62, 500);
footer(1);

// Table page.
doc.addPage();
heading('技術スタック一覧', 20);
doc.font(regularFont).fontSize(10.5).fillColor(muted).text('主要な技術、実装箇所、採用理由を一覧化しています。');
doc.moveDown(0.7);
drawTable(tableRows);
footer(2);

// Architecture diagram page.
doc.addPage();
heading('アーキテクチャ図', 20);
doc.font(regularFont).fontSize(10.5).fillColor(muted).text('質問が入力されてから、ローカル LLM の回答が画面へ戻るまでの処理フロー。');
doc.moveDown(1);

drawBox(55, 180, 145, 90, 'ユーザー', '質問入力\nモデル選択', teal);
drawBox(250, 180, 165, 90, 'Next.js UI', 'app/page.tsx\n履歴・状態管理', blue);
drawBox(465, 180, 145, 90, 'API Route', 'POST /api/chat\nJSON 変換', navy);
drawBox(660, 180, 125, 90, 'Ollama', 'ローカル推論\nGemma モデル', '#e76f51');
arrow(200, 225, 250, 225);
arrow(415, 225, 465, 225);
arrow(610, 225, 660, 225);
doc.font(regularFont).fontSize(9).fillColor(muted).text('質問 + 選択モデル', 203, 205);
doc.text('messages 配列', 418, 205);
doc.text('ローカル HTTP', 613, 205);

doc.roundedRect(250, 335, 360, 100, 10).fillColor(pale).fill().strokeColor('#b8d8df').stroke();
doc.font(boldFont).fontSize(13).fillColor(navy).text('ブラウザ内の永続化', 270, 355);
doc.font(regularFont).fontSize(10).fillColor(ink).text('chatHistory: Record<string, Message[]>\nlocalStorage: ai-chat-history\nトピック名をキーに会話を再開', 270, 385, { lineGap: 5 });
arrow(332, 270, 332, 335);
arrow(528, 335, 528, 270);
footer(3);

// Detail pages.
doc.addPage();
heading('詳細分析', 20);
sections.forEach(([title, body]) => {
  doc.font(boldFont).fontSize(13).fillColor(blue).text(title);
  doc.moveDown(0.25);
  doc.font(regularFont).fontSize(10.5).fillColor(ink).text(body, { width: contentWidth, align: 'justify', lineGap: 4 });
  doc.moveDown(1);
});
heading('主なファイル構成', 15);
doc.font(regularFont).fontSize(10).fillColor(ink).text('app/page.tsx                 メインチャット UI、履歴管理、モデル選択\napp/api/chat/route.ts         Ollama への API プロキシ\napp/layout.tsx                アプリ全体のレイアウト\napp/globals.css               グローバルスタイル\npackage.json                  依存関係と実行スクリプト', { lineGap: 6 });
footer(4);

// Final page.
doc.addPage();
heading('まとめと今後の拡張候補', 20);
doc.font(regularFont).fontSize(11).fillColor(ink).text('現時点の構成は、ローカル AI チャットを短い導入期間で検証するために適している。フロントエンド、API、LLM 実行基盤の責務が分かれているため、将来の本番運用にも段階的に移行できる。', { width: contentWidth, align: 'justify', lineGap: 5 });
doc.moveDown(1.2);
[
  ['短期', 'ストリーミング応答、入力バリデーション、エラー表示の改善'],
  ['中期', 'SQLite / PostgreSQL などへの履歴移行、ユーザー認証、利用ログ'],
  ['長期', '権限管理、チーム共有、監査ログ、モデル管理画面'],
].forEach(([term, text]) => {
  doc.font(boldFont).fontSize(12).fillColor(teal).text(term, { continued: true });
  doc.font(regularFont).fontSize(11).fillColor(ink).text(`  ${text}`);
  doc.moveDown(0.7);
});
doc.moveDown(2);
doc.roundedRect(42, 390, contentWidth, 70, 10).fillColor(navy).fill();
doc.font(boldFont).fontSize(14).fillColor('#ffffff').text('総括', 62, 410);
doc.font(regularFont).fontSize(10.5).fillColor('#ffffff').text('Next.js、React、TypeScript、Tailwind CSS、Ollama を組み合わせた、拡張性のあるローカル AI チャット基盤です。', 115, 411, { width: 650 });
footer(5);

doc.end();
console.log(`PDF generated: ${outputPath}`);
