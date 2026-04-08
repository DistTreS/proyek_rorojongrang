"""Test grade track dengan dataset mendekati kondisi nyata."""
import sys, time
sys.path.insert(0, ".")
from services.solver import generate_schedule

slots = []
sid = 1
for day in range(1, 6):
    for h in range(9):
        slots.append({"id": sid, "period_id": 1, "day_of_week": day,
                      "start_time": f"{7+h:02d}:00", "end_time": f"{8+h:02d}:00"})
        sid += 1

assignments = []
aid = 1
# 3 utama rombel grade 11
for rombel in [10, 11, 12]:
    for subj in range(1, 7):
        assignments.append({"id": aid, "teacher_id": aid, "subject_id": subj,
                             "rombel_id": rombel, "period_id": 1, "weekly_hours": 2,
                             "grade_level": 11, "subject_type": "wajib", "rombel_type": "utama"})
        aid += 1
    for subj in range(7, 11):
        assignments.append({"id": aid, "teacher_id": aid, "subject_id": subj,
                             "rombel_id": rombel, "period_id": 1, "weekly_hours": 4,
                             "grade_level": 11, "subject_type": "wajib", "rombel_type": "utama"})
        aid += 1
# 8 peminatan grade 11
for i in range(8):
    assignments.append({"id": aid, "teacher_id": aid, "subject_id": 100+i,
                         "rombel_id": 50+i, "period_id": 1, "weekly_hours": 2,
                         "grade_level": 11, "subject_type": "peminatan", "rombel_type": "peminatan"})
    aid += 1

payload = {
    "period_id": 1,
    "teaching_assignments": assignments,
    "time_slots": slots,
    "constraints": {
        "enforce_grade_track_constraints": True,
        "solver": {"max_time_seconds": 60, "workers": 8},
    },
}
print(f"Assignments: {len(assignments)}, Slots: {len(slots)}")
t0 = time.perf_counter()
result = generate_schedule(payload)
elapsed = time.perf_counter() - t0
print(f"Runtime: {elapsed:.1f}s")
print(f"Feasible: {result['summary']['feasible']}")
print(f"Generated: {result['summary']['generatedItems']}")
if result["conflicts"]:
    for c in result["conflicts"]:
        print(f"  CONFLICT: {c['code']} - {c['message']}")
else:
    hc = result["summary"].get("hardConstraints", {}).get("status", {})
    print(f"  hard_constraints: {hc}")
