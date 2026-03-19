from datetime import datetime, timezone

def generate_schedule(data: dict) -> dict:
    # Placeholder: implement CP-SAT + GA hybrid here
    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "period_id": data.get("period_id"),
        "summary": {
            "total_teaching_assignments": len(data.get("teaching_assignments", [])),
            "total_time_slots": len(data.get("time_slots", [])),
            "total_teacher_preferences": len(data.get("teacher_preferences", [])),
            "generated_items": 0,
            "feasible": False,
            "engine": "placeholder"
        },
        "schedule": [],
        "warnings": [
            {
                "code": "SOLVER_PLACEHOLDER",
                "message": "Scheduler service belum menghasilkan jadwal final, backend dapat memakai fallback lokal",
                "details": {
                    "period_id": data.get("period_id")
                },
            }
        ],
        "conflicts": [],
    }
