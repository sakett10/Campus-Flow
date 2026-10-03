# ADR-007: ML service boundary

## Status

Accepted

## Decision

Machine learning capabilities that require scientific Python libraries (such as NumPy, scikit-learn, PyTorch, or Hugging Face tokenizers) reside in an isolated **Python ML service** (`services/ml`).

The initial ML service is strictly an **interface contract**, not a fake prediction engine or black-box heuristic masquerading as intelligence.

The contract defines typed RPC/HTTP endpoints for:

1. **Question classification**: Bloom level, question type (MCQ, derivation, subjective), numerical difficulty.
2. **Topic classification**: Taxonomy node mapping with confidence score.
3. **Question-family clustering**: Distance and embedding clustering across historical exam papers.
4. **Mastery estimation**: Knowledge-tracing updates based strictly on empirical evidence without fabricated probabilities.
5. **Recommendation**: Prioritization of topics and questions based on mastery gaps and assessment deadlines.
6. **Future prediction experiments**: Research sandboxes that expose uncertainty ranges and state when data is insufficient.

**Strict rules:**

- No fake analytics or fake ML metrics.
- Expose uncertainty explicitly (`confidence_interval`, `sample_size`, `insufficient_data: true`).
- A language model is never treated as the authoritative source for numerical calculations or institutional facts.

## Alternatives considered

- **Node.js ML / ONNX Runtime in TypeScript API**: Node ecosystem lacks mature data science, clustering, and academic NLP libraries; Python remains the industry standard for ML.
- **Single monolithic Python backend (FastAPI/Django)**: Contradicts the TypeScript-by-default engineering rule and modern web ecosystem ergonomics.
- **Mocking ML with random numbers / hardcoded percentages**: Strictly forbidden by engineering ethics and project guidelines.

## Reason

A clean boundary keeps the TypeScript API focused on business rules, permissions, and orchestration while allowing the Python service to evolve its mathematical models independently.

## Consequences

- API communicates with ML service over HTTP (`ML_SERVICE_URL`).
- ML service must not directly access the production database or bypass API authorization.
- Data sent to ML service must be stripped of unnecessary PII.

## Reversal conditions

Merge ML into Node.js only if all required algorithms can run safely in ONNX/WebAssembly without sacrificing accuracy or scientific library ecosystem support.
