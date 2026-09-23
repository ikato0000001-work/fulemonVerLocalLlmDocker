// lib/codeExtractor.ts
import { CodeFile } from '@/types/chat';

const EXTENSION_MAP: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  bat: 'bat',
  ps1: 'powershell',
  md: 'markdown',
  dockerfile: 'dockerfile',
};

const DEFAULT_FILENAMES: Record<string, string> = {
  javascript: 'script.js',
  js: 'script.js',
  typescript: 'index.ts',
  ts: 'index.ts',
  python: 'main.py',
  py: 'main.py',
  html: 'index.html',
  css: 'styles.css',
  json: 'data.json',
  yaml: 'config.yaml',
  yml: 'config.yaml',
  sql: 'query.sql',
  bash: 'script.sh',
  sh: 'script.sh',
  powershell: 'script.ps1',
  ps1: 'script.ps1',
  markdown: 'README.md',
  md: 'README.md',
};

/**
 * AIのメッセージテキストからすべてのコードブロックを抽出し、
 * 扱いやすい CodeFile オブジェクトの配列に変換します。
 */
export function extractCodeFiles(content: string): CodeFile[] {
  const codeFiles: CodeFile[] = [];
  const regex = /```([^\n]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let fileIndex = 1;

  while ((match = regex.exec(content)) !== null) {
    const rawHeader = match[1]?.trim() || '';
    const rawCode = match[2]?.replace(/^\n|\n$/g, '') || '';

    if (!rawCode.trim()) {
      continue;
    }

    let language = 'text';
    let path = '';
    let name = '';

    // パターン1: ```lang:path (例: ```typescript:src/index.ts)
    // パターン2: ```path (例: ```src/index.ts)
    // パターン3: ```lang (例: ```typescript)
    if (rawHeader.includes(':')) {
      const parts = rawHeader.split(':');
      language = parts[0].trim().toLowerCase();
      path = parts.slice(1).join(':').trim();
    } else if (rawHeader.includes('/') || rawHeader.includes('\\') || rawHeader.includes('.')) {
      path = rawHeader;
      const dotIndex = path.lastIndexOf('.');
      if (dotIndex >= 0) {
        const ext = path.slice(dotIndex + 1).toLowerCase();
        language = EXTENSION_MAP[ext] || ext;
      }
    } else if (rawHeader) {
      language = rawHeader.toLowerCase();
    }

    // パスからファイル名を特定
    if (path) {
      const normalized = path.replace(/\\/g, '/');
      const segments = normalized.split('/');
      name = segments[segments.length - 1] || `file_${fileIndex}`;
    } else {
      const defaultName = DEFAULT_FILENAMES[language] || `snippet_${fileIndex}.txt`;
      name = defaultName;
      path = defaultName;
    }

    const uniqueId = `file-${fileIndex}-${name}`;
    fileIndex += 1;

    codeFiles.push({
      id: uniqueId,
      name,
      path,
      language: EXTENSION_MAP[language] || language,
      content: rawCode,
    });
  }

  return codeFiles;
}

/**
 * 抽出されたファイル群からHTML/CSS/JSプレビュー用の完全なHTML文字列を構築します。
 */
export function buildPreviewDocument(files: CodeFile[]): string | null {
  const htmlFile = files.find(
    (f) => f.language === 'html' || f.name.endsWith('.html') || f.content.includes('<html') || f.content.includes('<!DOCTYPE'),
  );

  const cssFiles = files.filter((f) => f.language === 'css' || f.name.endsWith('.css'));
  const jsFiles = files.filter(
    (f) =>
      (f.language === 'javascript' || f.language === 'js') &&
      !f.name.includes('test') &&
      !f.name.includes('spec'),
  );

  if (!htmlFile && cssFiles.length === 0 && jsFiles.length === 0) {
    return null;
  }

  const combinedCss = cssFiles.map((f) => f.content).join('\n\n');
  const combinedJs = jsFiles.map((f) => f.content).join('\n\n');

  if (htmlFile) {
    let html = htmlFile.content;

    // もし既にあるHTMLにCSSとJSを注入する場合
    if (combinedCss && !html.includes(combinedCss)) {
      if (html.includes('</head>')) {
        html = html.replace('</head>', `<style>\n${combinedCss}\n</style>\n</head>`);
      } else {
        html = `<style>\n${combinedCss}\n</style>\n${html}`;
      }
    }

    if (combinedJs && !html.includes(combinedJs)) {
      if (html.includes('</body>')) {
        html = html.replace('</body>', `<script>\n${combinedJs}\n</script>\n</body>`);
      } else {
        html = `${html}\n<script>\n${combinedJs}\n</script>`;
      }
    }

    return html;
  }

  // HTMLファイルが存在せず、CSSやJSのみの場合のフォールバック
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    ${combinedCss}
  </style>
</head>
<body>
  <div id="app">プレビュー対象のHTMLはありません。JS/CSSが読み込まれています。</div>
  <script>
    try {
      ${combinedJs}
    } catch (e) {
      console.error(e);
      document.body.innerHTML += '<p style="color:red">実行時エラー: ' + e.message + '</p>';
    }
  </script>
</body>
</html>`;
}
