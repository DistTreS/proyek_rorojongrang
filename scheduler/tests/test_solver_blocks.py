"""
Test validasi untuk constraint solver (updated sesuai aturan baru):
1. 4 JP dan 5 JP: TIDAK ada pola wajib — bebas ditempatkan di hari manapun
2. 6 JP harus terdistribusi 3+3 atau 2+2+2 (berurutan per hari)
3. Constraint grade track (max 4 peminatan paralel, utama vs peminatan tidak boleh bersamaan)
4. 2 JP dan 3 JP: berurutan saat grade track NONAKTIF; hanya soft saat grade track AKTIF
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.solver import generate_schedule


def _make_slots(num_days: int = 5, slots_per_day: int = 9) -> list[dict]:
    """Buat time slot (n hari × m slot)."""
    slots = []
    slot_id = 1
    for day in range(1, num_days + 1):
        for hour in range(slots_per_day):
            start_h = 7 + hour
            end_h = 8 + hour
            slots.append({
                "id": slot_id,
                "period_id": 1,
                "day_of_week": day,
                "start_time": f"{start_h:02d}:00",
                "end_time": f"{end_h:02d}:00",
                "label": f"Hari-{day} Jam-{hour+1}",
            })
            slot_id += 1
    return slots


def _check_blocks(schedule: list[dict], assignments_by_id: dict, slots_by_id: dict) -> dict:
    """Cek distribusi blok per assignment."""
    from collections import defaultdict

    results = {}
    by_assignment: dict[int, list[dict]] = defaultdict(list)
    for item in schedule:
        by_assignment[item["teaching_assignment_id"]].append(item)

    for aid, items in by_assignment.items():
        assignment = assignments_by_id.get(aid, {})
        weekly_hours = assignment.get("weekly_hours", 0)

        by_day: dict[int, list[int]] = defaultdict(list)
        for item in items:
            slot = slots_by_id[item["time_slot_id"]]
            by_day[slot["day_of_week"]].append(slot)

        days_used = len(by_day)
        is_consecutive = True
        for day, day_slots in by_day.items():
            day_slots_sorted = sorted(day_slots, key=lambda s: s["start_time"])
            for i in range(1, len(day_slots_sorted)):
                prev_end = day_slots_sorted[i - 1]["end_time"]
                curr_start = day_slots_sorted[i]["start_time"]
                if prev_end != curr_start:
                    is_consecutive = False
                    break

        results[aid] = {
            "weekly_hours": weekly_hours,
            "days_used": days_used,
            "is_consecutive": is_consecutive,
        }

    return results


def test_4jp_no_pattern_constraint():
    """4 JP: TIDAK ada pola wajib — solver bebas menempatkan di hari manapun."""
    payload = {
        "period_id": 1,
        "teaching_assignments": [
            {"id": 1, "teacher_id": 1, "subject_id": 1, "rombel_id": 1, "period_id": 1, "weekly_hours": 4},
            {"id": 2, "teacher_id": 2, "subject_id": 2, "rombel_id": 1, "period_id": 1, "weekly_hours": 2},
        ],
        "time_slots": _make_slots(),
        "constraints": {"solver": {"max_time_seconds": 30, "workers": 4}},
    }
    result = generate_schedule(payload)
    assert not result["conflicts"], f"Conflicts: {result['conflicts']}"
    assert result["summary"]["feasible"], "Schedule harus feasible"

    schedule = result["schedule"]
    assignments_by_id = {a["id"]: a for a in payload["teaching_assignments"]}
    slots_by_id = {s["id"]: s for s in payload["time_slots"]}
    blocks = _check_blocks(schedule, assignments_by_id, slots_by_id)

    a4 = blocks[1]
    assert a4["weekly_hours"] == 4
    # Tidak ada pola wajib: hanya pastikan total slot = 4
    scheduled_count = sum(1 for item in schedule if item["teaching_assignment_id"] == 1)
    assert scheduled_count == 4, f"4 JP harus punya 4 slot, dapat: {scheduled_count}"
    print(f"  [OK] 4 JP: {a4['days_used']} hari (bebas, tidak ada pola wajib)")


def test_5jp_no_pattern_constraint():
    """5 JP: TIDAK ada pola wajib — solver bebas menempatkan di hari manapun."""
    payload = {
        "period_id": 1,
        "teaching_assignments": [
            {"id": 1, "teacher_id": 1, "subject_id": 1, "rombel_id": 1, "period_id": 1, "weekly_hours": 5},
            {"id": 2, "teacher_id": 2, "subject_id": 2, "rombel_id": 1, "period_id": 1, "weekly_hours": 3},
        ],
        "time_slots": _make_slots(),
        "constraints": {"solver": {"max_time_seconds": 30, "workers": 4}},
    }
    result = generate_schedule(payload)
    assert not result["conflicts"], f"Conflicts: {result['conflicts']}"
    assert result["summary"]["feasible"], "Schedule harus feasible"

    schedule = result["schedule"]
    assignments_by_id = {a["id"]: a for a in payload["teaching_assignments"]}
    slots_by_id = {s["id"]: s for s in payload["time_slots"]}
    blocks = _check_blocks(schedule, assignments_by_id, slots_by_id)

    a5 = blocks[1]
    assert a5["weekly_hours"] == 5
    scheduled_count = sum(1 for item in schedule if item["teaching_assignment_id"] == 1)
    assert scheduled_count == 5, f"5 JP harus punya 5 slot, dapat: {scheduled_count}"
    print(f"  [OK] 5 JP: {a5['days_used']} hari (bebas, tidak ada pola wajib)")


def test_6jp_distribution():
    """6 JP harus: 2-3 hari, per hari berurutan (3+3 atau 2+2+2) — aturan tetap berlaku."""
    payload = {
        "period_id": 1,
        "teaching_assignments": [
            {"id": 1, "teacher_id": 1, "subject_id": 1, "rombel_id": 1, "period_id": 1, "weekly_hours": 6},
            {"id": 2, "teacher_id": 2, "subject_id": 2, "rombel_id": 1, "period_id": 1, "weekly_hours": 2},
        ],
        "time_slots": _make_slots(),
        "constraints": {"solver": {"max_time_seconds": 30, "workers": 4}},
    }
    result = generate_schedule(payload)
    assert not result["conflicts"], f"Conflicts: {result['conflicts']}"
    assert result["summary"]["feasible"]

    schedule = result["schedule"]
    assignments_by_id = {a["id"]: a for a in payload["teaching_assignments"]}
    slots_by_id = {s["id"]: s for s in payload["time_slots"]}
    blocks = _check_blocks(schedule, assignments_by_id, slots_by_id)

    a6 = blocks[1]
    assert a6["weekly_hours"] == 6
    assert a6["days_used"] in {2, 3}, f"6 JP harus 2 atau 3 hari, dapat: {a6['days_used']}"
    assert a6["is_consecutive"], "6 JP harus berurutan per hari"
    print(f"  [OK] 6 JP: {a6['days_used']} hari, berurutan={a6['is_consecutive']}")


def test_grade_track_elective_parallel_limit():
    """Grade track: utama vs peminatan tidak bersamaan, max 4 peminatan paralel."""
    payload = {
        "period_id": 1,
        "teaching_assignments": [
            # Utama grade 11
            {"id": 1, "teacher_id": 1, "subject_id": 1, "rombel_id": 10, "period_id": 1,
             "weekly_hours": 2, "grade_level": 11, "subject_type": "wajib", "rombel_type": "utama"},
            # 5 peminatan grade 11 (max 4 boleh paralel)
            {"id": 2, "teacher_id": 2, "subject_id": 20, "rombel_id": 20, "period_id": 1,
             "weekly_hours": 2, "grade_level": 11, "subject_type": "peminatan", "rombel_type": "peminatan"},
            {"id": 3, "teacher_id": 3, "subject_id": 21, "rombel_id": 21, "period_id": 1,
             "weekly_hours": 2, "grade_level": 11, "subject_type": "peminatan", "rombel_type": "peminatan"},
            {"id": 4, "teacher_id": 4, "subject_id": 22, "rombel_id": 22, "period_id": 1,
             "weekly_hours": 2, "grade_level": 11, "subject_type": "peminatan", "rombel_type": "peminatan"},
            {"id": 5, "teacher_id": 5, "subject_id": 23, "rombel_id": 23, "period_id": 1,
             "weekly_hours": 2, "grade_level": 11, "subject_type": "peminatan", "rombel_type": "peminatan"},
            {"id": 6, "teacher_id": 6, "subject_id": 24, "rombel_id": 24, "period_id": 1,
             "weekly_hours": 2, "grade_level": 11, "subject_type": "peminatan", "rombel_type": "peminatan"},
        ],
        "time_slots": _make_slots(num_days=5, slots_per_day=9),
        "constraints": {
            "enforce_grade_track_constraints": True,
            "solver": {"max_time_seconds": 60, "workers": 4},
        },
    }
    result = generate_schedule(payload)
    hard = result["summary"].get("hard_constraints", {})
    status = hard.get("status", {})
    print(f"  hard_constraints.status = {status}")

    elective_ok = status.get("elective_parallel_subject_limit_valid")
    mand_elec_ok = status.get("mandatory_vs_elective_no_overlap")
    assert elective_ok is not False, "Batas 4 peminatan paralel harus terpenuhi"
    assert mand_elec_ok is not False, "Utama dan peminatan tidak boleh bersamaan"
    print(f"  [OK] grade_track: mandatory_vs_elective={mand_elec_ok}, elective_parallel={elective_ok}")


def test_2jp_3jp_consecutive_without_grade_track():
    """2 JP dan 3 JP berurutan saat grade track NONAKTIF (default behaviour)."""
    payload = {
        "period_id": 1,
        "teaching_assignments": [
            {"id": 1, "teacher_id": 1, "subject_id": 1, "rombel_id": 1, "period_id": 1, "weekly_hours": 2},
            {"id": 2, "teacher_id": 2, "subject_id": 2, "rombel_id": 2, "period_id": 1, "weekly_hours": 3},
        ],
        "time_slots": _make_slots(),
        # grade track OFF → enforce_extended_blocks=True → blok berurutan sebagai hard constraint
        "constraints": {
            "enforce_grade_track_constraints": False,
            "solver": {"max_time_seconds": 30, "workers": 4},
        },
    }
    result = generate_schedule(payload)
    assert not result["conflicts"], f"Conflicts: {result['conflicts']}"
    assert result["summary"]["feasible"]

    schedule = result["schedule"]
    assignments_by_id = {a["id"]: a for a in payload["teaching_assignments"]}
    slots_by_id = {s["id"]: s for s in payload["time_slots"]}
    blocks = _check_blocks(schedule, assignments_by_id, slots_by_id)

    a2 = blocks[1]
    a3 = blocks[2]
    assert a2["days_used"] == 1, f"2 JP harus 1 hari (grade track OFF), dapat: {a2['days_used']}"
    assert a2["is_consecutive"]
    assert a3["days_used"] == 1, f"3 JP harus 1 hari (grade track OFF), dapat: {a3['days_used']}"
    assert a3["is_consecutive"]
    print(f"  [OK] 2 JP: {a2['days_used']} hari  |  3 JP: {a3['days_used']} hari  (grade track OFF)")


def test_grade_track_priority_over_consecutive():
    """Saat grade track AKTIF, sistem harus feasible meski 2-3 JP tidak bisa berurutan."""
    payload = {
        "period_id": 1,
        "teaching_assignments": [
            # Utama grade 11 — 2 JP
            {"id": 1, "teacher_id": 1, "subject_id": 1, "rombel_id": 10, "period_id": 1,
             "weekly_hours": 2, "grade_level": 11, "subject_type": "wajib", "rombel_type": "utama"},
            # Peminatan grade 11 — 3 JP
            {"id": 2, "teacher_id": 2, "subject_id": 20, "rombel_id": 20, "period_id": 1,
             "weekly_hours": 3, "grade_level": 11, "subject_type": "peminatan", "rombel_type": "peminatan"},
        ],
        "time_slots": _make_slots(num_days=5, slots_per_day=6),  # slot sedikit → grade track lebih ketat
        "constraints": {
            "enforce_grade_track_constraints": True,  # grade track > consecutive
            "solver": {"max_time_seconds": 60, "workers": 4},
        },
    }
    result = generate_schedule(payload)
    # Yang penting: harus FEASIBLE (grade track terpenuhi meski 2-3 JP mungkin tidak berurutan)
    assert result["summary"]["feasible"], "Harus feasible \u2014 grade track prioritas lebih tinggi dari blok berurutan"
    hard = result["summary"].get("hard_constraints", {})
    mand_elec_ok = hard.get("status", {}).get("mandatory_vs_elective_no_overlap")
    assert mand_elec_ok is not False, "Grade track constraint harus terpenuhi"
    print(f"  [OK] Grade track terpenuhi, feasible=True, mandatory_vs_elective={mand_elec_ok}")


if __name__ == "__main__":
    tests = [
        test_2jp_3jp_consecutive_without_grade_track,
        test_4jp_no_pattern_constraint,
        test_5jp_no_pattern_constraint,
        test_6jp_distribution,
        test_grade_track_elective_parallel_limit,
        test_grade_track_priority_over_consecutive,
    ]

    passed = 0
    failed = 0
    for test in tests:
        name = test.__name__
        print(f"\n[{name}]")
        try:
            test()
            print(f"  PASSED")
            passed += 1
        except Exception as e:
            print(f"  FAILED: {e}")
            failed += 1

    print(f"\n{'='*50}")
    print(f"Hasil: {passed} PASSED, {failed} FAILED dari {len(tests)} test")
    sys.exit(0 if failed == 0 else 1)
