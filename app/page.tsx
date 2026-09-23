'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { Message, AttachedFile, AgentMode, CodeFile } from '@/types/chat';
import {
  AVAILABLE_MODELS,
  GENERAL_SYSTEM_PROMPT,
  CODING_AGENT_SYSTEM_PROMPT,
  ANSWER_SEPARATOR,
  GENERAL_ANSWER_CLOSING,
  CODING_ANSWER_CLOSING,
  QuickAction,
} from '@/lib/prompts';
import { extractCodeFiles } from '@/lib/codeExtractor';
import QuickActions from '@/components/QuickActions';
import CodingWorkspace from '@/components/CodingWorkspace';

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

const DEFAULT_TOPIC_NAME = '新しいチャット';

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
    [DEFAULT_TOPIC_NAME]: [GENERAL_SYSTEM_PROMPT],
  });

  const [topicModes, setTopicModes] = useState<Record<string, AgentMode>>({
    [DEFAULT_TOPIC_NAME]: 'general',
  });

  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [fileError, setFileError] = useState('');
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(AVAILABLE_MODELS[0].id);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTopic, setCurrentTopic] = useState<string>(DEFAULT_TOPIC_NAME);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(true);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);

  // ワークスペース内の編集されたファイル状態のオーバーライド
  const [workspaceOverrides, setWorkspaceOverrides] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentMode: AgentMode = topicModes[currentTopic] || 'general';
  const selectableModels = currentMode === 'coding'
    ? AVAILABLE_MODELS.filter((model) => model.isCodingSpecialized)
    : AVAILABLE_MODELS;
  
  useEffect(() => {
    if (currentMode !== 'coding' || selectableModels.some((model) => model.id === selectedModel)) {
      return;
    }
  
    setSelectedModel(selectableModels[0]?.id ?? AVAILABLE_MODELS[0].id);
  }, [currentMode, selectableModels, selectedModel]);

  // 履歴の初期ロード
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const savedHistory = window.localStorage.getItem('ai-chat-history');
      const savedModes = window.localStorage.getItem('ai-chat-modes');

      let parsedHistory: Record<string, Message[]> = {
        [DEFAULT_TOPIC_NAME]: [GENERAL_SYSTEM_PROMPT],
      };

      if (savedHistory) {
        parsedHistory = JSON.parse(savedHistory) as Record<string, Message[]>;
      }

      let parsedModes: Record<string, AgentMode> = {
        [DEFAULT_TOPIC_NAME]: 'general',
      };

      if (savedModes) {
        parsedModes = JSON.parse(savedModes) as Record<string, AgentMode>;
      }

      // 「起動時は新規の会話状態で起動」: 未送信の空トピックを探すか、無ければ作成
      const existingTopics = Object.keys(parsedHistory);
      const emptyTopic = existingTopics.find((topic) => {
        const msgs = parsedHistory[topic];
        return Array.isArray(msgs) && (msgs.length === 0 || (msgs.length === 1 && msgs[0]?.role === 'system'));
      });

      let initialTopic: string;
      if (emptyTopic) {
        initialTopic = emptyTopic;
      } else {
        let topicNumber = 1;
        let nextTopic = DEFAULT_TOPIC_NAME;
        while (existingTopics.includes(nextTopic)) {
          topicNumber += 1;
          nextTopic = `新しいチャット ${topicNumber}`;
        }
        initialTopic = nextTopic;
        parsedHistory[initialTopic] = [GENERAL_SYSTEM_PROMPT];
        parsedModes[initialTopic] = 'general';
      }

      setChatHistory(parsedHistory);
      setTopicModes(parsedModes);
      setCurrentTopic(initialTopic);

    } catch (error) {
      console.error('履歴の読み込み中にエラーが発生しました:', error);
      setChatHistory({ [DEFAULT_TOPIC_NAME]: [GENERAL_SYSTEM_PROMPT] });
      setTopicModes({ [DEFAULT_TOPIC_NAME]: 'general' });
      setCurrentTopic(DEFAULT_TOPIC_NAME);
    }
  }, []);

  const saveHistory = useCallback((history: Record<string, Message[]>, modes?: Record<string, AgentMode>) => {
    if (typeof window !== 'undefined') {
      const historyWithoutImages = Object.fromEntries(
        Object.entries(history).map(([topic, messages]) => [
          topic,
          messages.map(({ role, content, displayContent }) => ({ role, content, displayContent })),
        ]),
      );
      window.localStorage.setItem('ai-chat-history', JSON.stringify(historyWithoutImages));

      if (modes) {
        window.localStorage.setItem('ai-chat-modes', JSON.stringify(modes));
      }
    }
  }, []);

  const getTopicSystemPrompt = useCallback((mode: AgentMode): Message => {
    return mode === 'coding' ? CODING_AGENT_SYSTEM_PROMPT : GENERAL_SYSTEM_PROMPT;
  }, []);

  const getTopicMessages = useCallback(
    (topicName: string): Message[] => {
      const topicMessages = chatHistory[topicName];
      const mode = topicModes[topicName] || 'general';
      const prompt = getTopicSystemPrompt(mode);
      return Array.isArray(topicMessages) && topicMessages.length >= 0 ? topicMessages : [prompt];
    },
    [chatHistory, getTopicSystemPrompt, topicModes],
  );

  const currentMessages = getTopicMessages(currentTopic);

  // トピックのメッセージ群から最新のコードファイルを抽出
  const extractedFiles = useMemo(() => {
    const assistantMessages = currentMessages.filter((m) => m.role === 'assistant');
    if (assistantMessages.length === 0) return [];

    // 最新のメッセージから順にコードを抽出し、パスまたは名前で最新版を統合
    const fileMap = new Map<string, CodeFile>();

    for (let i = assistantMessages.length - 1; i >= 0; i--) {
      const filesInMsg = extractCodeFiles(assistantMessages[i].content);
      for (const f of filesInMsg) {
        if (!fileMap.has(f.path)) {
          fileMap.set(f.path, f);
        }
      }
    }

    const files = Array.from(fileMap.values());

    // ユーザーによる編集オーバーライドを適用
    return files.map((f) => ({
      ...f,
      content: workspaceOverrides[f.id] !== undefined ? workspaceOverrides[f.id] : f.content,
    }));
  }, [currentMessages, workspaceOverrides]);

  const handleUpdateWorkspaceFile = useCallback((fileId: string, updatedContent: string) => {
    setWorkspaceOverrides((prev) => ({
      ...prev,
      [fileId]: updatedContent,
    }));
  }, []);

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

  const makeTopicTitle = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) {
      return DEFAULT_TOPIC_NAME;
    }
    return trimmed.slice(0, 60).trimEnd() || DEFAULT_TOPIC_NAME;
  };

  const handleSend = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      if (isLoading) return;

      const userMessage = buildUserMessage(input, attachedFiles);
      if (!userMessage.content.trim()) return;

      const historyBeforeSend = getTopicMessages(currentTopic);
      const isInitialTopic = historyBeforeSend.length === 1 && historyBeforeSend[0]?.role === 'system';
      const activeTopicName = isInitialTopic
        ? makeTopicTitle(input.trim() || attachedFiles[0]?.name || DEFAULT_TOPIC_NAME)
        : currentTopic;

      // 初回送信時にシステムプロンプトを最新のモードに合わせて確実に設定
      const systemPromptForSend = getTopicSystemPrompt(currentMode);
      const preparedHistory = isInitialTopic
        ? [systemPromptForSend]
        : historyBeforeSend;

      setChatHistory((prev) => {
        const topicMessages = isInitialTopic
          ? [systemPromptForSend]
          : (Array.isArray(prev[activeTopicName]) ? prev[activeTopicName] : [systemPromptForSend]);

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
        setTopicModes((prev) => {
          const nextModes = { ...prev, [activeTopicName]: currentMode };
          if (activeTopicName !== currentTopic) {
            delete nextModes[currentTopic];
          }
          saveHistory(chatHistory, nextModes);
          return nextModes;
        });
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
            messages: [...preparedHistory, userMessage],
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
          const topicMessages = Array.isArray(prev[targetTopic])
            ? prev[targetTopic]
            : [systemPromptForSend];
          const nextHistory = {
            ...prev,
            [targetTopic]: [...topicMessages, aiMessage],
          };
          saveHistory(nextHistory);
          return nextHistory;
        });

        // コーディングモードかつコードが含まれている場合はワークスペースを開く
        if (currentMode === 'coding') {
          setIsWorkspaceOpen(true);
        }
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
          const topicMessages = Array.isArray(prev[targetTopic])
            ? prev[targetTopic]
            : [systemPromptForSend];
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
    [
      attachedFiles,
      chatHistory,
      currentMode,
      currentTopic,
      getTopicMessages,
      getTopicSystemPrompt,
      input,
      isLoading,
      saveHistory,
      selectedModel,
    ],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSend();
    }
  };

  const switchMode = (newMode: AgentMode) => {
    if (currentMode === newMode) return;

    setTopicModes((prev) => {
      const nextModes = { ...prev, [currentTopic]: newMode };
      saveHistory(chatHistory, nextModes);
      return nextModes;
    });

    // システムプロンプトを先頭で更新
    setChatHistory((prev) => {
      const existing = prev[currentTopic] || [];
      const updatedPrompt = getTopicSystemPrompt(newMode);
      let nextMessages: Message[];

      if (existing.length > 0 && existing[0]?.role === 'system') {
        nextMessages = [updatedPrompt, ...existing.slice(1)];
      } else {
        nextMessages = [updatedPrompt, ...existing];
      }

      const nextHistory = { ...prev, [currentTopic]: nextMessages };
      saveHistory(nextHistory);
      return nextHistory;
    });

    if (newMode === 'coding') {
      setIsWorkspaceOpen(true);
    }
  };

  const handleSelectQuickAction = (action: QuickAction) => {
    const template = action.promptTemplate();
    setInput(template);
    inputRef.current?.focus();
  };

  const getMessageClass = (role: Message['role']) => {
    if (role === 'user') {
      return 'bg-blue-600 text-white self-end rounded-br-none shadow-md';
    }
    if (role === 'assistant') {
      return currentMode === 'coding'
        ? 'bg-slate-800 text-slate-100 border border-slate-700 self-start rounded-tl-none shadow-lg'
        : 'bg-gray-200 text-gray-800 self-start rounded-tl-none shadow-md';
    }
    if (role === 'system') {
      return 'bg-indigo-100 text-indigo-800 self-start border-l-4 border-indigo-400 text-xs italic';
    }
    return 'bg-gray-100';
  };

  const loadTopic = (topicName: string) => {
    const normalizedTopic = topicName.trim();
    if (!normalizedTopic) return;

    const mode = topicModes[normalizedTopic] || 'general';
    const prompt = getTopicSystemPrompt(mode);

    setChatHistory((prev) => {
      const existingMessages = Array.isArray(prev[normalizedTopic]) ? prev[normalizedTopic] : [prompt];
      return {
        ...prev,
        [normalizedTopic]: existingMessages,
      };
    });

    setCurrentTopic(normalizedTopic);
  };

  const addNewTopic = (mode: AgentMode = currentMode) => {
    const existingTopics = Object.keys(chatHistory);
    let topicNumber = 1;
    let nextTopic = mode === 'coding' ? '新しいコーディングタスク' : DEFAULT_TOPIC_NAME;

    while (existingTopics.includes(nextTopic)) {
      topicNumber += 1;
      nextTopic = mode === 'coding' ? `コーディングタスク ${topicNumber}` : `新しいチャット ${topicNumber}`;
    }

    const newPrompt = getTopicSystemPrompt(mode);

    setTopicModes((prev) => {
      const nextModes = { ...prev, [nextTopic]: mode };
      saveHistory(chatHistory, nextModes);
      return nextModes;
    });

    setChatHistory((prev) => {
      const nextHistory = {
        ...prev,
        [nextTopic]: [newPrompt],
      };
      saveHistory(nextHistory);
      return nextHistory;
    });

    setCurrentTopic(nextTopic);
    setInput('');
    setAttachedFiles([]);
    setFileError('');
    if (mode === 'coding') {
      setIsWorkspaceOpen(true);
    }
  };

  const deleteMessage = (index: number) => {
    if (!confirm('このメッセージを削除します。よろしいですか？')) {
      return;
    }

    const safeMessages = getTopicMessages(currentTopic);
    const newMessages = safeMessages.filter((_, messageIndex) => messageIndex !== index);
    const mode = topicModes[currentTopic] || 'general';
    const prompt = getTopicSystemPrompt(mode);

    setChatHistory((prev) => {
      const nextHistory = {
        ...prev,
        [currentTopic]: newMessages.length > 0 ? newMessages : [prompt],
      };
      saveHistory(nextHistory);
      return nextHistory;
    });
  };

  const copyMessage = async (content: string, index: number) => {
    try {
      const copyableContent = content
        .replace(new RegExp(`\\n\\n${ANSWER_SEPARATOR}\\n*(${GENERAL_ANSWER_CLOSING}|${CODING_ANSWER_CLOSING})\\.?$`), '')
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
    const isCoding = currentMode === 'coding';
    const displayContent = content
      .replace(new RegExp(`\\n\\n${ANSWER_SEPARATOR}\\n*(${GENERAL_ANSWER_CLOSING}|${CODING_ANSWER_CLOSING})\\.?$`), '')
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
              <p key={`text-${sectionIndex}`} className="whitespace-pre-wrap text-sm leading-relaxed">
                {renderAssistantText(sections[sectionIndex], `message-${messageIndex}-${sectionIndex}`)}
              </p>,
            );
          }
          continue;
        }

        if (sectionIndex % 3 === 1) {
          continue;
        }

        const rawHeader = sections[sectionIndex - 1]?.trim() || '';
        const code = sections[sectionIndex].replace(/^\n|\n$/g, '');
        const copyIndex = messageIndex * 1000 + codeBlockIndex;
        codeBlockIndex += 1;

        renderedSections.push(
          <div key={`code-${sectionIndex}`} className="my-3 overflow-hidden rounded-lg bg-gray-950 border border-gray-800 shadow-md">
            <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2 text-xs text-gray-300">
              <div className="flex items-center gap-2 font-mono">
                <span className="text-indigo-400">📄 {rawHeader || 'コード'}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsWorkspaceOpen(true)}
                  className="text-indigo-300 hover:text-indigo-100 transition text-[11px] underline"
                >
                  ワークスペースで開く
                </button>
                <button
                  type="button"
                  onClick={() => void copyCodeBlock(code, copyIndex)}
                  className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs transition"
                >
                  {copiedMessageIndex === copyIndex ? 'コピー済み' : 'コピー'}
                </button>
              </div>
            </div>
            <pre className="overflow-x-auto p-3 text-xs leading-5 text-gray-100 font-mono">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      renderedContent = renderedSections;
    }

    const answerClosing = isCoding ? CODING_ANSWER_CLOSING : GENERAL_ANSWER_CLOSING;

    return (
      <>
        {renderedContent}
        <div className="mt-4 flex flex-col items-start gap-1 text-sm border-t border-gray-300/30 pt-3">
          <span className="text-gray-400 text-xs">{ANSWER_SEPARATOR}</span>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
            <span>{answerClosing}</span>
            <Image src="/samurai-avatar.svg" alt="Ful衛門" width={20} height={20} className="h-5 w-5" />
          </span>
        </div>
      </>
    );
  };

  const renameTopic = (oldTopicName: string) => {
    const nextName = window.prompt('トピック名を入力してください', oldTopicName);
    if (nextName === null) return;

    const trimmedName = nextName.trim();
    if (!trimmedName) return;

    setChatHistory((prev) => {
      if (!prev[oldTopicName]) return prev;
      const { [oldTopicName]: topicMessages, ...rest } = prev;
      const nextHistory = { ...rest, [trimmedName]: topicMessages };
      saveHistory(nextHistory);
      return nextHistory;
    });

    setTopicModes((prev) => {
      const mode = prev[oldTopicName] || 'general';
      const { [oldTopicName]: _, ...rest } = prev;
      const nextModes = { ...rest, [trimmedName]: mode };
      saveHistory(chatHistory, nextModes);
      return nextModes;
    });

    if (currentTopic === oldTopicName) {
      setCurrentTopic(trimmedName);
    }
  };

  const deleteTopic = (topicName: string) => {
    const confirmMessage = `「${topicName}」を削除しますか？\nこのチャットの履歴は元に戻せません。`;
    if (!window.confirm(confirmMessage)) return;

    setChatHistory((prev) => {
      const rest = Object.fromEntries(
        Object.entries(prev).filter(([topic]) => topic !== topicName),
      );
      const nextHistory = rest;

      if (Object.keys(nextHistory).length === 0) {
        const fallbackHistory = {
          [DEFAULT_TOPIC_NAME]: [GENERAL_SYSTEM_PROMPT],
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

    setTopicModes((prev) => {
      const nextModes = { ...prev };
      delete nextModes[topicName];
      return nextModes;
    });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100 font-sans">
      {/* 左サイドバー: トピック管理 */}
      {isSidebarOpen && (
        <aside className="w-80 bg-white p-4 shadow-xl border-r border-gray-200 flex flex-col shrink-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <span>📚 会話履歴</span>
            </h2>
            <button
              type="button"
              onClick={() => addNewTopic(currentMode)}
              className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 active:scale-95"
              title="新規の会話を開始"
            >
              <span>＋ 新規</span>
            </button>
          </div>

          {/* 新規の会話ボタン（メイン） */}
          <button
            type="button"
            onClick={() => addNewTopic(currentMode)}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99]"
          >
            <span className="text-base">✨</span>
            <span>新規の会話を開始</span>
          </button>

          {/* モード別新規作成ボタン */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => addNewTopic('general')}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 shadow-xs"
            >
              <span>💬 通常チャット</span>
            </button>
            <button
              type="button"
              onClick={() => addNewTopic('coding')}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 shadow-xs"
            >
              <span>🛠️ 技師モード</span>
            </button>
          </div>

          {/* トピックリスト */}
          <div className="space-y-1.5 overflow-y-auto flex-1 pr-1 scrollbar-thin">
            {Object.keys(chatHistory).map((topic) => {
              const mode = topicModes[topic] || 'general';
              const isSelected = currentTopic === topic;
              return (
                <div
                  key={topic}
                  className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition ${
                    isSelected
                      ? mode === 'coding'
                        ? 'border-indigo-300 bg-indigo-50/80 font-semibold text-indigo-900 shadow-xs'
                        : 'border-blue-300 bg-blue-50/80 font-semibold text-blue-900 shadow-xs'
                      : 'border-transparent text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => loadTopic(topic)}
                    className="flex-1 overflow-hidden text-left truncate flex items-center gap-2 py-1"
                    title={topic}
                  >
                    <span className="text-sm shrink-0">
                      {mode === 'coding' ? '🛠️' : '💬'}
                    </span>
                    <span className="truncate">{topic === DEFAULT_TOPIC_NAME ? '新規チャット開始' : topic}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => renameTopic(topic)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-600 transition"
                    title="名前を編集"
                  >
                    ✏️
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteTopic(topic)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition"
                    title="削除"
                  >
                    🗑️
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* メインエリア（チャット + ワークスペース） */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* ヘッダー */}
        <header className="px-4 py-2.5 bg-white border-b border-gray-200 flex justify-between items-center shadow-xs shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-base text-gray-700 transition hover:bg-gray-100"
              title={isSidebarOpen ? '履歴を閉じる' : '履歴を開く'}
            >
              ☰
            </button>

            <div className="flex items-center gap-2">
              <Image src="/samurai-avatar.svg" alt="侍姿のFul衛門" width={32} height={32} className="h-8 w-8" />
              <div>
                <h1 className="text-base font-extrabold text-gray-900 leading-none flex items-center gap-2">
                  <span>Ful衛門</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    currentMode === 'coding'
                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                      : 'bg-blue-100 text-blue-800 border border-blue-200'
                  }`}>
                    {currentMode === 'coding' ? '技師（コーディングエージェント）' : '標準モード'}
                  </span>
                </h1>
              </div>
            </div>
          </div>

          {/* 中央: モード切替タブ */}
          <div className="flex items-center rounded-lg bg-gray-100 p-1 border border-gray-200 text-xs">
            <button
              type="button"
              onClick={() => switchMode('general')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
                currentMode === 'general'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>💬</span>
              <span>通常チャット</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('coding')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
                currentMode === 'coding'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>🛠️</span>
              <span>技師エージェント</span>
            </button>
          </div>

          {/* 右側: モデル選択 & ワークスペース開閉 */}
          <div className="flex items-center gap-3">
            {currentMode === 'coding' && (
              <button
                type="button"
                onClick={() => setIsWorkspaceOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                  isWorkspaceOpen
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title="コードワークスペースの表示/非表示"
              >
                <span>🖥️</span>
                <span>ワークスペース {extractedFiles.length > 0 && `(${extractedFiles.length})`}</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="font-medium">モデル:</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs focus:border-indigo-500 focus:outline-none"
              >
                {selectableModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {/* ワークスペースとチャットの2ペインコンテナ */}
        <div className="flex-1 flex overflow-hidden">
          {/* チャットペイン */}
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50">
            {/* メッセージ一覧 */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {currentMessages.map((msg, index) => {
                if (msg.role === 'system') return null;

                return (
                  <div
                    key={`${msg.role}-${index}`}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[90%] md:max-w-[80%] p-4 rounded-xl shadow-xs ${getMessageClass(msg.role)}`}>
                      <strong className="text-xs font-medium block mb-1.5">
                        {msg.role === 'user' ? (
                          <span className="inline-flex items-center gap-1.5 text-blue-100">
                            <Image src="/user-avatar.svg" alt="" width={18} height={18} className="h-4 w-4" />
                            あなた
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-indigo-400 font-semibold">
                            <Image src="/samurai-avatar.svg" alt="" width={18} height={18} className="h-4 w-4" />
                            {currentMode === 'coding' ? 'Ful衛門 技師' : 'Ful衛門'}
                          </span>
                        )}
                      </strong>

                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap text-sm">{getDisplayContent(msg)}</p>
                      ) : (
                        renderAssistantContent(msg.content, index)
                      )}

                      {msg.role === 'assistant' && (
                        <div className="mt-3 flex gap-3 text-xs pt-2 border-t border-gray-400/20">
                          <button
                            type="button"
                            onClick={() => void copyMessage(msg.content, index)}
                            className="text-gray-400 hover:text-indigo-400 underline transition"
                          >
                            {copiedMessageIndex === index ? 'コピー済み' : '全文コピー'}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMessage(index)}
                            className="text-red-400 hover:text-red-500 underline transition"
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
                <div className="flex justify-start">
                  <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-xs animate-pulse">
                    <strong className="flex items-center gap-2 text-xs text-indigo-600 font-semibold">
                      <Image src="/samurai-avatar.svg" alt="" width={20} height={20} className="h-5 w-5" />
                      {currentMode === 'coding' ? 'Ful衛門 技師がコードを構築中...' : 'Ful衛門が思考中...'}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* 下部フォームエリア */}
            <div className="p-3 bg-white border-t border-gray-200">
              {/* コーディングモード時のクイックアクションバー */}
              {currentMode === 'coding' && (
                <div className="mb-2">
                  <QuickActions onSelectAction={handleSelectQuickAction} disabled={isLoading} />
                </div>
              )}

              <form
                onSubmit={handleSend}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isLoading) setIsDraggingFiles(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.currentTarget === e.target) setIsDraggingFiles(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFiles(false);
                  if (!isLoading) void addFiles(e.dataTransfer.files);
                }}
                className={`rounded-xl border p-2 transition ${
                  isDraggingFiles ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-300 bg-white'
                }`}
              >
                {attachedFiles.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                    {attachedFiles.map((file) => (
                      <span
                        key={file.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
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

                <div className="flex gap-2 items-start">
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
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-gray-50 text-xl text-gray-600 transition hover:bg-gray-100 disabled:bg-gray-50 mt-1"
                    title="ファイルを添付（ソースコード、文書、画像）"
                  >
                    ＋
                  </button>
                  <div className="flex-1 flex flex-col gap-1">
                    <textarea
                      ref={inputRef}
                      rows={5}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        currentMode === 'coding'
                          ? 'コーディングタスク・要件を入力、またはファイルを添付... (Enterで改行、Ctrl+Enterで送信)'
                          : '質問を入力、またはファイルを添付... (Enterで改行、Ctrl+Enterで送信)'
                      }
                      disabled={isLoading}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-gray-50 text-sm leading-relaxed resize-y font-sans"
                    />
                    <div className="flex justify-between items-center px-1 text-[11px] text-gray-400">
                      <span>💡 Enter: 改行 / Ctrl+Enter: 送信</span>
                      <span>{input.length} 文字</span>
                    </div>
                  </div>
                  <button
                    type={isLoading ? 'button' : 'submit'}
                    onClick={isLoading ? () => abortControllerRef.current?.abort() : undefined}
                    disabled={!isLoading && (!input.trim() && attachedFiles.length === 0)}
                    className={`h-11 px-6 rounded-lg transition font-semibold text-sm shadow-xs shrink-0 mt-1 ${
                      isLoading
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : currentMode === 'coding'
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400'
                        : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400'
                    }`}
                  >
                    {isLoading ? '中断' : '送信'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* 右ペイン: コーディングエージェント・ワークスペース */}
          {currentMode === 'coding' && isWorkspaceOpen && (
            <div className="w-1/2 min-w-[380px] max-w-[65%] h-full flex flex-col shrink-0">
              <CodingWorkspace
                files={extractedFiles}
                onUpdateFile={handleUpdateWorkspaceFile}
                onClose={() => setIsWorkspaceOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
