import type {
  AiExtractionRequest,
  AiReasoningRequest,
  AiReasoningResponse,
  AiGenerationRequest,
  AiGenerationResponse,
  AiClassificationRequest,
  AiClassificationResponse,
} from '@campusflow/types';

export interface AiProvider {
  extract<T>(request: AiExtractionRequest): Promise<T>;
  reason(request: AiReasoningRequest): Promise<AiReasoningResponse>;
  generate(request: AiGenerationRequest): Promise<AiGenerationResponse>;
  classify(request: AiClassificationRequest): Promise<AiClassificationResponse>;
  checkHealth?(): Promise<{ ok: boolean; message?: string }>;
}

export interface OllamaProviderConfig {
  baseUrl?: string;
  model: string;
}

export class OllamaAiProvider implements AiProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OllamaProviderConfig) {
    this.baseUrl = (config.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
    this.model = config.model;
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/version`);
      if (!res.ok) {
        return { ok: false, message: `Ollama returned status ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResponse> {
    let fullPrompt = request.prompt;
    if (request.contextChunks && request.contextChunks.length > 0) {
      const contextText = request.contextChunks
        .map((c) => `--- SOURCE: ${c.sourceTitle} [ID: ${c.id}] ---\n${c.content}`)
        .join('\n\n');
      fullPrompt = `Based on the following authoritative study context:\n\n${contextText}\n\nAnswer the prompt thoroughly:\n${request.prompt}`;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: fullPrompt,
          system:
            request.systemPrompt ||
            'You are an academic intelligence assistant. Be precise, truthful, and grounded in the provided context.',
          stream: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama generation failed with HTTP ${res.status}`);
      }

      const data = (await res.json()) as { response: string };
      const generatedText = data.response?.trim() || '';

      const citations = request.citationsRequired
        ? request.contextChunks.map((chunk) => ({
            chunkId: chunk.id,
            sourceTitle: chunk.sourceTitle,
            snippet: chunk.content.slice(0, 100),
          }))
        : [];

      return {
        content: generatedText,
        citations,
      };
    } catch (err) {
      throw new Error(`[OllamaAiProvider] Generation error: ${(err as Error).message}`);
    }
  }

  async classify(request: AiClassificationRequest): Promise<AiClassificationResponse> {
    const prompt = `Classify the following text into exactly one of these categories: ${request.categories.join(', ')}.\nText: "${request.input}"\nRespond with ONLY the exact category name.`;
    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama classify failed with HTTP ${res.status}`);
      }

      const data = (await res.json()) as { response: string };
      const raw = data.response?.trim().toLowerCase() || '';

      const matched = request.categories.find(
        (c) => raw.includes(c.toLowerCase()) || c.toLowerCase().includes(raw),
      );

      return {
        category: matched || request.categories[0] || 'unclassified',
        confidence: matched ? 0.85 : 0.5,
      };
    } catch {
      return {
        category: request.categories[0] || 'unclassified',
        confidence: 0.5,
      };
    }
  }

  async reason(request: AiReasoningRequest): Promise<AiReasoningResponse> {
    const prompt = `Analyze this problem:\n${request.problem}\n\nContext:\n${request.context.join('\n')}\n\nProvide step-by-step reasoning followed by a concise conclusion.`;
    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          system: request.systemPrompt,
          stream: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama reasoning failed with HTTP ${res.status}`);
      }

      const data = (await res.json()) as { response: string };
      const content = data.response?.trim() || '';

      return {
        reasoningSteps: [content],
        conclusion: content.slice(-200),
        confidence: 'medium',
      };
    } catch (err) {
      throw new Error(`[OllamaAiProvider] Reasoning error: ${(err as Error).message}`);
    }
  }

  async extract<T>(request: AiExtractionRequest): Promise<T> {
    const prompt = `Extract structured data matching schema "${request.targetSchemaName}" from this text. Output MUST be valid JSON only with no surrounding markdown or explanation.\n\nText:\n${request.content}`;
    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          system: request.systemPrompt,
          format: 'json',
          stream: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama extract failed with HTTP ${res.status}`);
      }

      const data = (await res.json()) as { response: string };
      return JSON.parse(data.response) as T;
    } catch (err) {
      throw new Error(`[OllamaAiProvider] Extraction error: ${(err as Error).message}`);
    }
  }
}

export interface GeminiProviderConfig {
  apiKey: string;
  model: string;
}

export class GeminiAiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: GeminiProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}?key=${this.apiKey}`,
      );
      if (!res.ok) {
        return { ok: false, message: `Gemini API returned status ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResponse> {
    let fullPrompt = request.prompt;
    if (request.contextChunks && request.contextChunks.length > 0) {
      const contextText = request.contextChunks
        .map((c) => `--- SOURCE: ${c.sourceTitle} [ID: ${c.id}] ---\n${c.content}`)
        .join('\n\n');
      fullPrompt = `Context:\n${contextText}\n\nPrompt:\n${request.prompt}`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        systemInstruction: request.systemPrompt
          ? { parts: [{ text: request.systemPrompt }] }
          : undefined,
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const citations = request.citationsRequired
      ? request.contextChunks.map((chunk) => ({
          chunkId: chunk.id,
          sourceTitle: chunk.sourceTitle,
          snippet: chunk.content.slice(0, 100),
        }))
      : [];

    return { content, citations };
  }

  async classify(request: AiClassificationRequest): Promise<AiClassificationResponse> {
    const prompt = `Classify this input into one of: ${request.categories.join(', ')}.\nInput: "${request.input}"\nOutput only the chosen category.`;
    const gen = await this.generate({
      prompt,
      citationsRequired: false,
      contextChunks: [],
    });
    const raw = gen.content.trim().toLowerCase();
    const matched = request.categories.find(
      (c) => raw.includes(c.toLowerCase()) || c.toLowerCase().includes(raw),
    );
    return {
      category: matched || request.categories[0] || 'unclassified',
      confidence: matched ? 0.9 : 0.5,
    };
  }

  async reason(request: AiReasoningRequest): Promise<AiReasoningResponse> {
    const prompt = `Analyze this problem:\n${request.problem}\n\nContext:\n${request.context.join('\n')}`;
    const genReq: AiGenerationRequest = {
      prompt,
      citationsRequired: false,
      contextChunks: [],
    };
    if (request.systemPrompt) {
      genReq.systemPrompt = request.systemPrompt;
    }
    const gen = await this.generate(genReq);
    return {
      reasoningSteps: [gen.content],
      conclusion: gen.content.slice(-200),
      confidence: 'high',
    };
  }

  async extract<T>(request: AiExtractionRequest): Promise<T> {
    const prompt = `Extract JSON adhering to "${request.targetSchemaName}":\n${request.content}`;
    const gen = await this.generate({
      prompt,
      systemPrompt: 'Output raw JSON only with no markdown formatting.',
      citationsRequired: false,
      contextChunks: [],
    });
    return JSON.parse(gen.content) as T;
  }
}

export class StubAiProvider implements AiProvider {
  async extract<T>(_request: AiExtractionRequest): Promise<T> {
    return {} as T;
  }

  async reason(request: AiReasoningRequest): Promise<AiReasoningResponse> {
    return {
      reasoningSteps: [
        `Analyzing context with ${request.context.length} chunks`,
        `Synthesizing problem constraints: ${request.problem.slice(0, 50)}...`,
      ],
      conclusion: 'Reasoning completed deterministically by StubAiProvider.',
      confidence: 'high',
    };
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResponse> {
    const citations = request.citationsRequired
      ? request.contextChunks.map(
          (chunk: { id: string; sourceTitle: string; content: string }) => ({
            chunkId: chunk.id,
            sourceTitle: chunk.sourceTitle,
            snippet: chunk.content.slice(0, 80),
          }),
        )
      : [];

    return {
      content: `[Stub Generated Content for prompt: "${request.prompt}"]`,
      citations,
    };
  }

  async classify(request: AiClassificationRequest): Promise<AiClassificationResponse> {
    const category = request.categories[0] || 'unclassified';
    return {
      category,
      confidence: 1.0,
    };
  }

  async checkHealth(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}

export function createAiProvider(config: {
  provider: 'stub' | 'gemini' | 'openai' | 'ollama';
  model: string;
  apiKey?: string;
  ollamaBaseUrl?: string;
}): AiProvider {
  switch (config.provider) {
    case 'ollama': {
      const ollamaConfig: OllamaProviderConfig = {
        model: config.model,
      };
      if (config.ollamaBaseUrl) {
        ollamaConfig.baseUrl = config.ollamaBaseUrl;
      }
      return new OllamaAiProvider(ollamaConfig);
    }
    case 'gemini':
      if (!config.apiKey) {
        throw new Error('AI_PROVIDER_KEY is required when AI_PROVIDER is "gemini"');
      }
      return new GeminiAiProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    case 'stub':
    default:
      return new StubAiProvider();
  }
}
