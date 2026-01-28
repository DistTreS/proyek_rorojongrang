from fastapi import FastAPI
from pydantic import BaseModel
from services.solver import generate_schedule

app = FastAPI(title="Scheduler Service", version="0.1.0")


class ScheduleRequest(BaseModel):
    period_id: int
    teaching_assignments: list
    time_slots: list
    constraints: dict | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/schedule/generate")
def schedule_generate(payload: ScheduleRequest):
    result = generate_schedule(payload.model_dump())
    return result
