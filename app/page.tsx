'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';

const AVAILABLE_MODELS = [
  { id: 'gemma4:e2b', name: 'Gemma4 2B (軽量)' },
  { id: 'gemma4:e4b', name: 'Gemma4 4B (高性能)' },
];

type MessageRole = 'user' | 'assistant' | 'system';

interface Message {
  role: MessageRole;
  content: string;
  displayContent?: string;
  images?: string[];
}

type AttachedFile = {
  id: string;
  name: string;
  kind: 'text' | 'image';
  content: string;
};

const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const FILE_INPUT_ACCEPT = [
  '.txt,.md,.markdown,.csv,.tsv,.json,.xml,.yml,.yaml,.toml,.ini,.log,.sql,.env',
  '.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.go,.rs,.java,.kt,.c,.h,.cpp,.cs,.php,.sh,.bat,.ps1',
  '.html,.css,.scss,.vue,.svelte,.dockerfile,.gitignore',
  '.pdf,.docx,.xlsx,.xls,.pptx',
  'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif',
].join(',');

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'xls', 'pptx']);
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yml', 'yaml', 'toml', 'ini', 'log',
  'sql', 'env', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt',
  'c', 'h', 'cpp', 'cs', 'php', 'sh', 'bat', 'ps1', 'html', 'css', 'scss', 'vue', 'svelte',
  'dockerfile', 'gitignore',
]);

const SYSTEM_PROMPT: Message = {
  role: 'system',
  content:
    'あなたは非常に優秀なIT専門家です。ユーザーの質問に対して、丁寧で分かりやすい日本語で回答してください。挨拶や自己紹介は一切行わず、質問への回答のみを簡潔に、直接的にお出しください。',
};

const DEFAULT_TOPIC_NAME = '新しいチャット';
const ANSWER_SEPARATOR = 'ーーーーーーーーーーーーーーーーーーーーーーーーーーーーー';
const ANSWER_CLOSING = '回答ここまででござる';

const getFileExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 0) {
    return fileName.toLowerCase();
  }
  return fileName.slice(lastDot + 1).toLowerCase();
};

const detectFileKind = (file: File): AttachedFile['kind'] | null => {
  if (file.type.startsWith('image/')) {
    return 'image';
  }
  if (file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/xml') {
    return 'text';
  }

  const extension = getFileExtension(file.name);
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (
    TEXT_EXTENSIONS.has(extension) ||
    DOCUMENT_EXTENSIONS.has(extension) ||
    file.name.toLowerCase() === 'dockerfile'
  ) {
    return 'text';
  }
  return null;
};

const readFileAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`${file.name} の読み込みに失敗しました。`));
    reader.readAsText(file);
  });

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error(`${file.name} の読み込みに失敗しました。`));
    reader.readAsDataURL(file);
  });

const readDocumentAsText = async (file: File) => {
  const extension = getFileExtension(file.name);
  const arrayBuffer = await file.arrayBuffer();

  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();
      if (pageText) {
        pages.push(`[ページ ${pageNumber}]\n${pageText}`);
      }
    }

    return pages.join('\n\n');
  }

  if (extension === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const xlsx = await import('xlsx');
    const workbook = xlsx.read(arrayBuffer, { type: 'array' });
    return workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return `[シート: ${sheetName}]\n${xlsx.utils.sheet_to_csv(sheet)}`;
    }).join('\n\n');
  }

  if (extension === 'pptx') {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slideNames = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((left, right) => {
        const leftNumber = Number(left.match(/slide(\d+)\.xml/)?.[1] ?? 0);
        const rightNumber = Number(right.match(/slide(\d+)\.xml/)?.[1] ?? 0);
        return leftNumber - rightNumber;
      });

    const slides = await Promise.all(
      slideNames.map(async (slideName, index) => {
        const xml = await zip.files[slideName].async('text');
        const document = new DOMParser().parseFromString(xml, 'application/xml');
        const text = Array.from(document.getElementsByTagName('a:t'))
          .map((node) => node.textContent ?? '')
          .join(' ')
          .trim();
        return text ? `[スライド ${index + 1}]\n${text}` : '';
      }),
    );

    return slides.filter(Boolean).join('\n\n');
  }

  return readFileAsText(file);
};

export default function ChatApp() {
  const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>({
    [DEFAULT_TOPIC_NAME]: [SYSTEM_PROMPT],
  });

  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [fileError, setFileError] = useState('');
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(AVAILABLE_MODELS[1].id);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTopic, setCurrentTopic] = useState<string>(DEFAULT_TOPIC_NAME);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const savedHistory = window.localStorage.getItem('ai-chat-history');
      if (!savedHistory) {
        return;
      }

      const parsedHistory = JSON.parse(savedHistory) as Record<string, Message[]>;
      const fallbackTopic = Object.keys(parsedHistory)[0] ?? DEFAULT_TOPIC_NAME;

      setChatHistory(parsedHistory);
      setCurrentTopic(fallbackTopic);
    } catch (error) {
      console.error('履歴の読み込み中にエラーが発生しました:', error);
      setChatHistory({ [DEFAULT_TOPIC_NAME]: [SYSTEM_PROMPT] });
      setCurrentTopic(DEFAULT_TOPIC_NAME);
    }
  }, []);

  const saveHistory = useCallback((history: Record<string, Message[]>) => {
    if (typeof window !== 'undefined') {
      const historyWithoutImages = Object.fromEntries(
        Object.entries(history).map(([topic, messages]) => [
          topic,
          messages.map(({ role, content, displayContent }) => ({ role, content, displayContent })),
        ]),
      );
      window.localStorage.setItem('ai-chat-history', JSON.stringify(historyWithoutImages));
    }
  }, []);

  const getTopicMessages = useCallback(
    (topicName: string): Message[] => {
      const topicMessages = chatHistory[topicName];
      return Array.isArray(topicMessages) && topicMessages.length >= 0 ? topicMessages : [SYSTEM_PROMPT];
    },
    [chatHistory],
  );

  const currentMessages = getTopicMessages(currentTopic);

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) {
      return;
    }

    setFileError('');

    const remainingSlots = MAX_ATTACHMENTS - attachedFiles.length;
    if (remainingSlots <= 0) {
      setFileError(`添付できるファイルは最大 ${MAX_ATTACHMENTS} 件です。`);
      return;
    }

    const nextFiles: AttachedFile[] = [];
    const errors: string[] = [];

    for (const file of incoming.slice(0, remainingSlots)) {
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`${file.name} は 2MB を超えているため読み込めません。`);
        continue;
      }

      const kind = detectFileKind(file);
      if (!kind) {
        errors.push(`${file.name} は対応していない形式です。テキスト、PDF、Office 文書、または画像を選んでください。`);
        continue;
      }

      try {
        const content = kind === 'text' ? await readDocumentAsText(file) : await readFileAsBase64(file);
        nextFiles.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
          name: file.name,
          kind,
          content,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${file.name} の読み込みに失敗しました。`);
      }
    }

    if (incoming.length > remainingSlots) {
      errors.push(`添付できるファイルは最大 ${MAX_ATTACHMENTS} 件です。`);
    }

    if (nextFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...nextFiles]);
    }
    if (errors.length > 0) {
      setFileError(errors.join(' '));
    }
  }, [attachedFiles.length]);

  const removeAttachedFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((file) => file.id !== id));
    setFileError('');
  };

  const buildUserMessage = (question: string, files: AttachedFile[]): Message => {
    const trimmedQuestion = question.trim();
    const textFiles = files.filter((file) => file.kind === 'text');
    const imageFiles = files.filter((file) => file.kind === 'image');
    const parts: string[] = [];
    const displayParts: string[] = [];

    if (trimmedQuestion) {
      parts.push(trimmedQuestion);
      displayParts.push(trimmedQuestion);
    }

    for (const file of textFiles) {
      parts.push(`--- 添付ファイル: ${file.name} ---\n${file.content}`);
      displayParts.push(`--- 添付ファイル: ${file.name} ---`);
    }

    if (imageFiles.length > 0) {
      const imageNames = imageFiles.map((file) => `[画像を添付: ${file.name}]`).join('\n');
      parts.push(imageNames);
      displayParts.push(imageNames);
    }

    return {
      role: 'user',
      content: parts.join('\n\n'),
      displayContent: displayParts.join('\n\n'),
      ...(imageFiles.length > 0 ? { images: imageFiles.map((file) => file.content) } : {}),
    };
  };

  const getDisplayContent = (message: Message) => {
    if (message.displayContent !== undefined) {
      return message.displayContent;
    }

    return message.content.replace(
      /(^|\n\n)(--- 添付ファイル: ([^\n]+) ---)\n[\s\S]*?(?=\n\n--- 添付ファイル: |$)/g,
      '$1$2',
    );
  };

  const handleSend = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isLoading) return;

      const userMessage = buildUserMessage(input, attachedFiles);
      if (!userMessage.content.trim()) return;

      const historyBeforeSend = getTopicMessages(currentTopic);
      const isInitialTopic = historyBeforeSend.length === 1 && historyBeforeSend[0]?.role === 'system';
      const activeTopicName = isInitialTopic
        ? makeTopicTitle(input.trim() || attachedFiles[0]?.name || DEFAULT_TOPIC_NAME)
        : currentTopic;

      setChatHistory((prev) => {
        const topicMessages = Array.isArray(prev[activeTopicName]) ? prev[activeTopicName] : [SYSTEM_PROMPT];

        if (isInitialTopic && activeTopicName !== currentTopic) {
          const rest = Object.fromEntries(
            Object.entries(prev).filter(([topic]) => topic !== currentTopic),
          );
          const nextHistory = {
            ...rest,
            [activeTopicName]: [...topicMessages, userMessage],
          };
          saveHistory(nextHistory);
          return nextHistory;
        }

        const nextHistory = {
          ...prev,
          [activeTopicName]: [...topicMessages, userMessage],
        };
        saveHistory(nextHistory);
        return nextHistory;
      });

      if (isInitialTopic) {
        setCurrentTopic(activeTopicName);
      }

      setInput('');
      setAttachedFiles([]);
      setFileError('');
      setIsLoading(true);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...historyBeforeSend, userMessage],
            model: selectedModel,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          const status = response.status;
          throw new Error(`APIサーバーエラー (Status: ${status}): ${errorData.error || '不明なエラー'}`);
        }

        const data = await response.json();

        if (!data.response) {
          throw new Error('AIからの応答（response）が見つかりません。');
        }

        const aiMessage: Message = {
          role: 'assistant',
          content: data.response,
        };

        setChatHistory((prev) => {
          const targetTopic = isInitialTopic ? activeTopicName : currentTopic;
          const topicMessages = Array.isArray(prev[targetTopic]) ? prev[targetTopic] : [SYSTEM_PROMPT];
          const nextHistory = {
            ...prev,
            [targetTopic]: [...topicMessages, aiMessage],
          };
          saveHistory(nextHistory);
          return nextHistory;
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        console.error('チャット処理エラー:', error);

        let errorMessage = '予期せぬエラーが発生しました。アプリを再起動するか、開発者コンソール（F12）を確認してください。';

        if (error instanceof Error) {
          errorMessage = `AI応答エラー: ${error.message}`;
        }

        const errorDisplayMessage: Message = {
          role: 'assistant',
          content: `⚠️ ${errorMessage}`,
        };

        setChatHistory((prev) => {
          const targetTopic = isInitialTopic ? activeTopicName : currentTopic;
          const topicMessages = Array.isArray(prev[targetTopic]) ? prev[targetTopic] : [SYSTEM_PROMPT];
          const nextHistory = {
            ...prev,
            [targetTopic]: [...topicMessages, errorDisplayMessage],
          };
          saveHistory(nextHistory);
          return nextHistory;
        });
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        setIsLoading(false);
      }
    },
    [attachedFiles, currentTopic, getTopicMessages, input, isLoading, saveHistory, selectedModel],
  );

  const getMessageClass = (role: Message['role']) => {
    if (role === 'user') {
      return 'bg-blue-600 text-white self-end rounded-br-none shadow-md';
    }
    if (role === 'assistant') {
      return 'bg-gray-200 text-gray-800 self-start rounded-tl-none shadow-md';
    }
    if (role === 'system') {
      return 'bg-indigo-100 text-indigo-800 self-start border-l-4 border-indigo-400 text-xs italic';
    }
    return 'bg-gray-100';
  };

  const loadTopic = (topicName: string) => {
    const normalizedTopic = topicName.trim();
    if (!normalizedTopic) {
      return;
    }

    setChatHistory((prev) => {
      const existingMessages = Array.isArray(prev[normalizedTopic]) ? prev[normalizedTopic] : [SYSTEM_PROMPT];
      return {
        ...prev,
        [normalizedTopic]: existingMessages,
      };
    });

    setCurrentTopic(normalizedTopic);
  };

  const addNewTopic = () => {
    const existingTopics = Object.keys(chatHistory);
    let topicNumber = 1;
    let nextTopic = DEFAULT_TOPIC_NAME;

    while (existingTopics.includes(nextTopic)) {
      topicNumber += 1;
      nextTopic = `新しいチャット ${topicNumber}`;
    }

    setChatHistory((prev) => {
      const nextHistory = {
        ...prev,
        [nextTopic]: [SYSTEM_PROMPT],
      };
      saveHistory(nextHistory);
      return nextHistory;
    });
    setCurrentTopic(nextTopic);
  };

  const makeTopicTitle = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) {
      return DEFAULT_TOPIC_NAME;
    }

    return trimmed.slice(0, 60).trimEnd() || DEFAULT_TOPIC_NAME;
  };

  const deleteMessage = (index: number) => {
    if (!confirm('このメッセージを削除します。よろしいですか？')) {
      return;
    }

    const safeMessages = getTopicMessages(currentTopic);
    const newMessages = safeMessages.filter((_, messageIndex) => messageIndex !== index);

    setChatHistory((prev) => {
      const nextHistory = {
        ...prev,
        [currentTopic]: newMessages.length > 0 ? newMessages : [SYSTEM_PROMPT],
      };
      saveHistory(nextHistory);
      return nextHistory;
    });
  };

  const copyMessage = async (content: string, index: number) => {
    try {
      const copyableContent = content
        .replace(new RegExp(`\\n\\n${ANSWER_SEPARATOR}\\n*${ANSWER_CLOSING}\\.?$`), '')
        .trimEnd();
      await navigator.clipboard.writeText(copyableContent);
      setCopiedMessageIndex(index);
      window.setTimeout(() => {
        setCopiedMessageIndex((currentIndex) => (currentIndex === index ? null : currentIndex));
      }, 2000);
    } catch (error) {
      console.error('回答のコピーに失敗しました:', error);
    }
  };

  const copyCodeBlock = async (code: string, codeIndex: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedMessageIndex(codeIndex);
      window.setTimeout(() => {
        setCopiedMessageIndex((currentIndex) => (currentIndex === codeIndex ? null : currentIndex));
      }, 2000);
    } catch (error) {
      console.error('ソースコードのコピーに失敗しました:', error);
    }
  };

  const renderAssistantText = (text: string, keyPrefix: string) => {
    return (
      <span key={keyPrefix} className="whitespace-pre-wrap">
        {text}
      </span>
    );
  };

  const renderAssistantContent = (content: string, messageIndex: number) => {
    const displayContent = content
      .replace(new RegExp(`\\n\\n${ANSWER_SEPARATOR}\\n*${ANSWER_CLOSING}\\.?$`), '')
      .trimEnd();
    const sections = displayContent.split(/```([^\n]*)\n?([\s\S]*?)```/g);
    let renderedContent: React.ReactNode;

    if (sections.length === 1) {
      renderedContent = <p className="whitespace-pre-wrap text-sm">{renderAssistantText(content, `message-${messageIndex}`)}</p>;
    } else {
      const renderedSections = [];
      let codeBlockIndex = 0;

      for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
        if (sectionIndex % 3 === 0) {
          if (sections[sectionIndex]) {
            renderedSections.push(
              <p key={`text-${sectionIndex}`} className="whitespace-pre-wrap text-sm">
                {renderAssistantText(sections[sectionIndex], `message-${messageIndex}-${sectionIndex}`)}
              </p>,
            );
          }
          continue;
        }

        if (sectionIndex % 3 === 1) {
          continue;
        }

        const code = sections[sectionIndex].replace(/^\n|\n$/g, '');
        const copyIndex = messageIndex * 1000 + codeBlockIndex;
        codeBlockIndex += 1;
        renderedSections.push(
          <div key={`code-${sectionIndex}`} className="my-3 overflow-hidden rounded-lg bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2 text-xs text-gray-300">
              <span>ソースコード</span>
              <button
                type="button"
                onClick={() => void copyCodeBlock(code, copyIndex)}
                className="text-gray-300 underline hover:text-white"
              >
                {copiedMessageIndex === copyIndex ? 'コピー済み' : 'コードをコピー'}
              </button>
            </div>
            <pre className="overflow-x-auto p-3 text-xs leading-5 text-gray-100">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      renderedContent = renderedSections;
    }

    return (
      <>
        {renderedContent}
        <div className="mt-4 flex flex-col items-start gap-1 text-sm">
          <span>{ANSWER_SEPARATOR}</span>
          <span className="inline-flex items-center gap-2">
            <span>{ANSWER_CLOSING}</span>
            <Image src="/samurai-avatar.svg" alt="Ful衛門" width={24} height={24} className="h-6 w-6" />
          </span>
        </div>
      </>
    );
  };

  const renameTopic = (oldTopicName: string) => {
    const nextName = window.prompt('トピック名を入力してください', oldTopicName);
    if (nextName === null) {
      return;
    }

    const trimmedName = nextName.trim();
    if (!trimmedName) {
      return;
    }

    setChatHistory((prev) => {
      if (!prev[oldTopicName]) {
        return prev;
      }

      const { [oldTopicName]: topicMessages, ...rest } = prev;
      const nextHistory = {
        ...rest,
        [trimmedName]: topicMessages,
      };
      saveHistory(nextHistory);
      return nextHistory;
    });

    if (currentTopic === oldTopicName) {
      setCurrentTopic(trimmedName);
    }
  };

  const deleteTopic = (topicName: string) => {
    const confirmMessage = `「${topicName}」を削除しますか？\nこのチャットの履歴は元に戻せません。`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setChatHistory((prev) => {
      const rest = Object.fromEntries(
        Object.entries(prev).filter(([topic]) => topic !== topicName),
      );
      const nextHistory = rest;

      if (Object.keys(nextHistory).length === 0) {
        const fallbackHistory = {
          [DEFAULT_TOPIC_NAME]: [SYSTEM_PROMPT],
        };
        saveHistory(fallbackHistory);
        setCurrentTopic(DEFAULT_TOPIC_NAME);
        return fallbackHistory;
      }

      saveHistory(nextHistory);

      if (currentTopic === topicName) {
        const nextTopic = Object.keys(nextHistory)[0];
        setCurrentTopic(nextTopic);
      }

      return nextHistory;
    });
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {isSidebarOpen && (
        <div className="w-96 bg-white p-6 shadow-xl border-r border-gray-200 flex flex-col">
          <h2 className="text-xl font-bold mb-6 text-blue-700">📚 チャット履歴</h2>

          <button
            type="button"
            onClick={addNewTopic}
            className="mb-4 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            ＋ 新しいチャットを追加
          </button>

          <div className="space-y-2 overflow-y-auto overflow-x-hidden h-[calc(100vh-200px)]">
            {Object.keys(chatHistory).map((topic) => (
              <div
                key={topic}
                className={`flex items-center gap-2 rounded-lg border ${
                  currentTopic === topic
                    ? 'border-blue-200 bg-blue-100'
                    : 'border-transparent bg-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => loadTopic(topic)}
                  className="flex-1 overflow-hidden wrap-break-word text-left p-3 rounded-lg text-sm leading-6 transition duration-150 hover:bg-gray-50"
                >
                  {topic === DEFAULT_TOPIC_NAME ? '新規チャット開始' : topic}
                </button>

                <button
                  type="button"
                  onClick={() => renameTopic(topic)}
                  className="group relative flex h-8 w-8 items-center justify-center rounded-md text-sm text-gray-600 transition hover:bg-blue-100 hover:text-blue-700"
                  aria-label={`${topic} の名前を変更`}
                  title="名前を編集"
                >
                  <span className="text-base">✏️</span>
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                    名前を編集
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => deleteTopic(topic)}
                  className="group relative flex h-8 w-8 items-center justify-center rounded-md text-sm text-red-500 transition hover:bg-red-100 hover:text-red-700"
                  aria-label={`${topic} を削除`}
                  title="チャットを削除"
                >
                  <span className="text-base">🗑️</span>
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-red-600 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                    チャットを削除
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <header className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xl text-gray-700 transition hover:bg-gray-100"
              aria-label={isSidebarOpen ? 'チャット履歴を閉じる' : 'チャット履歴を開く'}
              title={isSidebarOpen ? 'チャット履歴を閉じる' : 'チャット履歴を開く'}
            >
              ☰
            </button>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold text-blue-700">
              <Image src="/samurai-avatar.svg" alt="侍姿のFul衛門" width={40} height={40} className="h-10 w-10" />
              <span>Ful衛門 Ver.ローカルLLM</span>
            </h1>
          </div>
          <span className="text-sm text-gray-500 font-mono bg-gray-100 px-3 py-1 rounded">
            トピック: {currentTopic}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto p-6 bg-white rounded-xl shadow-lg mb-6 border border-gray-200 max-h-[70vh]">
          {currentMessages.map((msg, index) => {
            if (msg.role === 'system') {
              return null;
            }

            return (
              <div key={`${msg.role}-${index}`} className={`flex mb-6 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-xl shadow-md ${getMessageClass(msg.role)}`}>
                  <strong className="text-xs font-medium block mb-1">
                    {msg.role === 'user' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Image src="/user-avatar.svg" alt="" width={20} height={20} className="h-5 w-5" />
                        あなた
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Image src="/samurai-avatar.svg" alt="" width={20} height={20} className="h-5 w-5" />
                        Ful衛門
                      </span>
                    )}
                  </strong>
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap text-sm">{getDisplayContent(msg)}</p>
                  ) : (
                    renderAssistantContent(msg.content, index)
                  )}
                  {msg.role === 'assistant' && (
                    <div className="mt-2 flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => void copyMessage(msg.content, index)}
                        className="text-gray-500 underline hover:text-blue-600"
                      >
                        {copiedMessageIndex === index ? 'コピー済み' : 'コピー'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMessage(index)}
                        className="text-red-400 underline hover:text-red-600"
                      >
                        削除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start mb-6">
              <div className="p-4 bg-gray-200 rounded-xl shadow-md animate-pulse">
                <strong className="flex items-center gap-1.5 text-sm mb-1">
                  <Image src="/samurai-avatar.svg" alt="" width={24} height={24} className="h-6 w-6" />
                  Ful衛門が思考中...
                </strong>
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSend}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isLoading) {
              setIsDraggingFiles(true);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.currentTarget === e.target) {
              setIsDraggingFiles(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingFiles(false);
            if (!isLoading) {
              void addFiles(e.dataTransfer.files);
            }
          }}
          className={`p-2 bg-white rounded-xl shadow-lg border ${
            isDraggingFiles ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
          }`}
        >
          {attachedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 px-1">
              {attachedFiles.map((file) => (
                <span
                  key={file.id}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
                >
                  <span>{file.kind === 'image' ? '🖼️' : '📄'} {file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachedFile(file.id)}
                    className="font-bold text-gray-400 hover:text-red-600"
                    aria-label={`${file.name} を削除`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {fileError && (
            <p className="mb-2 px-1 text-xs text-red-600">{fileError}</p>
          )}

          <div className="flex gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={FILE_INPUT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  void addFiles(e.target.files);
                }
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="flex items-center justify-center rounded-lg border border-gray-300 bg-gray-50 px-4 py-4 text-xl text-gray-700 transition hover:bg-gray-100 disabled:bg-gray-50"
              aria-label="ファイルを添付"
              title="ファイルを添付"
            >
              ＋
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isDraggingFiles ? 'ここにファイルをドロップ...' : '質問を入力、またはファイルを添付...'}
              disabled={isLoading}
              className="flex-1 p-4 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-50 text-base"
            />
            <button
              type={isLoading ? 'button' : 'submit'}
              onClick={isLoading ? () => abortControllerRef.current?.abort() : undefined}
              disabled={!isLoading && (!input.trim() && attachedFiles.length === 0)}
              className={`px-8 py-4 rounded-lg transition font-semibold shadow-md hover:shadow-lg ${
                isLoading
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400'
              }`}
              aria-label={isLoading ? '質問を中断' : '質問を送信'}
            >
              {isLoading ? '中断' : '送信'}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2 text-sm text-gray-700">
            <label htmlFor="model-select" className="font-medium">AIモデル</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none"
            >
              {AVAILABLE_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
        </form>
      </div>
    </div>
  );
}
