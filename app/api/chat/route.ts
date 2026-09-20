// app/api/chat/route.ts

import { NextResponse } from 'next/server';
import { Agent, fetch as ollamaFetch } from 'undici';

// メッセージの型を定義し、TypeScriptの型安全性を確保します
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
}

interface OllamaResponse {
  message?: {
    content?: string;
  };
  content?: string;
}

const OLLAMA_TIMEOUT_MS = 15 * 60 * 1000;
const ollamaDispatcher = new Agent({
  headersTimeout: OLLAMA_TIMEOUT_MS,
  bodyTimeout: OLLAMA_TIMEOUT_MS,
});

/**
 * Ollama APIと通信し、チャットの応答を返すAPIエンドポイント
 * 参考: crystal-method.com/blog/ollama-api/ の /api/chat エンドポイント仕様に準拠
 * 
 * @param request - クライアントからのリクエスト
 * @returns Ollamaからの応答を含むJSON
 */
export async function POST(request: Request) {
  try {
    // クライアントから送信されたデータを受け取ります
    const { messages, model } = await request.json();

    const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
    const ollamaUrl = `${ollamaBaseUrl}/api/chat`;

    // Ollamaサーバーにリクエストを送信
    const response = await ollamaFetch(ollamaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      dispatcher: ollamaDispatcher,
      signal: request.signal,
      // Ollama APIの仕様に合わせてデータを構築します
      body: JSON.stringify({
        model: model,
        // ★ 修正点: クライアント側のroleをOllamaが期待する 'system', 'user', 'assistant' にマッピング
        messages: messages.map((m: Message) => ({
          role: m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant',
          content: m.content,
          ...(m.images?.length ? { images: m.images } : {}),
        })),
        options: {
          num_ctx: 32768,
          num_predict: 8192,
        },
        stream: false, // 一括でレスポンスを取得するため stream: false を指定
      }),
    });

    // Ollama APIからのレスポンスがエラーコードだった場合
    if (!response.ok) {
      const errorText = await response.text(); 
      
      return NextResponse.json({ 
        error: `Ollama APIエラーが発生しました。Ollamaが起動しているか確認してください。詳細: ${errorText}` 
      }, { status: response.status });
    }

    // 正常なレスポンスの場合、JSONとして解析
    const data = await response.json() as OllamaResponse;

    // AIの応答テキストを返却
    const answer = data.message?.content || data.content || '';
    return NextResponse.json({ response: answer });

  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }

    // ネットワーク接続や、JSON解析などの予期せぬエラーを捕捉
    console.error('Ollama API呼び出し中にエラーが発生しました:', error);

    if (error instanceof Error && error.cause instanceof Error && 'code' in error.cause) {
      const errorCode = String(error.cause.code);
      if (errorCode === 'UND_ERR_HEADERS_TIMEOUT') {
        return NextResponse.json(
          { error: 'Ollamaの応答が15分を超えました。軽量モデルを選ぶか、質問・添付内容を短くしてください。' },
          { status: 504 },
        );
      }
    }
    
    // サーバー側の予期せぬエラーとしてクライアントに通知
    return NextResponse.json({ error: '内部処理エラー: Ollamaサーバーとの通信に失敗しました。' }, { status: 500 });
  }
}
