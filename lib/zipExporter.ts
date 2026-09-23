// lib/zipExporter.ts
import JSZip from 'jszip';
import { CodeFile } from '@/types/chat';

/**
 * 複数のファイルをディレクトリ構造を維持したZIPファイルとして一括ダウンロードします。
 */
export async function downloadFilesAsZip(files: CodeFile[], zipFileName = 'generated-project.zip') {
  if (files.length === 0) return;

  const zip = new JSZip();

  for (const file of files) {
    // パス区切りを正規化
    const normalizedPath = file.path.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    zip.file(normalizedPath, file.content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 単一ファイルを直接ダウンロードします。
 */
export function downloadSingleFile(file: CodeFile) {
  const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
