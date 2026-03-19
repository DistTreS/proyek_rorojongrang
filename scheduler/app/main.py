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
    generated_items: int = 0
    feasible: bool = False
    engine: str = "placeholder"


class ScheduleRequest(BaseModel):
    period_id: int
    teaching_assignments: list[TeachingAssignmentItem] = Field(default_factory=list)
    time_slots: list[TimeSlotItem] = Field(default_factory=list)
    constraints: dict[str, Any] = Field(default_factory=dict)
    teacher_preferences: list[TeacherPreferenceItem] = Field(default_factory=list)


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
