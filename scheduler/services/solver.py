from __future__ import annotations

import os
import random
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from ortools.sat.python import cp_model


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = str(raw).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


FIXED_MAX_TEACHER_DAILY_HOURS = 8
FIXED_ROMBEL_DAILY_SUBJECT_LIMIT = 5
FIXED_ROMBEL_DAILY_SUBJECT_OVERLOAD_PENALTY = 3
ENABLE_WAJIB_PEMINATAN_CONFLICT_CHECK = _env_bool("ENABLE_WAJIB_PEMINATAN_CONFLICT_CHECK", False)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _issue(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"code": code, "message": message}
    payload["details"] = details or {}
    return payload


def _safe_int(value: Any, default: int, min_value: int | None = None, max_value: int | None = None) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    if min_value is not None:
        parsed = max(min_value, parsed)
    if max_value is not None:
        parsed = min(max_value, parsed)
    return parsed


def _safe_float(
    value: Any,
    default: float,
    min_value: float | None = None,
    max_value: float | None = None,
) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    if min_value is not None:
        parsed = max(min_value, parsed)
    if max_value is not None:
        parsed = min(max_value, parsed)
    return parsed


def _safe_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value in {"true", "1", 1, "yes", "on"}:
        return True
    if value in {"false", "0", 0, "no", "off"}:
        return False
    return default


def _parse_time_to_seconds(value: Any) -> int | None:
    text = str(value or "").strip()
    if not text:
        return None

    parts = text.split(":")
    if len(parts) not in {2, 3}:
        return None

    try:
        hour = int(parts[0])
        minute = int(parts[1])
        second = int(parts[2]) if len(parts) == 3 else 0
    except ValueError:
        return None

    if hour < 0 or hour > 23 or minute < 0 or minute > 59 or second < 0 or second > 59:
        return None
    return (hour * 3600) + (minute * 60) + second


def _build_config(constraints: dict[str, Any]) -> dict[str, Any]:
    solver_cfg = constraints.get("solver") if isinstance(constraints.get("solver"), dict) else {}
    ga_cfg = constraints.get("ga") if isinstance(constraints.get("ga"), dict) else {}
    objective_cfg = (
        constraints.get("objective_weights")
        if isinstance(constraints.get("objective_weights"), dict)
        else constraints.get("weights")
        if isinstance(constraints.get("weights"), dict)
        else {}
    )

    prefer_weight = _safe_int(
        objective_cfg.get("prefer", constraints.get("prefer_weight", 8)),
        default=8,
        min_value=0,
        max_value=100,
    )
    avoid_penalty = abs(
        _safe_int(
            objective_cfg.get("avoid", constraints.get("avoid_penalty", 10)),
            default=10,
            min_value=-100,
            max_value=100,
        )
    )
    day_spread_weight = _safe_int(
        objective_cfg.get("day_spread", constraints.get("day_spread_weight", 2)),
        default=2,
        min_value=0,
        max_value=100,
    )
    return {
        "random_seed": _safe_int(constraints.get("random_seed", 42), default=42, min_value=1, max_value=2_147_483_647),
        "solver_seconds": _safe_float(
            solver_cfg.get("max_time_seconds", constraints.get("max_solver_seconds", 15)),
            default=15.0,
            min_value=1.0,
            max_value=120.0,
        ),
        "solver_workers": _safe_int(
            solver_cfg.get("workers", constraints.get("solver_workers", 8)),
            default=8,
            min_value=1,
            max_value=32,
        ),
        "max_teacher_daily_hours": FIXED_MAX_TEACHER_DAILY_HOURS,
        "enforce_consecutive_small_assignments": _safe_bool(
            solver_cfg.get(
                "enforce_consecutive_small_assignments",
                constraints.get("enforce_consecutive_small_assignments", True),
            ),
            True,
        ),
        "ga_enabled": _safe_bool(ga_cfg.get("enabled", constraints.get("use_ga", True)), True),
        "ga_population": _safe_int(
            ga_cfg.get("population_size", constraints.get("ga_population_size", 24)),
            default=24,
            min_value=8,
            max_value=120,
        ),
        "ga_generations": _safe_int(
            ga_cfg.get("generations", constraints.get("ga_generations", 40)),
            default=40,
            min_value=1,
            max_value=400,
        ),
        "ga_crossover_rate": _safe_float(
            ga_cfg.get("crossover_rate", constraints.get("ga_crossover_rate", 0.75)),
            default=0.75,
            min_value=0.0,
            max_value=1.0,
        ),
        "ga_mutation_rate": _safe_float(
            ga_cfg.get("mutation_rate", constraints.get("ga_mutation_rate", 0.35)),
            default=0.35,
            min_value=0.0,
            max_value=1.0,
        ),
        "ga_tournament_size": _safe_int(
            ga_cfg.get("tournament_size", constraints.get("ga_tournament_size", 3)),
            default=3,
            min_value=2,
            max_value=10,
        ),
        "ga_elite_count": _safe_int(
            ga_cfg.get("elite_count", constraints.get("ga_elite_count", 2)),
            default=2,
            min_value=1,
            max_value=10,
        ),
        "ga_seed_attempts": _safe_int(
            ga_cfg.get("seed_attempts", constraints.get("ga_seed_attempts", 60)),
            default=60,
            min_value=10,
            max_value=200,
        ),
        "objective": {
            "prefer_weight": prefer_weight,
            "avoid_penalty": avoid_penalty,
            "day_spread_weight": day_spread_weight,
            "rombel_daily_subject_limit": FIXED_ROMBEL_DAILY_SUBJECT_LIMIT,
            "rombel_daily_subject_overload_penalty": FIXED_ROMBEL_DAILY_SUBJECT_OVERLOAD_PENALTY,
        },
    }


def _resolve_assignment_track(assignment: dict[str, Any]) -> str | None:
    subject_type = assignment.get("subject_type")
    rombel_type = assignment.get("rombel_type")

    if subject_type == "wajib" or rombel_type == "utama":
        return "mandatory"
    if subject_type == "peminatan" or rombel_type == "peminatan":
        return "elective"
    return None


def _is_small_consecutive_assignment(
    assignment: dict[str, Any],
    enforce_consecutive_small_assignments: bool,
) -> bool:
    if not enforce_consecutive_small_assignments:
        return False
    weekly_hours = _safe_int(assignment.get("weekly_hours"), default=0, min_value=0)
    return 1 < weekly_hours <= 3


def _normalize_inputs(data: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    warnings: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

    period_id = _safe_int(data.get("period_id"), default=0, min_value=0)
    if period_id <= 0:
        conflicts.append(_issue("INVALID_PERIOD_ID", "period_id tidak valid"))

    raw_assignments = data.get("teaching_assignments") or []
    raw_slots = data.get("time_slots") or []
    raw_preferences = data.get("teacher_preferences") or []
    raw_student_enrollments = data.get("student_enrollments") or []

    assignments: list[dict[str, Any]] = []
    assignment_ids = set()
    for raw in raw_assignments:
        assignment_id = _safe_int(raw.get("id"), default=0, min_value=0)
        teacher_id = _safe_int(raw.get("teacher_id"), default=0, min_value=0)
        rombel_id = _safe_int(raw.get("rombel_id"), default=0, min_value=0)
        subject_id = _safe_int(raw.get("subject_id"), default=0, min_value=0)
        assignment_period = _safe_int(raw.get("period_id"), default=0, min_value=0)
        weekly_hours = _safe_int(raw.get("weekly_hours"), default=0, min_value=0)
        grade_level = _safe_int(raw.get("grade_level"), default=0, min_value=0)
        subject_type_raw = str(raw.get("subject_type") or "").strip().lower()
        rombel_type_raw = str(raw.get("rombel_type") or "").strip().lower()
        subject_type = subject_type_raw if subject_type_raw in {"wajib", "peminatan"} else None
        rombel_type = rombel_type_raw if rombel_type_raw in {"utama", "peminatan"} else None

        if assignment_id <= 0 or teacher_id <= 0 or rombel_id <= 0 or subject_id <= 0 or weekly_hours <= 0:
            conflicts.append(
                _issue(
                    "INVALID_ASSIGNMENT_DATA",
                    "Data teaching assignment tidak valid",
                    {"assignment": raw},
                )
            )
            continue

        if assignment_id in assignment_ids:
            conflicts.append(
                _issue(
                    "DUPLICATE_ASSIGNMENT_ID",
                    f"teaching_assignment.id duplikat: {assignment_id}",
                )
            )
            continue

        assignment_ids.add(assignment_id)
        if assignment_period != period_id:
            conflicts.append(
                _issue(
                    "ASSIGNMENT_PERIOD_MISMATCH",
                    f"Pengampu #{assignment_id} tidak berada pada period_id payload",
                    {"assignment_period_id": assignment_period, "period_id": period_id},
                )
            )

        assignments.append(
            {
                "id": assignment_id,
                "teacher_id": teacher_id,
                "rombel_id": rombel_id,
                "subject_id": subject_id,
                "period_id": assignment_period,
                "weekly_hours": weekly_hours,
                "grade_level": grade_level,
                "subject_type": subject_type,
                "rombel_type": rombel_type,
            }
        )

    slots: list[dict[str, Any]] = []
    slot_ids = set()
    for raw in raw_slots:
        slot_id = _safe_int(raw.get("id"), default=0, min_value=0)
        slot_period = _safe_int(raw.get("period_id"), default=0, min_value=0)
        day_of_week = _safe_int(raw.get("day_of_week"), default=0, min_value=0)
        start_seconds = _parse_time_to_seconds(raw.get("start_time"))
        end_seconds = _parse_time_to_seconds(raw.get("end_time"))

        if slot_id <= 0 or day_of_week <= 0 or day_of_week > 7 or start_seconds is None or end_seconds is None:
            conflicts.append(
                _issue(
                    "INVALID_SLOT_DATA",
                    "Data time slot tidak valid",
                    {"slot": raw},
                )
            )
            continue

        if start_seconds >= end_seconds:
            conflicts.append(
                _issue(
                    "INVALID_SLOT_TIME_RANGE",
                    f"Rentang waktu time slot #{slot_id} tidak valid",
                    {"start_time": raw.get("start_time"), "end_time": raw.get("end_time")},
                )
            )
            continue

        if slot_id in slot_ids:
            conflicts.append(
                _issue(
                    "DUPLICATE_SLOT_ID",
                    f"time_slot.id duplikat: {slot_id}",
                )
            )
            continue

        slot_ids.add(slot_id)
        if slot_period != period_id:
            warnings.append(
                _issue(
                    "SLOT_PERIOD_MISMATCH",
                    f"Time slot #{slot_id} di-skip karena period_id tidak sesuai payload",
                    {"slot_period_id": slot_period, "period_id": period_id},
                )
            )
            continue

        slots.append(
            {
                "id": slot_id,
                "period_id": slot_period,
                "day_of_week": day_of_week,
                "start_time": str(raw.get("start_time")),
                "end_time": str(raw.get("end_time")),
                "label": raw.get("label"),
                "start_seconds": start_seconds,
                "end_seconds": end_seconds,
            }
        )

    slots.sort(key=lambda item: (item["day_of_week"], item["start_seconds"], item["id"]))

    if not assignments:
        conflicts.append(
            _issue(
                "ASSIGNMENT_EMPTY",
                "teaching_assignments kosong atau tidak valid",
            )
        )
    if not slots:
        conflicts.append(
            _issue(
                "SLOT_EMPTY",
                "time_slots kosong atau tidak valid",
            )
        )

    if slots:
        total_slots = len(slots)
        teacher_load: dict[int, int] = defaultdict(int)
        rombel_load: dict[int, int] = defaultdict(int)
        for assignment in assignments:
            teacher_load[assignment["teacher_id"]] += assignment["weekly_hours"]
            rombel_load[assignment["rombel_id"]] += assignment["weekly_hours"]
            if assignment["weekly_hours"] > total_slots:
                conflicts.append(
                    _issue(
                        "ASSIGNMENT_EXCEEDS_SLOT_CAPACITY",
                        f"Pengampu #{assignment['id']} butuh {assignment['weekly_hours']} jam, slot tersedia {total_slots}",
                    )
                )

        for teacher_id, load in teacher_load.items():
            if load > total_slots:
                conflicts.append(
                    _issue(
                        "TEACHER_OVERLOAD",
                        f"Guru #{teacher_id} butuh {load} jam, slot tersedia {total_slots}",
                    )
                )

        for rombel_id, load in rombel_load.items():
            if load > total_slots:
                conflicts.append(
                    _issue(
                        "ROMBEL_OVERLOAD",
                        f"Rombel #{rombel_id} butuh {load} jam, slot tersedia {total_slots}",
                    )
                )

    preferences: list[dict[str, Any]] = []
    for raw in raw_preferences:
        pref_id = _safe_int(raw.get("id"), default=0, min_value=0)
        teacher_id = _safe_int(raw.get("teacher_id"), default=0, min_value=0)
        pref_period = _safe_int(raw.get("period_id"), default=0, min_value=0)
        day_of_week = _safe_int(raw.get("day_of_week"), default=0, min_value=0)
        start_seconds = _parse_time_to_seconds(raw.get("start_time"))
        end_seconds = _parse_time_to_seconds(raw.get("end_time"))
        pref_type_raw = str(raw.get("preference_type", "avoid")).strip().lower()
        pref_type = "prefer" if pref_type_raw == "prefer" else "avoid"

        if teacher_id <= 0 or day_of_week <= 0 or start_seconds is None or end_seconds is None:
            warnings.append(
                _issue(
                    "INVALID_TEACHER_PREFERENCE",
                    "Teacher preference di-skip karena data tidak valid",
                    {"preference": raw},
                )
            )
            continue
        if start_seconds >= end_seconds:
            warnings.append(
                _issue(
                    "INVALID_TEACHER_PREFERENCE_RANGE",
                    f"Teacher preference #{pref_id or 'unknown'} di-skip karena rentang waktu tidak valid",
                )
            )
            continue
        if pref_period != period_id:
            warnings.append(
                _issue(
                    "TEACHER_PREFERENCE_PERIOD_MISMATCH",
                    f"Teacher preference #{pref_id or 'unknown'} di-skip karena period_id berbeda",
                )
            )
            continue

        preferences.append(
            {
                "id": pref_id,
                "teacher_id": teacher_id,
                "period_id": pref_period,
                "day_of_week": day_of_week,
                "start_seconds": start_seconds,
                "end_seconds": end_seconds,
                "preference_type": pref_type,
                "notes": raw.get("notes"),
            }
        )

    student_enrollment_map: dict[int, set[int]] = defaultdict(set)
    for raw in raw_student_enrollments:
        student_id = _safe_int(raw.get("student_id"), default=0, min_value=0)
        rombel_ids_raw = raw.get("rombel_ids")

        if student_id <= 0:
            warnings.append(
                _issue(
                    "INVALID_STUDENT_ENROLLMENT",
                    "Student enrollment di-skip karena student_id tidak valid",
                    {"enrollment": raw},
                )
            )
            continue

        if not isinstance(rombel_ids_raw, list):
            warnings.append(
                _issue(
                    "INVALID_STUDENT_ENROLLMENT",
                    "Student enrollment di-skip karena rombel_ids bukan array",
                    {"student_id": student_id},
                )
            )
            continue

        for raw_rombel_id in rombel_ids_raw:
            rombel_id = _safe_int(raw_rombel_id, default=0, min_value=0)
            if rombel_id > 0:
                student_enrollment_map[student_id].add(rombel_id)

    student_enrollments: list[dict[str, Any]] = []
    for student_id, rombel_ids in student_enrollment_map.items():
        if not rombel_ids:
            continue
        student_enrollments.append(
            {
                "student_id": student_id,
                "rombel_ids": sorted(rombel_ids),
            }
        )

    if raw_student_enrollments and not student_enrollments:
        warnings.append(
            _issue(
                "STUDENT_ENROLLMENT_EMPTY",
                "Semua student_enrollments diabaikan karena tidak valid",
            )
        )

    return {
        "period_id": period_id,
        "assignments": assignments,
        "slots": slots,
        "preferences": preferences,
        "student_enrollments": student_enrollments,
    }, warnings, conflicts


def _build_student_assignment_maps(
    assignments: list[dict[str, Any]],
    student_enrollments: list[dict[str, Any]],
) -> tuple[dict[int, tuple[int, ...]], dict[int, tuple[int, ...]], list[dict[str, Any]]]:
    warnings: list[dict[str, Any]] = []

    assignments_by_rombel: dict[int, set[int]] = defaultdict(set)
    for assignment in assignments:
        track = _resolve_assignment_track(assignment)
        if track == "elective":
            continue
        assignments_by_rombel[assignment["rombel_id"]].add(assignment["id"])

    student_assignment_map: dict[int, tuple[int, ...]] = {}
    assignment_student_map: dict[int, list[int]] = defaultdict(list)

    for enrollment in student_enrollments:
        student_id = enrollment["student_id"]
        rombel_ids = enrollment["rombel_ids"]

        assignment_ids: set[int] = set()
        unknown_rombels: list[int] = []
        for rombel_id in rombel_ids:
            mapped_assignments = assignments_by_rombel.get(rombel_id)
            if not mapped_assignments:
                unknown_rombels.append(rombel_id)
                continue
            assignment_ids.update(mapped_assignments)

        if unknown_rombels:
            warnings.append(
                _issue(
                    "STUDENT_ENROLLMENT_ROMBEL_UNUSED",
                    f"Sebagian rombel pada student #{student_id} tidak punya pengampu aktif",
                    {"student_id": student_id, "rombel_ids": unknown_rombels},
                )
            )

        if len(assignment_ids) <= 1:
            continue

        ordered_assignments = tuple(sorted(assignment_ids))
        student_assignment_map[student_id] = ordered_assignments
        for assignment_id in ordered_assignments:
            assignment_student_map[assignment_id].append(student_id)

    assignment_student_tuple_map = {
        assignment_id: tuple(sorted(student_ids))
        for assignment_id, student_ids in assignment_student_map.items()
    }

    return student_assignment_map, assignment_student_tuple_map, warnings


def _build_grade_track_assignment_map(
    assignments: list[dict[str, Any]],
) -> tuple[dict[int, dict[str, tuple[int, ...]]], dict[int, int], dict[int, str], list[dict[str, Any]]]:
    warnings: list[dict[str, Any]] = []
    grade_track_raw: dict[int, dict[str, list[int]]] = defaultdict(
        lambda: {"mandatory": [], "elective": []}
    )
    assignment_grade_map: dict[int, int] = {}
    assignment_track_map: dict[int, str] = {}

    for assignment in assignments:
        assignment_id = assignment["id"]
        grade_level = _safe_int(assignment.get("grade_level"), default=0, min_value=0)
        track = _resolve_assignment_track(assignment)

        if assignment.get("subject_type") == "wajib" and assignment.get("rombel_type") == "peminatan":
            warnings.append(
                _issue(
                    "ASSIGNMENT_TRACK_INCONSISTENT",
                    f"Pengampu #{assignment_id} memiliki subject_type wajib namun rombel_type peminatan",
                )
            )
        if assignment.get("subject_type") == "peminatan" and assignment.get("rombel_type") == "utama":
            warnings.append(
                _issue(
                    "ASSIGNMENT_TRACK_INCONSISTENT",
                    f"Pengampu #{assignment_id} memiliki subject_type peminatan namun rombel_type utama",
                )
            )

        if grade_level <= 0:
            if track:
                warnings.append(
                    _issue(
                        "ASSIGNMENT_GRADE_MISSING",
                        f"Pengampu #{assignment_id} tidak memiliki grade_level valid, aturan wajib vs peminatan tingkat kelas tidak diterapkan",
                    )
                )
            continue

        assignment_grade_map[assignment_id] = grade_level
        if not track:
            continue

        assignment_track_map[assignment_id] = track
        grade_track_raw[grade_level][track].append(assignment_id)

    grade_track_map: dict[int, dict[str, tuple[int, ...]]] = {}
    for grade_level, buckets in grade_track_raw.items():
        grade_track_map[grade_level] = {
            "mandatory": tuple(sorted(set(buckets["mandatory"]))),
            "elective": tuple(sorted(set(buckets["elective"]))),
        }

    return grade_track_map, assignment_grade_map, assignment_track_map, warnings


def _build_preference_score_map(
    assignments: list[dict[str, Any]],
    slots: list[dict[str, Any]],
    preferences: list[dict[str, Any]],
    weights: dict[str, int],
) -> tuple[dict[tuple[int, int], int], list[dict[str, Any]]]:
    warnings: list[dict[str, Any]] = []

    relevant_teachers = {assignment["teacher_id"] for assignment in assignments}
    preference_score_map: dict[tuple[int, int], int] = defaultdict(int)
    slot_by_day: dict[int, list[dict[str, Any]]] = defaultdict(list)

    for slot in slots:
        slot_by_day[slot["day_of_week"]].append(slot)

    for pref in preferences:
        teacher_id = pref["teacher_id"]
        if teacher_id not in relevant_teachers:
            continue

        matched = 0
        delta = (
            weights["prefer_weight"]
            if pref["preference_type"] == "prefer"
            else -weights["avoid_penalty"]
        )

        for slot in slot_by_day.get(pref["day_of_week"], []):
            overlaps = pref["start_seconds"] < slot["end_seconds"] and pref["end_seconds"] > slot["start_seconds"]
            if not overlaps:
                continue
            preference_score_map[(teacher_id, slot["id"])] += delta
            matched += 1

        if matched == 0:
            warnings.append(
                _issue(
                    "TEACHER_PREFERENCE_UNMATCHED",
                    "Teacher preference tidak cocok dengan slot manapun",
                    {
                        "preference_id": pref["id"],
                        "teacher_id": teacher_id,
                        "day_of_week": pref["day_of_week"],
                    },
                )
            )

    return dict(preference_score_map), warnings


def _schedule_map_to_items(
    schedule_map: dict[int, tuple[int, ...]],
    assignments_by_id: dict[int, dict[str, Any]],
    slots_by_id: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []

    for assignment_id, slot_ids in schedule_map.items():
        assignment = assignments_by_id[assignment_id]
        for slot_id in slot_ids:
            result.append(
                {
                    "rombel_id": assignment["rombel_id"],
                    "time_slot_id": slot_id,
                    "teaching_assignment_id": assignment_id,
                    "room": None,
                }
            )

    result.sort(
        key=lambda item: (
            assignments_by_id[item["teaching_assignment_id"]]["rombel_id"],
            slots_by_id[item["time_slot_id"]]["day_of_week"],
            slots_by_id[item["time_slot_id"]]["start_seconds"],
            item["teaching_assignment_id"],
        )
    )
    return result


def _build_slot_day_structures(
    slots_by_id: dict[int, dict[str, Any]],
) -> tuple[dict[int, tuple[int, ...]], dict[int, tuple[int, int]]]:
    day_slots_raw: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for slot_id, slot in slots_by_id.items():
        day_of_week = _safe_int(slot.get("day_of_week"), default=0, min_value=0)
        start_seconds = _safe_int(slot.get("start_seconds"), default=0, min_value=0)
        day_slots_raw[day_of_week].append((start_seconds, slot_id))

    slot_day_ordered_map: dict[int, tuple[int, ...]] = {}
    slot_day_position_map: dict[int, tuple[int, int]] = {}

    for day_of_week, entries in day_slots_raw.items():
        entries.sort(key=lambda item: (item[0], item[1]))
        ordered_slot_ids = tuple(slot_id for _, slot_id in entries)
        slot_day_ordered_map[day_of_week] = ordered_slot_ids
        for index, slot_id in enumerate(ordered_slot_ids):
            slot_day_position_map[slot_id] = (day_of_week, index)

    return slot_day_ordered_map, slot_day_position_map


def _evaluate_schedule(
    schedule_map: dict[int, tuple[int, ...]],
    assignments: list[dict[str, Any]],
    slots_by_id: dict[int, dict[str, Any]],
    slot_day_position_map: dict[int, tuple[int, int]],
    preference_score_map: dict[tuple[int, int], int],
    day_spread_weight: int,
    assignment_student_map: dict[int, tuple[int, ...]],
    assignment_grade_map: dict[int, int],
    assignment_track_map: dict[int, str],
    max_teacher_daily_hours: int,
    enforce_consecutive_small_assignments: bool,
    rombel_daily_subject_limit: int,
    rombel_daily_subject_overload_penalty: int,
) -> tuple[int, bool]:
    teacher_busy: set[tuple[int, int]] = set()
    rombel_busy: set[tuple[int, int]] = set()
    student_busy: set[tuple[int, int]] = set()
    teacher_day_load: dict[tuple[int, int], int] = defaultdict(int)
    grade_slot_track: dict[tuple[int, int], set[str]] = defaultdict(set)
    rombel_day_subjects: dict[tuple[int, int], set[int]] = defaultdict(set)
    score = 0

    for assignment in assignments:
        assignment_id = assignment["id"]
        teacher_id = assignment["teacher_id"]
        rombel_id = assignment["rombel_id"]
        subject_id = assignment["subject_id"]
        student_ids = assignment_student_map.get(assignment_id, tuple())
        grade_level = assignment_grade_map.get(assignment_id, 0)
        track = assignment_track_map.get(assignment_id)
        expected_hours = assignment["weekly_hours"]
        slot_ids = schedule_map.get(assignment_id, tuple())

        if len(slot_ids) != expected_hours:
            return -1_000_000_000, False
        if len(set(slot_ids)) != len(slot_ids):
            return -1_000_000_000, False

        if _is_small_consecutive_assignment(assignment, enforce_consecutive_small_assignments):
            slot_positions: list[tuple[int, int]] = []
            for slot_id in slot_ids:
                slot_position = slot_day_position_map.get(slot_id)
                if slot_position is None:
                    return -1_000_000_000, False
                slot_positions.append(slot_position)

            days = {day for day, _ in slot_positions}
            if len(days) != 1:
                return -1_000_000_000, False

            ordered_positions = sorted(position for _, position in slot_positions)
            expected_positions = list(range(ordered_positions[0], ordered_positions[0] + expected_hours))
            if ordered_positions != expected_positions:
                return -1_000_000_000, False

        used_days = set()
        for slot_id in slot_ids:
            if slot_id not in slots_by_id:
                return -1_000_000_000, False

            teacher_key = (teacher_id, slot_id)
            rombel_key = (rombel_id, slot_id)
            if teacher_key in teacher_busy or rombel_key in rombel_busy:
                return -1_000_000_000, False

            for student_id in student_ids:
                student_key = (student_id, slot_id)
                if student_key in student_busy:
                    return -1_000_000_000, False

            teacher_busy.add(teacher_key)
            rombel_busy.add(rombel_key)
            for student_id in student_ids:
                student_busy.add((student_id, slot_id))

            day_of_week = slots_by_id[slot_id]["day_of_week"]
            teacher_day_key = (teacher_id, day_of_week)
            teacher_day_load[teacher_day_key] += 1
            if max_teacher_daily_hours > 0 and teacher_day_load[teacher_day_key] > max_teacher_daily_hours:
                return -1_000_000_000, False
            rombel_day_subjects[(rombel_id, day_of_week)].add(subject_id)

            if grade_level > 0 and track:
                state = grade_slot_track[(grade_level, slot_id)]
                if track == "mandatory" and "elective" in state:
                    return -1_000_000_000, False
                if track == "elective" and "mandatory" in state:
                    return -1_000_000_000, False
                state.add(track)

            score += preference_score_map.get((teacher_id, slot_id), 0)
            used_days.add(slots_by_id[slot_id]["day_of_week"])

        score += day_spread_weight * len(used_days)

    if rombel_daily_subject_overload_penalty > 0 and rombel_daily_subject_limit > 0:
        for subjects in rombel_day_subjects.values():
            overload = len(subjects) - rombel_daily_subject_limit
            if overload > 0:
                score -= rombel_daily_subject_overload_penalty * overload

    return score, True


def _solve_cp_sat(
    assignments: list[dict[str, Any]],
    slots: list[dict[str, Any]],
    preference_score_map: dict[tuple[int, int], int],
    student_assignment_map: dict[int, tuple[int, ...]],
    grade_track_map: dict[int, dict[str, tuple[int, ...]]],
    config: dict[str, Any],
) -> tuple[dict[int, tuple[int, ...]] | None, int, list[dict[str, Any]]]:
    model = cp_model.CpModel()

    slot_ids = [slot["id"] for slot in slots]
    assignments_by_teacher: dict[int, list[int]] = defaultdict(list)
    assignments_by_rombel: dict[int, list[int]] = defaultdict(list)
    assignments_by_rombel_subject: dict[tuple[int, int], list[int]] = defaultdict(list)
    slots_by_day: dict[int, list[int]] = defaultdict(list)
    max_teacher_daily_hours = _safe_int(config.get("max_teacher_daily_hours"), default=0, min_value=0)
    enforce_consecutive_small_assignments = bool(config.get("enforce_consecutive_small_assignments", True))
    rombel_daily_subject_limit = _safe_int(
        config["objective"].get("rombel_daily_subject_limit"),
        default=FIXED_ROMBEL_DAILY_SUBJECT_LIMIT,
        min_value=1,
    )
    rombel_daily_subject_overload_penalty = abs(
        _safe_int(
            config["objective"].get("rombel_daily_subject_overload_penalty"),
            default=FIXED_ROMBEL_DAILY_SUBJECT_OVERLOAD_PENALTY,
            min_value=0,
            max_value=100,
        )
    )

    for assignment in assignments:
        assignments_by_teacher[assignment["teacher_id"]].append(assignment["id"])
        assignments_by_rombel[assignment["rombel_id"]].append(assignment["id"])
        assignments_by_rombel_subject[(assignment["rombel_id"], assignment["subject_id"])].append(assignment["id"])
    for slot in slots:
        slots_by_day[slot["day_of_week"]].append(slot["id"])

    x: dict[tuple[int, int], cp_model.IntVar] = {}
    for assignment in assignments:
        assignment_id = assignment["id"]
        for slot_id in slot_ids:
            x[(assignment_id, slot_id)] = model.NewBoolVar(f"x_a{assignment_id}_s{slot_id}")

    for assignment in assignments:
        assignment_id = assignment["id"]
        model.Add(
            sum(x[(assignment_id, slot_id)] for slot_id in slot_ids) == assignment["weekly_hours"]
        )

    for teacher_id, assignment_ids in assignments_by_teacher.items():
        for slot_id in slot_ids:
            model.Add(sum(x[(assignment_id, slot_id)] for assignment_id in assignment_ids) <= 1)
        if max_teacher_daily_hours > 0:
            for day_of_week, day_slot_ids in slots_by_day.items():
                model.Add(
                    sum(x[(assignment_id, slot_id)] for assignment_id in assignment_ids for slot_id in day_slot_ids)
                    <= max_teacher_daily_hours
                )

    for rombel_id, assignment_ids in assignments_by_rombel.items():
        for slot_id in slot_ids:
            model.Add(sum(x[(assignment_id, slot_id)] for assignment_id in assignment_ids) <= 1)

    for student_id, assignment_ids in student_assignment_map.items():
        for slot_id in slot_ids:
            model.Add(sum(x[(assignment_id, slot_id)] for assignment_id in assignment_ids) <= 1)

    for assignment in assignments:
        if not _is_small_consecutive_assignment(assignment, enforce_consecutive_small_assignments):
            continue

        assignment_id = assignment["id"]
        needed = assignment["weekly_hours"]
        block_vars: list[tuple[cp_model.IntVar, tuple[int, ...]]] = []

        for day_of_week, day_slot_ids in slots_by_day.items():
            if len(day_slot_ids) < needed:
                continue
            for start_index in range(len(day_slot_ids) - needed + 1):
                block_slot_ids = tuple(day_slot_ids[start_index:start_index + needed])
                block_var = model.NewBoolVar(
                    f"block_a{assignment_id}_d{day_of_week}_i{start_index}"
                )
                block_vars.append((block_var, block_slot_ids))

        if not block_vars:
            return None, 0, [
                _issue(
                    "CONSECUTIVE_BLOCK_UNAVAILABLE",
                    f"Pengampu #{assignment_id} membutuhkan blok berurutan {needed} JP, namun slot harian tidak memadai",
                )
            ]

        model.Add(sum(block_var for block_var, _ in block_vars) == 1)

        for slot_id in slot_ids:
            covering_block_vars = [
                block_var
                for block_var, block_slot_ids in block_vars
                if slot_id in block_slot_ids
            ]
            if covering_block_vars:
                model.Add(x[(assignment_id, slot_id)] == sum(covering_block_vars))
            else:
                model.Add(x[(assignment_id, slot_id)] == 0)

    for grade_level, bucket in grade_track_map.items():
        mandatory_ids = bucket.get("mandatory", tuple())
        elective_ids = bucket.get("elective", tuple())
        if not mandatory_ids or not elective_ids:
            continue

        for slot_id in slot_ids:
            mandatory_active = model.NewBoolVar(f"grade_{grade_level}_slot_{slot_id}_mandatory")
            elective_active = model.NewBoolVar(f"grade_{grade_level}_slot_{slot_id}_elective")

            mandatory_sum = sum(x[(assignment_id, slot_id)] for assignment_id in mandatory_ids)
            elective_sum = sum(x[(assignment_id, slot_id)] for assignment_id in elective_ids)

            for assignment_id in mandatory_ids:
                model.Add(x[(assignment_id, slot_id)] <= mandatory_active)
            model.Add(mandatory_active <= mandatory_sum)

            for assignment_id in elective_ids:
                model.Add(x[(assignment_id, slot_id)] <= elective_active)
            model.Add(elective_active <= elective_sum)

            model.Add(mandatory_active + elective_active <= 1)

    objective_terms: list[Any] = []
    for assignment in assignments:
        teacher_id = assignment["teacher_id"]
        assignment_id = assignment["id"]
        for slot_id in slot_ids:
            pref_score = preference_score_map.get((teacher_id, slot_id), 0)
            if pref_score:
                objective_terms.append(pref_score * x[(assignment_id, slot_id)])

    day_spread_weight = config["objective"]["day_spread_weight"]
    if day_spread_weight > 0:
        for assignment in assignments:
            assignment_id = assignment["id"]
            for day, day_slot_ids in slots_by_day.items():
                active_day = model.NewBoolVar(f"day_a{assignment_id}_d{day}")
                day_sum = sum(x[(assignment_id, slot_id)] for slot_id in day_slot_ids)
                for slot_id in day_slot_ids:
                    model.Add(x[(assignment_id, slot_id)] <= active_day)
                model.Add(active_day <= day_sum)
                objective_terms.append(day_spread_weight * active_day)

    # Soft constraint: maksimal 5 mapel berbeda per rombel per hari.
    if rombel_daily_subject_overload_penalty > 0 and rombel_daily_subject_limit > 0:
        subject_groups_by_rombel: dict[int, list[tuple[int, list[int]]]] = defaultdict(list)
        for (rombel_id, subject_id), assignment_ids in assignments_by_rombel_subject.items():
            subject_groups_by_rombel[rombel_id].append((subject_id, assignment_ids))

        for rombel_id, subject_groups in subject_groups_by_rombel.items():
            total_subject_groups = len(subject_groups)
            if total_subject_groups <= rombel_daily_subject_limit:
                continue

            for day, day_slot_ids in slots_by_day.items():
                active_subject_vars: list[cp_model.IntVar] = []

                for subject_id, assignment_ids in subject_groups:
                    active_subject = model.NewBoolVar(
                        f"rombel_{rombel_id}_day_{day}_subject_{subject_id}_active"
                    )
                    day_sum = sum(
                        x[(assignment_id, slot_id)]
                        for assignment_id in assignment_ids
                        for slot_id in day_slot_ids
                    )
                    for assignment_id in assignment_ids:
                        for slot_id in day_slot_ids:
                            model.Add(x[(assignment_id, slot_id)] <= active_subject)
                    model.Add(active_subject <= day_sum)
                    active_subject_vars.append(active_subject)

                overload = model.NewIntVar(
                    0,
                    total_subject_groups,
                    f"rombel_{rombel_id}_day_{day}_subject_overload",
                )
                model.Add(overload >= sum(active_subject_vars) - rombel_daily_subject_limit)
                model.Add(overload >= 0)
                objective_terms.append(-rombel_daily_subject_overload_penalty * overload)

    if objective_terms:
        model.Maximize(sum(objective_terms))
    else:
        model.Maximize(0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(config["solver_seconds"])
    solver.parameters.num_search_workers = int(config["solver_workers"])
    solver.parameters.random_seed = int(config["random_seed"])

    status = solver.Solve(model)
    if status not in {cp_model.OPTIMAL, cp_model.FEASIBLE}:
        return None, 0, [
            _issue(
                "CP_SAT_INFEASIBLE",
                "CP-SAT tidak menemukan solusi feasible",
                {
                    "solver_status": solver.StatusName(status),
                    "solver_seconds": config["solver_seconds"],
                },
            )
        ]

    schedule_map: dict[int, tuple[int, ...]] = {}
    for assignment in assignments:
        assignment_id = assignment["id"]
        chosen_slots = [
            slot_id
            for slot_id in slot_ids
            if solver.BooleanValue(x[(assignment_id, slot_id)])
        ]
        chosen_slots.sort()
        schedule_map[assignment_id] = tuple(chosen_slots)

    objective_value = int(round(solver.ObjectiveValue()))
    return schedule_map, objective_value, []


def _clone_schedule_map(schedule_map: dict[int, tuple[int, ...]]) -> dict[int, tuple[int, ...]]:
    return {assignment_id: tuple(slot_ids) for assignment_id, slot_ids in schedule_map.items()}


def _make_random_feasible_schedule(
    assignments: list[dict[str, Any]],
    slot_ids: list[int],
    slots_by_id: dict[int, dict[str, Any]],
    slot_day_ordered_map: dict[int, tuple[int, ...]],
    preference_score_map: dict[tuple[int, int], int],
    assignment_student_map: dict[int, tuple[int, ...]],
    assignment_grade_map: dict[int, int],
    assignment_track_map: dict[int, str],
    max_teacher_daily_hours: int,
    enforce_consecutive_small_assignments: bool,
    rng: random.Random,
    max_attempts: int,
) -> dict[int, tuple[int, ...]] | None:
    for _ in range(max_attempts):
        teacher_busy: set[tuple[int, int]] = set()
        rombel_busy: set[tuple[int, int]] = set()
        student_busy: set[tuple[int, int]] = set()
        teacher_day_load: dict[tuple[int, int], int] = defaultdict(int)
        grade_slot_track: dict[tuple[int, int], set[str]] = defaultdict(set)
        schedule_map: dict[int, tuple[int, ...]] = {}

        assignment_order = sorted(
            assignments,
            key=lambda item: (item["weekly_hours"], rng.random()),
            reverse=True,
        )

        failed = False
        for assignment in assignment_order:
            assignment_id = assignment["id"]
            teacher_id = assignment["teacher_id"]
            rombel_id = assignment["rombel_id"]
            student_ids = assignment_student_map.get(assignment_id, tuple())
            grade_level = assignment_grade_map.get(assignment_id, 0)
            track = assignment_track_map.get(assignment_id)
            needed = assignment["weekly_hours"]
            block_required = _is_small_consecutive_assignment(
                assignment,
                enforce_consecutive_small_assignments,
            )

            if block_required:
                candidate_blocks: list[tuple[int, ...]] = []
                for day_of_week, day_slot_ids in slot_day_ordered_map.items():
                    if len(day_slot_ids) < needed:
                        continue
                    if max_teacher_daily_hours > 0:
                        current_day_load = teacher_day_load[(teacher_id, day_of_week)]
                        if current_day_load + needed > max_teacher_daily_hours:
                            continue

                    for start_index in range(len(day_slot_ids) - needed + 1):
                        block_slot_ids = tuple(day_slot_ids[start_index:start_index + needed])
                        valid_block = True
                        for slot_id in block_slot_ids:
                            if (teacher_id, slot_id) in teacher_busy or (rombel_id, slot_id) in rombel_busy:
                                valid_block = False
                                break
                            if any((student_id, slot_id) in student_busy for student_id in student_ids):
                                valid_block = False
                                break
                            if grade_level > 0 and track:
                                state = grade_slot_track[(grade_level, slot_id)]
                                if track == "mandatory" and "elective" in state:
                                    valid_block = False
                                    break
                                if track == "elective" and "mandatory" in state:
                                    valid_block = False
                                    break

                        if valid_block:
                            candidate_blocks.append(block_slot_ids)

                if not candidate_blocks:
                    failed = True
                    break

                candidate_blocks.sort(
                    key=lambda block_slot_ids: (
                        sum(preference_score_map.get((teacher_id, slot_id), 0) for slot_id in block_slot_ids)
                        + rng.random()
                    ),
                    reverse=True,
                )
                top_k = min(5, len(candidate_blocks))
                chosen_slots = list(rng.choice(candidate_blocks[:top_k]))

                for slot_id in chosen_slots:
                    teacher_busy.add((teacher_id, slot_id))
                    rombel_busy.add((rombel_id, slot_id))
                    for student_id in student_ids:
                        student_busy.add((student_id, slot_id))

                    day_of_week = slots_by_id[slot_id]["day_of_week"]
                    teacher_day_load[(teacher_id, day_of_week)] += 1
                    if grade_level > 0 and track:
                        grade_slot_track[(grade_level, slot_id)].add(track)

                chosen_slots.sort()
                schedule_map[assignment_id] = tuple(chosen_slots)
                continue

            available = [
                slot_id
                for slot_id in slot_ids
                if (teacher_id, slot_id) not in teacher_busy
                and (rombel_id, slot_id) not in rombel_busy
                and all((student_id, slot_id) not in student_busy for student_id in student_ids)
                and (
                    max_teacher_daily_hours <= 0
                    or teacher_day_load[(teacher_id, slots_by_id[slot_id]["day_of_week"])] < max_teacher_daily_hours
                )
                and (
                    grade_level <= 0
                    or not track
                    or (
                        track == "mandatory"
                        and "elective" not in grade_slot_track[(grade_level, slot_id)]
                    )
                    or (
                        track == "elective"
                        and "mandatory" not in grade_slot_track[(grade_level, slot_id)]
                    )
                )
            ]

            if len(available) < needed:
                failed = True
                break

            used_days: dict[int, int] = defaultdict(int)
            chosen_slots: list[int] = []

            while len(chosen_slots) < needed:
                candidates = [
                    slot_id
                    for slot_id in available
                    if slot_id not in chosen_slots
                    and (
                        max_teacher_daily_hours <= 0
                        or teacher_day_load[(teacher_id, slots_by_id[slot_id]["day_of_week"])] < max_teacher_daily_hours
                    )
                ]
                if not candidates:
                    failed = True
                    break

                candidates.sort(
                    key=lambda slot_id: (
                        preference_score_map.get((teacher_id, slot_id), 0)
                        - (used_days[slots_by_id[slot_id]["day_of_week"]] * 2)
                        + rng.random()
                    ),
                    reverse=True,
                )

                top_k = min(5, len(candidates))
                picked_slot = rng.choice(candidates[:top_k])
                chosen_slots.append(picked_slot)
                day_of_week = slots_by_id[picked_slot]["day_of_week"]
                used_days[day_of_week] += 1
                teacher_busy.add((teacher_id, picked_slot))
                rombel_busy.add((rombel_id, picked_slot))
                teacher_day_load[(teacher_id, day_of_week)] += 1
                for student_id in student_ids:
                    student_busy.add((student_id, picked_slot))
                if grade_level > 0 and track:
                    grade_slot_track[(grade_level, picked_slot)].add(track)

            if failed:
                break

            chosen_slots.sort()
            schedule_map[assignment_id] = tuple(chosen_slots)

        if not failed and len(schedule_map) == len(assignments):
            return schedule_map

    return None


def _mutate_schedule(
    schedule_map: dict[int, tuple[int, ...]],
    assignments: list[dict[str, Any]],
    assignments_by_id: dict[int, dict[str, Any]],
    slot_ids: list[int],
    slots_by_id: dict[int, dict[str, Any]],
    slot_day_position_map: dict[int, tuple[int, int]],
    preference_score_map: dict[tuple[int, int], int],
    day_spread_weight: int,
    assignment_student_map: dict[int, tuple[int, ...]],
    assignment_grade_map: dict[int, int],
    assignment_track_map: dict[int, str],
    max_teacher_daily_hours: int,
    enforce_consecutive_small_assignments: bool,
    rombel_daily_subject_limit: int,
    rombel_daily_subject_overload_penalty: int,
    rng: random.Random,
) -> dict[int, tuple[int, ...]]:
    base = _clone_schedule_map(schedule_map)
    assignment_ids = [assignment["id"] for assignment in assignments]
    rng.shuffle(assignment_ids)

    for assignment_id in assignment_ids:
        assignment = assignments_by_id[assignment_id]
        current_slots = list(base.get(assignment_id, tuple()))
        if not current_slots:
            continue

        old_slot = rng.choice(current_slots)
        candidate_slots = [slot_id for slot_id in slot_ids if slot_id not in current_slots]
        rng.shuffle(candidate_slots)
        candidate_slots.sort(
            key=lambda slot_id: preference_score_map.get((assignment["teacher_id"], slot_id), 0),
            reverse=True,
        )

        for new_slot in candidate_slots[:20]:
            next_slots = sorted([(new_slot if slot_id == old_slot else slot_id) for slot_id in current_slots])
            trial = _clone_schedule_map(base)
            trial[assignment_id] = tuple(next_slots)
            _, feasible = _evaluate_schedule(
                trial,
                assignments,
                slots_by_id,
                slot_day_position_map,
                preference_score_map,
                day_spread_weight,
                assignment_student_map,
                assignment_grade_map,
                assignment_track_map,
                max_teacher_daily_hours,
                enforce_consecutive_small_assignments,
                rombel_daily_subject_limit,
                rombel_daily_subject_overload_penalty,
            )
            if feasible:
                return trial

    return base


def _crossover_schedules(
    parent_a: dict[int, tuple[int, ...]],
    parent_b: dict[int, tuple[int, ...]],
    assignments: list[dict[str, Any]],
    slots_by_id: dict[int, dict[str, Any]],
    slot_day_position_map: dict[int, tuple[int, int]],
    preference_score_map: dict[tuple[int, int], int],
    day_spread_weight: int,
    assignment_student_map: dict[int, tuple[int, ...]],
    assignment_grade_map: dict[int, int],
    assignment_track_map: dict[int, str],
    max_teacher_daily_hours: int,
    enforce_consecutive_small_assignments: bool,
    rombel_daily_subject_limit: int,
    rombel_daily_subject_overload_penalty: int,
    rng: random.Random,
) -> dict[int, tuple[int, ...]]:
    child = _clone_schedule_map(parent_a)
    assignment_ids = [assignment["id"] for assignment in assignments]
    rng.shuffle(assignment_ids)
    take_count = max(1, len(assignment_ids) // 2)

    for assignment_id in assignment_ids[:take_count]:
        if assignment_id not in parent_b:
            continue
        trial = _clone_schedule_map(child)
        trial[assignment_id] = tuple(parent_b[assignment_id])
        _, feasible = _evaluate_schedule(
            trial,
            assignments,
            slots_by_id,
            slot_day_position_map,
            preference_score_map,
            day_spread_weight,
            assignment_student_map,
            assignment_grade_map,
            assignment_track_map,
            max_teacher_daily_hours,
            enforce_consecutive_small_assignments,
            rombel_daily_subject_limit,
            rombel_daily_subject_overload_penalty,
        )
        if feasible:
            child = trial

    return child


def _tournament_pick(
    scored_population: list[tuple[int, dict[int, tuple[int, ...]]]],
    rng: random.Random,
    size: int,
) -> dict[int, tuple[int, ...]]:
    k = min(size, len(scored_population))
    contenders = rng.sample(scored_population, k=k)
    contenders.sort(key=lambda item: item[0], reverse=True)
    return _clone_schedule_map(contenders[0][1])


def _run_ga_refinement(
    base_schedule: dict[int, tuple[int, ...]],
    base_score: int,
    assignments: list[dict[str, Any]],
    slot_ids: list[int],
    slots_by_id: dict[int, dict[str, Any]],
    slot_day_ordered_map: dict[int, tuple[int, ...]],
    slot_day_position_map: dict[int, tuple[int, int]],
    preference_score_map: dict[tuple[int, int], int],
    assignment_student_map: dict[int, tuple[int, ...]],
    assignment_grade_map: dict[int, int],
    assignment_track_map: dict[int, str],
    max_teacher_daily_hours: int,
    enforce_consecutive_small_assignments: bool,
    rombel_daily_subject_limit: int,
    rombel_daily_subject_overload_penalty: int,
    config: dict[str, Any],
) -> tuple[dict[int, tuple[int, ...]], int, list[dict[str, Any]]]:
    warnings: list[dict[str, Any]] = []

    if not config["ga_enabled"]:
        warnings.append(
            _issue(
                "GA_DISABLED",
                "Tahap Genetic Algorithm dilewati karena konfigurasi menonaktifkan GA",
            )
        )
        return base_schedule, base_score, warnings

    population_size = max(config["ga_population"], config["ga_elite_count"] + 2)
    rng = random.Random(config["random_seed"] + 97)
    assignments_by_id = {assignment["id"]: assignment for assignment in assignments}
    day_spread_weight = config["objective"]["day_spread_weight"]

    population: list[dict[int, tuple[int, ...]]] = [_clone_schedule_map(base_schedule)]
    while len(population) < population_size:
        candidate = _make_random_feasible_schedule(
            assignments=assignments,
            slot_ids=slot_ids,
            slots_by_id=slots_by_id,
            slot_day_ordered_map=slot_day_ordered_map,
            preference_score_map=preference_score_map,
            assignment_student_map=assignment_student_map,
            assignment_grade_map=assignment_grade_map,
            assignment_track_map=assignment_track_map,
            max_teacher_daily_hours=max_teacher_daily_hours,
            enforce_consecutive_small_assignments=enforce_consecutive_small_assignments,
            rng=rng,
            max_attempts=config["ga_seed_attempts"],
        )
        if candidate is None:
            candidate = _mutate_schedule(
                schedule_map=population[0],
                assignments=assignments,
                assignments_by_id=assignments_by_id,
                slot_ids=slot_ids,
                slots_by_id=slots_by_id,
                slot_day_position_map=slot_day_position_map,
                preference_score_map=preference_score_map,
                day_spread_weight=day_spread_weight,
                assignment_student_map=assignment_student_map,
                assignment_grade_map=assignment_grade_map,
                assignment_track_map=assignment_track_map,
                max_teacher_daily_hours=max_teacher_daily_hours,
                enforce_consecutive_small_assignments=enforce_consecutive_small_assignments,
                rombel_daily_subject_limit=rombel_daily_subject_limit,
                rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                rng=rng,
            )
        population.append(candidate)

    best_schedule = _clone_schedule_map(base_schedule)
    best_score = base_score

    for _ in range(config["ga_generations"]):
        scored_population: list[tuple[int, dict[int, tuple[int, ...]]]] = []
        for individual in population:
            score, feasible = _evaluate_schedule(
                individual,
                assignments,
                slots_by_id,
                slot_day_position_map,
                preference_score_map,
                day_spread_weight,
                assignment_student_map,
                assignment_grade_map,
                assignment_track_map,
                max_teacher_daily_hours,
                enforce_consecutive_small_assignments,
                rombel_daily_subject_limit,
                rombel_daily_subject_overload_penalty,
            )
            if feasible:
                scored_population.append((score, individual))

        if not scored_population:
            warnings.append(
                _issue(
                    "GA_EMPTY_FEASIBLE_POPULATION",
                    "GA tidak memiliki kandidat feasible, kembali ke hasil CP-SAT",
                )
            )
            return base_schedule, base_score, warnings

        scored_population.sort(key=lambda item: item[0], reverse=True)
        if scored_population[0][0] > best_score:
            best_score = scored_population[0][0]
            best_schedule = _clone_schedule_map(scored_population[0][1])

        next_population: list[dict[int, tuple[int, ...]]] = []
        elite_count = min(config["ga_elite_count"], len(scored_population))
        for index in range(elite_count):
            next_population.append(_clone_schedule_map(scored_population[index][1]))

        while len(next_population) < population_size:
            parent_a = _tournament_pick(scored_population, rng, config["ga_tournament_size"])
            parent_b = _tournament_pick(scored_population, rng, config["ga_tournament_size"])

            child = parent_a
            if rng.random() < config["ga_crossover_rate"]:
                child = _crossover_schedules(
                    parent_a=parent_a,
                    parent_b=parent_b,
                    assignments=assignments,
                    slots_by_id=slots_by_id,
                    slot_day_position_map=slot_day_position_map,
                    preference_score_map=preference_score_map,
                    day_spread_weight=day_spread_weight,
                    assignment_student_map=assignment_student_map,
                    assignment_grade_map=assignment_grade_map,
                    assignment_track_map=assignment_track_map,
                    max_teacher_daily_hours=max_teacher_daily_hours,
                    enforce_consecutive_small_assignments=enforce_consecutive_small_assignments,
                    rombel_daily_subject_limit=rombel_daily_subject_limit,
                    rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                    rng=rng,
                )
            if rng.random() < config["ga_mutation_rate"]:
                child = _mutate_schedule(
                    schedule_map=child,
                    assignments=assignments,
                    assignments_by_id=assignments_by_id,
                    slot_ids=slot_ids,
                    slots_by_id=slots_by_id,
                    slot_day_position_map=slot_day_position_map,
                    preference_score_map=preference_score_map,
                    day_spread_weight=day_spread_weight,
                    assignment_student_map=assignment_student_map,
                    assignment_grade_map=assignment_grade_map,
                    assignment_track_map=assignment_track_map,
                    max_teacher_daily_hours=max_teacher_daily_hours,
                    enforce_consecutive_small_assignments=enforce_consecutive_small_assignments,
                    rombel_daily_subject_limit=rombel_daily_subject_limit,
                    rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                    rng=rng,
                )

            next_population.append(child)

        population = next_population

    if best_score <= base_score:
        warnings.append(
            _issue(
                "GA_NO_IMPROVEMENT",
                "GA selesai dijalankan namun tidak menemukan solusi lebih baik dari CP-SAT",
                {"cp_sat_score": base_score, "ga_best_score": best_score},
            )
        )
    else:
        warnings.append(
            _issue(
                "GA_IMPROVED_SOLUTION",
                "GA berhasil meningkatkan kualitas jadwal dari solusi CP-SAT",
                {"cp_sat_score": base_score, "ga_best_score": best_score},
            )
        )

    return best_schedule, best_score, warnings


def generate_schedule(data: dict[str, Any]) -> dict[str, Any]:
    generated_at = _now_iso()
    constraints = data.get("constraints") if isinstance(data.get("constraints"), dict) else {}
    config = _build_config(constraints)

    normalized, warnings, conflicts = _normalize_inputs(data)
    assignments = normalized["assignments"]
    slots = normalized["slots"]
    preferences = normalized["preferences"]
    student_enrollments = normalized["student_enrollments"]

    assignments_by_id = {assignment["id"]: assignment for assignment in assignments}
    slots_by_id = {slot["id"]: slot for slot in slots}
    slot_day_ordered_map, slot_day_position_map = _build_slot_day_structures(slots_by_id)
    total_requested_hours = sum(assignment["weekly_hours"] for assignment in assignments)
    max_teacher_daily_hours = _safe_int(config.get("max_teacher_daily_hours"), default=0, min_value=0)
    enforce_consecutive_small_assignments = bool(config.get("enforce_consecutive_small_assignments", True))
    rombel_daily_subject_limit = _safe_int(
        config["objective"].get("rombel_daily_subject_limit"),
        default=FIXED_ROMBEL_DAILY_SUBJECT_LIMIT,
        min_value=1,
    )
    rombel_daily_subject_overload_penalty = abs(
        _safe_int(
            config["objective"].get("rombel_daily_subject_overload_penalty"),
            default=FIXED_ROMBEL_DAILY_SUBJECT_OVERLOAD_PENALTY,
            min_value=0,
            max_value=100,
        )
    )

    preference_score_map: dict[tuple[int, int], int] = {}
    if assignments and slots:
        preference_score_map, preference_warnings = _build_preference_score_map(
            assignments=assignments,
            slots=slots,
            preferences=preferences,
            weights=config["objective"],
        )
        warnings.extend(preference_warnings)

    student_assignment_map: dict[int, tuple[int, ...]] = {}
    assignment_student_map: dict[int, tuple[int, ...]] = {}
    grade_track_map: dict[int, dict[str, tuple[int, ...]]] = {}
    assignment_grade_map: dict[int, int] = {}
    assignment_track_map: dict[int, str] = {}

    # Bentrok wajib-vs-peminatan dinonaktifkan sementara (konteks awal semester).
    # Karena itu, mapping student enrollment dan grade-track clash tidak digunakan.
    if ENABLE_WAJIB_PEMINATAN_CONFLICT_CHECK and assignments and student_enrollments:
        (
            student_assignment_map,
            assignment_student_map,
            student_mapping_warnings,
        ) = _build_student_assignment_maps(assignments, student_enrollments)
        warnings.extend(student_mapping_warnings)

    if ENABLE_WAJIB_PEMINATAN_CONFLICT_CHECK and assignments:
        (
            grade_track_map,
            assignment_grade_map,
            assignment_track_map,
            grade_track_warnings,
        ) = _build_grade_track_assignment_map(assignments)
        warnings.extend(grade_track_warnings)

    engine = "cp-sat"
    schedule_items: list[dict[str, Any]] = []
    feasible = False

    if not conflicts:
        cp_schedule_map, cp_score, cp_conflicts = _solve_cp_sat(
            assignments=assignments,
            slots=slots,
            preference_score_map=preference_score_map,
            student_assignment_map=student_assignment_map,
            grade_track_map=grade_track_map,
            config=config,
        )
        conflicts.extend(cp_conflicts)

        if cp_schedule_map:
            final_schedule_map = cp_schedule_map
            final_score = cp_score
            if config["ga_enabled"]:
                engine = "hybrid-cp-sat-ga"
                final_schedule_map, final_score, ga_warnings = _run_ga_refinement(
                    base_schedule=cp_schedule_map,
                    base_score=cp_score,
                    assignments=assignments,
                    slot_ids=[slot["id"] for slot in slots],
                    slots_by_id=slots_by_id,
                    slot_day_ordered_map=slot_day_ordered_map,
                    slot_day_position_map=slot_day_position_map,
                    preference_score_map=preference_score_map,
                    assignment_student_map=assignment_student_map,
                    assignment_grade_map=assignment_grade_map,
                    assignment_track_map=assignment_track_map,
                    max_teacher_daily_hours=max_teacher_daily_hours,
                    enforce_consecutive_small_assignments=enforce_consecutive_small_assignments,
                    rombel_daily_subject_limit=rombel_daily_subject_limit,
                    rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                    config=config,
                )
                warnings.extend(ga_warnings)
            schedule_items = _schedule_map_to_items(
                schedule_map=final_schedule_map,
                assignments_by_id=assignments_by_id,
                slots_by_id=slots_by_id,
            )
            feasible = len(schedule_items) == total_requested_hours
            if not feasible:
                conflicts.append(
                    _issue(
                        "UNASSIGNED_SESSIONS",
                        "Jumlah sesi terjadwal tidak memenuhi total weekly_hours",
                        {
                            "requested_sessions": total_requested_hours,
                            "generated_sessions": len(schedule_items),
                        },
                    )
                )
            if final_score < cp_score:
                warnings.append(
                    _issue(
                        "GA_SCORE_REGRESSION_GUARDED",
                        "Skor GA lebih rendah, sistem memakai skor CP-SAT sebagai baseline",
                        {"cp_sat_score": cp_score, "ga_score": final_score},
                    )
                )

    summary = {
        "total_teaching_assignments": len(assignments),
        "total_time_slots": len(slots),
        "total_teacher_preferences": len(preferences),
        "total_student_enrollments": len(student_enrollments),
        "generated_items": len(schedule_items),
        "feasible": feasible and not conflicts,
        "engine": engine,
        "rombel_daily_subject_soft_limit": rombel_daily_subject_limit,
    }

    return {
        "generated_at": generated_at,
        "period_id": normalized["period_id"],
        "summary": summary,
        "schedule": schedule_items,
        "warnings": warnings,
        "conflicts": conflicts,
    }
