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
}
