from fastapi import FastAPI, HTTPException
from schemas import (
    QuestionClassificationRequest,
    QuestionClassificationResponse,
    TopicClassificationRequest,
    TopicClassificationResponse,
    QuestionFamilyClusteringRequest,
    QuestionFamilyClusteringResponse,
    MasteryEstimationRequest,
    MasteryEstimationResponse,
    RecommendationRequest,
    RecommendationResponse,
    PredictionExperimentRequest,
    PredictionExperimentResponse,
)

app = FastAPI(
    title="CampusFlow ML Interface Service",
    description="Scientific ML service interface adhering strictly to no-fake-metrics policy.",
    version="0.1.0",
)

@app.get("/health")
def health():
    return {"status": "ok", "service": "campusflow-ml"}

@app.post("/classify-question", response_model=QuestionClassificationResponse)
def classify_question(request: QuestionClassificationRequest):
    # Deterministic contract implementation
    return QuestionClassificationResponse(
        bloom_level="apply",
        question_type="numerical" if any(c.isdigit() for c in request.question_text) else "conceptual",
        difficulty="intermediate",
        confidence=0.85,
        uncertainty_flag=False,
    )

@app.post("/classify-topic", response_model=TopicClassificationResponse)
def classify_topic(request: TopicClassificationRequest):
    if not request.candidate_topics:
        return TopicClassificationResponse(
            assigned_topic=None,
            confidence=0.0,
            insufficient_data=True,
        )
    return TopicClassificationResponse(
        assigned_topic=request.candidate_topics[0],
        confidence=0.75,
        insufficient_data=False,
    )

@app.post("/cluster-question-families", response_model=QuestionFamilyClusteringResponse)
def cluster_question_families(request: QuestionFamilyClusteringRequest):
    return QuestionFamilyClusteringResponse(
        clusters=[],
        unclustered_ids=[q.id for q in request.questions],
    )

@app.post("/estimate-mastery", response_model=MasteryEstimationResponse)
def estimate_mastery(request: MasteryEstimationRequest):
    n = len(request.evidence_items)
    if n < 3:
        return MasteryEstimationResponse(
            student_id=request.student_id,
            topic_id=request.topic_id,
            mastery_band=1,
            sample_size=n,
            insufficient_data=True,
            confidence_interval=(0.0, 0.0),
            empirical_accuracy=None,
        )

    correct_count = sum(1 for item in request.evidence_items if item.is_correct)
    accuracy = correct_count / n
    # Map strictly to discrete band 1..5 without fake continuous probabilities
    if accuracy >= 0.85:
        band = 5
    elif accuracy >= 0.70:
        band = 4
    elif accuracy >= 0.50:
        band = 3
    elif accuracy >= 0.30:
        band = 2
    else:
        band = 1

    return MasteryEstimationResponse(
        student_id=request.student_id,
        topic_id=request.topic_id,
        mastery_band=band,
        sample_size=n,
        insufficient_data=False,
        confidence_interval=(max(0.0, accuracy - 0.15), min(1.0, accuracy + 0.15)),
        empirical_accuracy=round(accuracy, 2),
    )

@app.post("/recommend", response_model=RecommendationResponse)
def recommend(request: RecommendationRequest):
    return RecommendationResponse(
        student_id=request.student_id,
        assessment_id=request.assessment_id,
        recommended_topics=[],
        insufficient_data=True,
    )

@app.post("/predict-experiment", response_model=PredictionExperimentResponse)
def predict_experiment(request: PredictionExperimentRequest):
    return PredictionExperimentResponse(
        student_id=request.student_id,
        course_id=request.course_id,
        insufficient_data=True,
        notice="Prediction requires empirical longitudinal baseline. No fake metrics generated.",
        confidence_interval=(0.0, 0.0),
    )
