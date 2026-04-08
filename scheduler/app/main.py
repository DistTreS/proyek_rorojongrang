from typing import Any, Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field
from services.solver import generate_schedule

app = FastAPI(title="Scheduler Service", version="0.1.0")


class TeachingAssignmentItem(BaseModel):
    id: int
    teacher_id: int
    subject_id: int
    rombel_id: int
    period_id: int
    weekly_hours: int
    grade_level: int | None = None
    subject_type: Literal["wajib", "peminatan"] | None = None
    rombel_type: Literal["utama", "peminatan"] | None = None


class TimeSlotItem(BaseModel):
    id: int
    period_id: int
    day_of_week: int
    start_time: str
    end_time: str
    label: str | None = None


class TeacherPreferenceItem(BaseModel):
    id: int
    teacher_id: int
    period_id: int
    day_of_week: int
    start_time: str
    end_time: str
    preference_type: Literal["prefer", "avoid"] = "avoid"
    notes: str | None = None


class StudentEnrollmentItem(BaseModel):
    student_id: int
    rombel_ids: list[int] = Field(default_factory=list)


class IssueItem(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ScheduleItem(BaseModel):
    rombel_id: int
    time_slot_id: int
    teaching_assignment_id: int
    room: str | None = None


class ScheduleSummary(BaseModel):
    total_teaching_assignments: int = 0
    total_time_slots: int = 0
    total_teacher_preferences: int = 0
    total_student_enrollments: int = 0
    requested_sessions: int = 0
    generated_items: int = 0
    feasible: bool = False
    engine: str = "placeholder"
    runtime_ms: dict[str, Any] | None = None
    objective_scores: dict[str, Any] | None = None
    hard_constraints: dict[str, Any] | None = None
    soft_penalties: dict[str, Any] | None = None
    distribution_compliance: dict[str, Any] | None = None
    constraint_profile: dict[str, Any] | None = None
    hybrid_rounds: list[dict[str, Any]] | None = None


class ScheduleRequest(BaseModel):
    period_id: int
    teaching_assignments: list[TeachingAssignmentItem] = Field(default_factory=list)
    time_slots: list[TimeSlotItem] = Field(default_factory=list)
    constraints: dict[str, Any] = Field(default_factory=dict)
    teacher_preferences: list[TeacherPreferenceItem] = Field(default_factory=list)
    student_enrollments: list[StudentEnrollmentItem] = Field(default_factory=list)


class ScheduleResponse(BaseModel):
    generated_at: str
    period_id: int
    summary: ScheduleSummary
    schedule: list[ScheduleItem] = Field(default_factory=list)
    warnings: list[IssueItem] = Field(default_factory=list)
    conflicts: list[IssueItem] = Field(default_factory=list)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/schedule/generate", response_model=ScheduleResponse)
def schedule_generate(payload: ScheduleRequest):
    result = generate_schedule(payload.model_dump())
    return result
