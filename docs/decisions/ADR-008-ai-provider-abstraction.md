# ADR-008: AI provider abstraction

## Status

Accepted

## Decision

All interactions with generative AI and Large Language Models are encapsulated behind an **AI Provider Abstraction** (`AiProvider`).

Domain logic must never import vendor-specific SDKs (Google GenAI, OpenAI, Anthropic, Ollama) directly. Instead, domain packages invoke specialized task interfaces:

1. **Extraction**: Structured information extraction from syllabi, question banks, and notes into typed schemas (e.g. Zod).
2. **Reasoning**: Multi-step step-by-step logic and synthesis (e.g. assessing prerequisite dependencies).
3. **Generation**: Content synthesis, draft document preparation, and mock question composition (with mandatory citation tags).
4. **Classification**: Semantic classification of academic topics and intent routing.
5. **Agent Orchestration**: Tool invocation proposals, schema verification, and state transition loops.

**Strict principles:**

- All AI responses consumed by the system must validate against strict, runtime-enforced schemas.
- Retrieved document text must be handled as **data**, not execution instructions (prompt injection mitigation).
- The system must support mock/stub providers in tests (`AI_PROVIDER=stub`) to enable fully offline, deterministic unit and integration test runs.
- The model proposes tool arguments only; it has zero direct authority over database mutations, authorization decisions, or external network actions.

## Alternatives considered

- **Direct vendor SDK calls throughout codebase**: Creates tight coupling to a single cloud provider, makes provider switching costly, and leaks vendor schemas into application code.
- **LangChain / LlamaIndex**: Heavy abstractions with rapid breaking changes, excessive hidden dependencies, and unpredictable runtime magic that violates our "simple, explicit architecture" rule.
- **Unstructured raw text generation**: Unsafe and brittle for software contracts; creates parsing bugs and hallucinated structures.

## Reason

A clean provider interface isolates vendor volatility, guarantees structured outputs, and allows easy swapping between Gemini, OpenAI, Claude, or local models without rewriting business domain code.

## Consequences

- Environment variables: `AI_PROVIDER` (stub | gemini | openai), `AI_PROVIDER_KEY`, `AI_MODEL`.
- Tests run fast and cost-free using the stub provider.
- Any ungrounded claims or schema mismatch immediately triggers an explicit error or agent abstain step.

## Reversal conditions

Only replace this abstraction if an industry-standard vendor-neutral interface (e.g., standard AI SDK) meets all typing, schema validation, and citation requirements without bloat.
