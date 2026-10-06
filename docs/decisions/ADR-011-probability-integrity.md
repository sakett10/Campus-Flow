# ADR-011: Probability Integrity Rule

## Status

Accepted

## Context

Many student career products provide pseudo-scientific or fabricated "chance of admission", "acceptance likelihood", or "hiring probability" percentages (e.g. "87% chance of landing Google"). Such percentages are almost universally uncalibrated heuristics, LLM hallucinations, or arbitrary transformations of static checklist match scores.

In high-stakes student outcomes, displaying uncalibrated or fabricated probabilities induces false security, misleading anxiety, or misplaced academic focus. Furthermore, it obscures the difference between:

1. Meeting binary institutional eligibility criteria.
2. Demonstrating technical skills relevant to a job description.
3. Actual competitive candidate hiring outcomes in an unobserved applicant market.

CampusFlow adheres to strict engineering and mathematical ethics: an academic operating system must never present arbitrary numbers or heuristics masquerading as empirical probability distributions.

## Decision

CampusFlow institutes the **Probability Integrity Rule** across all data models, backend engines, ML interfaces, APIs, and client interfaces.

### 1. Mandatory Data Sufficiency Guard

CampusFlow must **never** display a hiring or offer probability unless the prediction is backed by sufficient empirical outcome data and a validated, calibrated statistical model.

If available historical outcome data are insufficient for a statistically defensible probability, CampusFlow **MUST** display:

> **"Probability unavailable: insufficient comparable outcome data."**

Never substitute a heuristic, arbitrary score, LLM confidence, or fabricated percentage for a probability.

### 2. Four Strictly Separated Evaluation Dimensions

The data contracts, domain services, and user interfaces must clearly distinguish:

| Dimension               | Definition                               | What it Measures                                                                                                                                                        | Is it a Probability?                                                          |
| ----------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Eligibility**         | Rule Constraints                         | Binary/conditional rule evaluation against graduation year, degree program, visa authorization, and minimum academic GPA.                                               | **NO.** Being eligible does not estimate hiring likelihood.                   |
| **Role Match**          | Skill Readiness Alignment                | Score (0–100) reflecting coverage and depth of required and preferred skills against stated job descriptions.                                                           | **NO.** High skill alignment does not account for candidate pool competition. |
| **Evidence Confidence** | Evidence Provenance                      | Categorical grading (`high`, `medium`, `low`) of student technical evidence based on verified coursework artifacts and project demonstrations vs. self-reported claims. | **NO.** Self-reported claims are explicitly depreciated.                      |
| **Hiring Probability**  | Empirical Bayesian / Calibrated Estimate | Statistically calibrated estimate of positive hiring outcome derived from verified comparable candidate historical populations.                                         | **YES (if data sufficient). Otherwise explicitly UNAVAILABLE.**               |

Crucial axioms:

- **Role Match is not a probability.**
- **Eligibility is not a probability.**
- **A manually chosen target company is not evidence of employability.**
- **A self-reported skill is not equivalent to demonstrated evidence.**

### 3. Mandatory Metadata & Provenance Retention

Every probability prediction, when calculated, MUST retain and expose:

1. `modelVersion`: Exact semantic version of the calibrated statistical model.
2. `trainingDatasetVersion`: Unique identifier of the empirical dataset used for calibration.
3. `trainingDateRange`: Inclusive start and end timestamps of training outcome data.
4. `predictionDate`: Exact timestamp when the prediction was evaluated.
5. `populationDefinition`: Explicit cohort definition (e.g., "Undergraduate Computer Science graduating 2026-2027 in India").
6. `opportunityRoleContext`: Target role title, company name, and opportunity type.
7. `comparableSampleSize`: Number of strictly comparable candidates ($N \ge 100$).
8. `observedPositiveOutcomes`: Number of positive hiring outcomes observed in the comparable sample ($k \ge 15$).
9. `uncertaintyInterval`: Explicit uncertainty interval (e.g., lower bound, upper bound at 95% confidence level).
10. `calibrationMetrics`: Brier score ($\le 0.25$), log loss, discrimination metrics (ROC-AUC / PR-AUC), and expected calibration error (ECE).
11. `featureSnapshot`: Snapshot of demonstrated technical features used for inference.
12. `predictionProvenance`: SHA-256 hash of student inputs and model pipeline version.
13. `knownLimitations`: Explicit disclosure of temporal distribution shifts, macro hiring freezes, or dataset constraints.

### 4. Calibration & Model Quality Standards

Probability models must be evaluated on future or out-of-time validation datasets where possible.

Primary probability-quality metrics:

- **Calibration (Reliability curve / ECE)**: Predicted probability $p$ must correspond to empirical frequency $p \pm \epsilon$.
- **Brier Score**: Quadratic scoring rule verifying calibration and refinement. Maximum acceptable Brier score is 0.25 (the score of an uninformative 50/50 prior on a balanced sample).
- **Logarithmic Loss**: Information-theoretic penalty for confident mispredictions.
- **Discrimination**: Area under the ROC curve (ROC-AUC) and Precision-Recall curve (PR-AUC).

CampusFlow will never advertise generic model "accuracy" without clearly defining the metric, decision threshold, and evaluation population.

### 5. Transparency of Unobserved Variables

Predictions must explain what data supported the assessment and transparently disclose what CampusFlow **does NOT observe**:

- Live technical whiteboard/coding and system design interview performance.
- Behavioral interview dynamics, executive presence, and interpersonal rapport.
- Real-time candidate anxiety, test fatigue, and interview-day conditions.
- Hiring manager subjective biases and team chemistry preferences.
- Internal company referral pathways, employee endorsements, and institutional networks.
- Non-public applicant pool volume, diversity initiatives, and competitor strengths.
- Unannounced corporate headcount freezes or sudden departmental budget cancellations.
- Regulatory visa sponsorship quotas and regional policy changes.

### 6. Ethical AI and Non-Deterministic Guarantees

Never imply that a probability is a guarantee, a deterministic prediction of employability, or a ranking of human worth. Career development in CampusFlow is educational and diagnostic, aimed at guiding deliberate skill acquisition and academic growth.

## Consequences

- If comparable outcome data is below statistical thresholds ($N < 100$), the system strictly returns `status: 'unavailable'` with the exact string `"Probability unavailable: insufficient comparable outcome data."`.
- Unit tests enforce that heuristic scores (e.g. dividing Role Match by 100) or mock probabilities cannot be returned.
- API endpoints (`POST /api/v1/opportunities/:id/evaluate`) expose `hiringProbability` with full auditability and metadata.
- Web UI displays the four distinct evaluation pillars side-by-side with transparent unobserved factor disclosures.
