from typing import List, Optional, Tuple
from pydantic import BaseModel, Field

# 1. Question Classification
class QuestionClassificationRequest(BaseModel):
    question_text: str = Field(..., min_length=1)

class QuestionClassificationResponse(BaseModel):
    bloom_level: str = Field(..., description="Bloom taxonomy level: remember, understand, apply, analyze, evaluate, create")
    question_type: str = Field(..., description="mcq, derivation, numerical, conceptual")
    difficulty: str = Field(..., description="introductory, intermediate, advanced")
    confidence: float = Field(..., ge=0.0, le=1.0)
    uncertainty_flag: bool = Field(False, description="True if classification confidence is below reliable threshold")

# 2. Topic Classification
class TopicClassificationRequest(BaseModel):
    content_chunk: str = Field(..., min_length=1)
    candidate_topics: List[str] = Field(..., min_items=1)

class TopicClassificationResponse(BaseModel):
    assigned_topic: Optional[str]
    confidence: float = Field(..., ge=0.0, le=1.0)
    insufficient_data: bool = False

# 3. Question-Family Clustering
class QuestionItem(BaseModel):
    id: str
    text: str
    assessment_id: Optional[str] = None

class QuestionFamilyClusteringRequest(BaseModel):
    questions: List[QuestionItem] = Field(..., min_items=2)
    similarity_threshold: float = Field(0.75, ge=0.0, le=1.0)

class QuestionCluster(BaseModel):
    family_id: str
    question_ids: List[str]
    prototype_concept: str
    cluster_cohesion: float

class QuestionFamilyClusteringResponse(BaseModel):
    clusters: List[QuestionCluster]
    unclustered_ids: List[str]

# 4. Mastery Estimation
class MasteryEvidence(BaseModel):
    item_id: str
    is_correct: bool
    attempt_timestamp: str

class MasteryEstimationRequest(BaseModel):
    student_id: str
    topic_id: str
    evidence_items: List[MasteryEvidence]

class MasteryEstimationResponse(BaseModel):
    student_id: str
    topic_id: str
    mastery_band: int = Field(..., ge=1, le=5, description="Discrete band 1..5 based purely on observed evidence")
    sample_size: int
    insufficient_data: bool = Field(..., description="True if sample_size is inadequate for statistical significance")
    confidence_interval: Tuple[float, float]
    empirical_accuracy: Optional[float] = None

# 5. Recommendation
class RecommendationRequest(BaseModel):
    student_id: str
    assessment_id: str
    available_hours: float = Field(..., gt=0.0)

class RecommendedTopicPlan(BaseModel):
    topic_id: str
    suggested_hours: float
    rationale: str
    evidence_basis: str

class RecommendationResponse(BaseModel):
    student_id: str
    assessment_id: str
    recommended_topics: List[RecommendedTopicPlan]
    insufficient_data: bool = False

# 6. Future Prediction Experiments
class PredictionExperimentRequest(BaseModel):
    student_id: str
    course_id: str

class PredictionExperimentResponse(BaseModel):
    student_id: str
    course_id: str
    insufficient_data: bool = True
    notice: str = "Experimental predictive models require verifiable historical performance datasets. No fake probabilities generated."
    confidence_interval: Tuple[float, float] = (0.0, 0.0)
