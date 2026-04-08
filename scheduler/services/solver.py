from __future__ import annotations

import os
import random
import time
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


FIXED_TEACHER_SUBJECT_DAILY_HOURS_LIMIT = 6
FIXED_TEACHER_SUBJECT_DAILY_HOURS_OVERLOAD_PENALTY = 5
FIXED_ROMBEL_DAILY_SUBJECT_LIMIT = 5
FIXED_ROMBEL_DAILY_SUBJECT_OVERLOAD_PENALTY = 5
FIXED_DISTRIBUTION_PATTERN_PENALTY = 8
FIXED_DISTRIBUTION_NON_CONSECUTIVE_PENALTY = 10
FIXED_GRADE_ELECTIVE_MAX_PARALLEL_SUBJECTS = 4
ENABLE_WAJIB_PEMINATAN_CONFLICT_CHECK = _env_bool("ENABLE_WAJIB_PEMINATAN_CONFLICT_CHECK", False)
ENABLE_STUDENT_CONFLICT_CHECK = _env_bool("ENABLE_STUDENT_CONFLICT_CHECK", False)
ENABLE_HYBRID_GA = _env_bool("ENABLE_HYBRID_GA", True)


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
    requested_ga_enabled = _safe_bool(
        ga_cfg.get("enabled", constraints.get("use_ga", False)),
        False,
    )
    requested_grade_track_constraints = _safe_bool(
        constraints.get("enforce_grade_track_constraints", True),
        True,
    )
    return {
        "random_seed": _safe_int(constraints.get("random_seed", 42), default=42, min_value=1, max_value=2_147_483_647),
        "solver_seconds": _safe_float(
            solver_cfg.get("max_time_seconds", constraints.get("max_solver_seconds", 90)),
            default=90.0,
            min_value=1.0,
            max_value=300.0,
        ),
        "solver_workers": _safe_int(
            solver_cfg.get("workers", constraints.get("solver_workers", 8)),
            default=8,
            min_value=1,
            max_value=32,
        ),
        "total_runtime_seconds": _safe_float(
            solver_cfg.get("total_runtime_seconds", constraints.get("max_total_runtime_seconds", 300)),
            default=300.0,
            min_value=30.0,
            max_value=600.0,
        ),
        # Hard constraint baseline: maksimal 8 jam/hari per guru.
        "max_teacher_daily_hours": 8,
        # Hard constraint baseline: weekly_hours 2/3 harus berurutan pada hari yang sama.
        "enforce_consecutive_small_assignments": True,
        # Perluasan blok berurutan ke 4-6 JP.
        # Default: None (ditentukan otomatis: True jika grade track nonaktif, False jika aktif).
        # Override eksplisit lewat payload: enforce_block_distribution_extended: true/false.
        "enforce_block_distribution_extended": (
            None
            if constraints.get("enforce_block_distribution_extended") is None
            else _safe_bool(constraints.get("enforce_block_distribution_extended"), False)
        ),
        # Baseline minimal default: GA nonaktif kecuali diaktifkan eksplisit via env + payload.
        "ga_enabled": bool(ENABLE_HYBRID_GA and requested_ga_enabled),
        # Aturan blok angkatan wajib-vs-peminatan dikendalikan payload request.
        "enforce_grade_track_constraints": bool(requested_grade_track_constraints),
        "ga_population": _safe_int(
            ga_cfg.get("population_size", constraints.get("ga_population_size", 16)),
            default=16,
            min_value=8,
            max_value=120,
        ),
        "ga_generations": _safe_int(
            ga_cfg.get("generations", constraints.get("ga_generations", 20)),
            default=20,
            min_value=1,
            max_value=120,
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
        "hybrid_rounds": _safe_int(
            ga_cfg.get("hybrid_rounds", constraints.get("hybrid_rounds", 1)),
            default=1,
            min_value=1,
            max_value=3,
        ),
        "hybrid_no_improvement_stop_rounds": _safe_int(
            ga_cfg.get(
                "hybrid_no_improvement_stop_rounds",
                constraints.get("hybrid_no_improvement_stop_rounds", 2),
            ),
            default=2,
            min_value=1,
            max_value=3,
        ),
        "seed_match_weight": _safe_int(
            solver_cfg.get("seed_match_weight", constraints.get("seed_match_weight", 2)),
            default=2,
            min_value=0,
            max_value=20,
        ),
        "enable_distribution_cp_objective": _safe_bool(
            solver_cfg.get(
                "enable_distribution_cp_objective",
                constraints.get("enable_distribution_cp_objective", False),
            ),
            False,
        ),
        "objective": {
            "prefer_weight": prefer_weight,
            "avoid_penalty": avoid_penalty,
            "day_spread_weight": day_spread_weight,
            "teacher_subject_daily_limit": FIXED_TEACHER_SUBJECT_DAILY_HOURS_LIMIT,
            "teacher_subject_daily_overload_penalty": FIXED_TEACHER_SUBJECT_DAILY_HOURS_OVERLOAD_PENALTY,
            "rombel_daily_subject_limit": FIXED_ROMBEL_DAILY_SUBJECT_LIMIT,
            "rombel_daily_subject_overload_penalty": FIXED_ROMBEL_DAILY_SUBJECT_OVERLOAD_PENALTY,
            "distribution_pattern_penalty": abs(
                _safe_int(
                    objective_cfg.get("distribution_pattern_penalty", constraints.get("distribution_pattern_penalty", FIXED_DISTRIBUTION_PATTERN_PENALTY)),
                    default=FIXED_DISTRIBUTION_PATTERN_PENALTY,
                    min_value=0,
                    max_value=100,
                )
            ),
            "distribution_non_consecutive_penalty": abs(
                _safe_int(
                    objective_cfg.get(
                        "distribution_non_consecutive_penalty",
                        constraints.get("distribution_non_consecutive_penalty", FIXED_DISTRIBUTION_NON_CONSECUTIVE_PENALTY),
                    ),
                    default=FIXED_DISTRIBUTION_NON_CONSECUTIVE_PENALTY,
                    min_value=0,
                    max_value=100,
                )
            ),
            "grade_elective_max_parallel_subjects": FIXED_GRADE_ELECTIVE_MAX_PARALLEL_SUBJECTS,
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

        if slot_id <= 0 or day_of_week <= 0 or day_of_week > 6 or start_seconds is None or end_seconds is None:
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


def _allowed_distribution_patterns(weekly_hours: int) -> list[tuple[int, ...]]:
    pattern_map: dict[int, list[tuple[int, ...]]] = {
        1: [(1,)],
        2: [(2,)],
        3: [(3,)],
        4: [(2, 2)],
        5: [(3, 2)],
        6: [(3, 3), (2, 2, 2)],
    }
    return pattern_map.get(weekly_hours, [])


def _add_block_distribution_constraints(
    model: cp_model.CpModel,
    assignment_id: int,
    weekly_hours: int,
    slots_by_day: dict[int, list[int]],
    x: dict[tuple[int, int], cp_model.IntVar],
) -> None:
    """
    Hard constraint: setiap assignment dengan weekly_hours 2-6 dijadwalkan
    dalam blok berurutan tanpa gap di setiap hari aktif, dan jumlah hari
    aktif harus sesuai pola distribusi yang diizinkan:
      2 JP → 1 hari  (blok 2)
      3 JP → 1 hari  (blok 3)
      4 JP → 2 hari  (2+2, berurutan per hari)
      5 JP → 2 hari  (3+2, berurutan per hari)
      6 JP → 2 atau 3 hari  (3+3 atau 2+2+2, berurutan per hari)

    Teknik: "start-of-block" variable counting.
    - start_var[i] = 1 iff slot i digunakan DAN slot i-1 tidak digunakan.
    - block_count = sum(start_vars) per hari; dipaksa <= 1 (max 1 blok berurutan).
    - Jika day_active=1 maka day_sum>=1 → block_count>=1 → block_count==1. ✓
    - Jika x[si]=1, x[sj]=1 dengan gap di antara (si, sj tidak berurutan):
      start_var[sj]=1 → block_count=2 > 1 → DITOLAK oleh model. ✓
    """
    if weekly_hours < 2:
        return

    allowed_patterns = _allowed_distribution_patterns(weekly_hours)
    if not allowed_patterns:
        return

    allowed_day_counts = sorted({len(p) for p in allowed_patterns})
    min_segment = min(size for p in allowed_patterns for size in p if size > 0)

    day_active_vars: list[cp_model.IntVar] = []

    for day, day_slot_ids in slots_by_day.items():
        if len(day_slot_ids) < min_segment:
            # Hari ini tidak cukup slot untuk satu segmen terkecil; paksa nol.
            for slot_id in day_slot_ids:
                model.Add(x[(assignment_id, slot_id)] == 0)
            continue

        day_len = len(day_slot_ids)
        day_active = model.NewBoolVar(f"blk_a{assignment_id}_d{day}_act")
        day_active_vars.append(day_active)

        day_sum_expr = sum(x[(assignment_id, slot_id)] for slot_id in day_slot_ids)
        model.Add(day_sum_expr >= 1).OnlyEnforceIf(day_active)
        model.Add(day_sum_expr == 0).OnlyEnforceIf(day_active.Not())

        # Hitung jumlah blok berurutan di hari ini via variabel "awal blok".
        start_vars: list[cp_model.IntVar] = []
        for idx, slot_id in enumerate(day_slot_ids):
            sv = model.NewBoolVar(f"blk_a{assignment_id}_d{day}_i{idx}_sv")
            if idx == 0:
                # Blok dimulai jika slot pertama digunakan.
                model.Add(sv == x[(assignment_id, slot_id)])
            else:
                prev_sid = day_slot_ids[idx - 1]
                # sv = 1 iff current=1 AND prev=0 (awal blok baru).
                model.Add(sv <= x[(assignment_id, slot_id)])
                model.Add(sv <= 1 - x[(assignment_id, prev_sid)])
                model.Add(sv >= x[(assignment_id, slot_id)] - x[(assignment_id, prev_sid)])
            start_vars.append(sv)

        block_count = model.NewIntVar(0, day_len, f"blk_a{assignment_id}_d{day}_blkcnt")
        model.Add(block_count == sum(start_vars))
        # Maksimal 1 blok berurutan per hari (tanpa gap).
        model.Add(block_count <= 1)

    if not day_active_vars:
        return

    # Jumlah hari aktif harus sesuai pola distribusi yang diizinkan.
    active_day_count = model.NewIntVar(
        0, len(day_active_vars), f"blk_a{assignment_id}_actdays"
    )
    model.Add(active_day_count == sum(day_active_vars))

    if len(allowed_day_counts) == 1:
        model.Add(active_day_count == allowed_day_counts[0])
    else:
        # Contoh: 6 JP → allowed_day_counts = [2, 3]
        model.Add(active_day_count >= allowed_day_counts[0])
        model.Add(active_day_count <= allowed_day_counts[-1])


def _sample_distribution_pattern_slot_sets(
    weekly_hours: int,
    slot_day_ordered_map: dict[int, tuple[int, ...]],
    teacher_id: int,
    preference_score_map: dict[tuple[int, int], int],
    rng: random.Random,
    max_samples: int = 24,
) -> list[tuple[int, ...]]:
    patterns = _allowed_distribution_patterns(weekly_hours)
    if not patterns:
        return []

    day_windows: dict[int, dict[int, list[tuple[int, ...]]]] = {}
    for day_of_week, ordered_slots in slot_day_ordered_map.items():
        day_len = len(ordered_slots)
        if day_len <= 0:
            continue
        windows_by_len: dict[int, list[tuple[int, ...]]] = {}
        for block_len in range(1, min(day_len, weekly_hours) + 1):
            windows: list[tuple[int, tuple[int, ...]]] = []
            for start_index in range(0, day_len - block_len + 1):
                block = tuple(ordered_slots[start_index:start_index + block_len])
                pref_score = sum(
                    preference_score_map.get((teacher_id, slot_id), 0)
                    for slot_id in block
                )
                windows.append((pref_score, block))
            windows.sort(key=lambda item: item[0], reverse=True)
            windows_by_len[block_len] = [block for _, block in windows[:8]]
        if windows_by_len:
            day_windows[day_of_week] = windows_by_len

    if not day_windows:
        return []

    candidates: list[tuple[int, ...]] = []
    seen: set[tuple[int, ...]] = set()
    max_attempts = max(40, max_samples * 4)
    sorted_patterns = sorted(
        patterns,
        key=lambda pattern: (len(pattern), -sum(pattern)),
    )

    for _ in range(max_attempts):
        pattern = rng.choice(sorted_patterns)
        segment_lengths = sorted(pattern, reverse=True)
        available_days = list(day_windows.keys())
        rng.shuffle(available_days)

        selected_blocks: list[tuple[int, ...]] = []
        used_days: set[int] = set()
        valid_pattern = True

        for segment_len in segment_lengths:
            candidate_days = [
                day
                for day in available_days
                if day not in used_days
                and segment_len in day_windows[day]
                and day_windows[day][segment_len]
            ]
            if not candidate_days:
                valid_pattern = False
                break

            candidate_days.sort(
                key=lambda day: sum(
                    preference_score_map.get((teacher_id, slot_id), 0)
                    for slot_id in day_windows[day][segment_len][0]
                ),
                reverse=True,
            )
            top_days = candidate_days[: max(1, min(3, len(candidate_days)))]
            chosen_day = rng.choice(top_days)
            used_days.add(chosen_day)

            windows = day_windows[chosen_day][segment_len]
            chosen_block = rng.choice(windows[: max(1, min(4, len(windows)))])
            selected_blocks.append(chosen_block)

        if not valid_pattern:
            continue

        flattened = tuple(sorted(slot_id for block in selected_blocks for slot_id in block))
        if len(flattened) != weekly_hours:
            continue
        if flattened in seen:
            continue
        seen.add(flattened)
        candidates.append(flattened)
        if len(candidates) >= max_samples:
            break

    return candidates


def _distribution_pattern_distance_units(
    actual_counts: list[int],
    expected_patterns: list[tuple[int, ...]],
) -> int:
    if not expected_patterns:
        return 0

    sorted_actual = sorted((count for count in actual_counts if count > 0), reverse=True)
    if not sorted_actual:
        return 0

    min_units: int | None = None
    for pattern in expected_patterns:
        sorted_expected = sorted((count for count in pattern if count > 0), reverse=True)
        max_len = max(len(sorted_actual), len(sorted_expected))
        padded_actual = sorted_actual + [0] * (max_len - len(sorted_actual))
        padded_expected = list(sorted_expected) + [0] * (max_len - len(sorted_expected))
        distance = sum(abs(actual - expected) for actual, expected in zip(padded_actual, padded_expected))
        units = distance // 2
        if min_units is None or units < min_units:
            min_units = units

    return min_units or 0


def _calculate_distribution_units_for_assignment(
    assignment: dict[str, Any],
    slot_ids: tuple[int, ...],
    slot_day_position_map: dict[int, tuple[int, int]],
) -> tuple[int, int]:
    if not slot_ids:
        return 0, 0

    day_positions: dict[int, list[int]] = defaultdict(list)
    for slot_id in slot_ids:
        day_position = slot_day_position_map.get(slot_id)
        if not day_position:
            continue
        day_of_week, slot_position = day_position
        day_positions[day_of_week].append(slot_position)

    daily_counts = [len(positions) for positions in day_positions.values() if positions]
    weekly_hours = _safe_int(assignment.get("weekly_hours"), default=0, min_value=0)
    pattern_units = _distribution_pattern_distance_units(
        daily_counts,
        _allowed_distribution_patterns(weekly_hours),
    )

    non_consecutive_units = 0
    for positions in day_positions.values():
        if len(positions) <= 1:
            continue
        unique_positions = sorted(set(positions))
        span = (unique_positions[-1] - unique_positions[0]) + 1
        gaps = span - len(unique_positions)
        if gaps > 0:
            non_consecutive_units += gaps

    return pattern_units, non_consecutive_units


def _count_grade_elective_parallel_subject_overlaps(
    schedule_map: dict[int, tuple[int, ...]],
    assignments: list[dict[str, Any]],
    slots_by_id: dict[int, dict[str, Any]],
    max_parallel_subjects: int,
) -> int:
    if max_parallel_subjects <= 0:
        return 0

    grade_slot_subjects: dict[tuple[int, int], set[int]] = defaultdict(set)
    for assignment in assignments:
        assignment_id = assignment["id"]
        grade_level = _safe_int(assignment.get("grade_level"), default=0, min_value=0)
        if grade_level <= 0:
            continue
        track = _resolve_assignment_track(assignment)
        if track != "elective":
            continue
        subject_id = assignment["subject_id"]
        for slot_id in schedule_map.get(assignment_id, tuple()):
            if slot_id not in slots_by_id:
                continue
            grade_slot_subjects[(grade_level, slot_id)].add(subject_id)

    overlap_units = 0
    for subjects in grade_slot_subjects.values():
        overload = len(subjects) - max_parallel_subjects
        if overload > 0:
            overlap_units += overload
    return overlap_units


def _build_infeasibility_diagnostics(
    assignments: list[dict[str, Any]],
    slots: list[dict[str, Any]],
    grade_track_map: dict[int, dict[str, tuple[int, ...]]],
    max_parallel_elective_subjects: int,
    enforce_grade_track_constraints: bool = False,
) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    if not enforce_grade_track_constraints:
        return diagnostics

    assignments_by_id = {assignment["id"]: assignment for assignment in assignments}

    total_slots = len(slots)
    for grade_level, bucket in grade_track_map.items():
        mandatory_ids = bucket.get("mandatory", tuple())
        elective_ids = bucket.get("elective", tuple())
        if not mandatory_ids or not elective_ids:
            continue

        mandatory_load_per_rombel: dict[int, int] = defaultdict(int)
        for assignment_id in mandatory_ids:
            assignment = assignments_by_id.get(assignment_id)
            if not assignment:
                continue
            rombel_id = _safe_int(assignment.get("rombel_id"), default=0, min_value=0)
            mandatory_load_per_rombel[rombel_id] += _safe_int(
                assignment.get("weekly_hours"),
                default=0,
                min_value=0,
            )
        mandatory_required_slots_lb = max(mandatory_load_per_rombel.values(), default=0)

        elective_subject_slot_lb_sum = 0
        elective_subject_hour_lb: dict[int, int] = defaultdict(int)
        for assignment_id in elective_ids:
            assignment = assignments_by_id.get(assignment_id)
            if not assignment:
                continue
            subject_id = _safe_int(assignment.get("subject_id"), default=0, min_value=0)
            weekly_hours = _safe_int(assignment.get("weekly_hours"), default=0, min_value=0)
            if subject_id <= 0 or weekly_hours <= 0:
                continue
            elective_subject_hour_lb[subject_id] = max(elective_subject_hour_lb[subject_id], weekly_hours)

        if elective_subject_hour_lb:
            elective_subject_slot_lb_sum = sum(elective_subject_hour_lb.values())

        effective_parallel = max(1, max_parallel_elective_subjects)
        elective_required_slots_lb = (
            (elective_subject_slot_lb_sum + effective_parallel - 1) // effective_parallel
            if elective_subject_slot_lb_sum > 0
            else 0
        )

        if mandatory_required_slots_lb + elective_required_slots_lb > total_slots:
            diagnostics.append(
                _issue(
                    "GRADE_MANDATORY_ELECTIVE_CAPACITY_IMPOSSIBLE",
                    (
                        f"Tingkat {grade_level} membutuhkan minimal "
                        f"{mandatory_required_slots_lb + elective_required_slots_lb} slot "
                        f"(mandatory >= {mandatory_required_slots_lb}, elective >= {elective_required_slots_lb}) "
                        f"namun slot tersedia hanya {total_slots}"
                    ),
                    {
                        "grade_level": grade_level,
                        "total_slots": total_slots,
                        "mandatory_required_slots_lb": mandatory_required_slots_lb,
                        "elective_required_slots_lb": elective_required_slots_lb,
                        "max_parallel_elective_subjects": effective_parallel,
                    },
                )
            )

    return diagnostics


def _calculate_soft_penalty_breakdown(
    schedule_map: dict[int, tuple[int, ...]],
    assignments: list[dict[str, Any]],
    slots_by_id: dict[int, dict[str, Any]],
    slot_day_position_map: dict[int, tuple[int, int]],
    teacher_subject_daily_limit: int,
    teacher_subject_daily_overload_penalty: int,
    rombel_daily_subject_limit: int,
    rombel_daily_subject_overload_penalty: int,
    distribution_pattern_penalty: int,
    distribution_non_consecutive_penalty: int,
) -> dict[str, Any]:
    teacher_subject_day_load: dict[tuple[int, int, int], int] = defaultdict(int)
    rombel_day_subjects: dict[tuple[int, int], set[int]] = defaultdict(set)

    for assignment in assignments:
        assignment_id = assignment["id"]
        teacher_id = assignment["teacher_id"]
        subject_id = assignment["subject_id"]
        rombel_id = assignment["rombel_id"]
        slot_ids = schedule_map.get(assignment_id, tuple())

        for slot_id in slot_ids:
            slot = slots_by_id.get(slot_id)
            if not slot:
                continue
            day_of_week = slot["day_of_week"]
            teacher_subject_day_load[(teacher_id, subject_id, day_of_week)] += 1
            rombel_day_subjects[(rombel_id, day_of_week)].add(subject_id)

    teacher_subject_overload_units = 0
    if teacher_subject_daily_limit > 0:
        for load in teacher_subject_day_load.values():
            overload = load - teacher_subject_daily_limit
            if overload > 0:
                teacher_subject_overload_units += overload

    rombel_subject_overload_units = 0
    if rombel_daily_subject_limit > 0:
        for subjects in rombel_day_subjects.values():
            overload = len(subjects) - rombel_daily_subject_limit
            if overload > 0:
                rombel_subject_overload_units += overload

    teacher_subject_penalty_total = teacher_subject_overload_units * max(teacher_subject_daily_overload_penalty, 0)
    rombel_subject_penalty_total = rombel_subject_overload_units * max(rombel_daily_subject_overload_penalty, 0)
    distribution_pattern_units = 0
    distribution_non_consecutive_units = 0
    for assignment in assignments:
        assignment_id = assignment["id"]
        slot_ids = schedule_map.get(assignment_id, tuple())
        pattern_units, non_consecutive_units = _calculate_distribution_units_for_assignment(
            assignment=assignment,
            slot_ids=slot_ids,
            slot_day_position_map=slot_day_position_map,
        )
        distribution_pattern_units += pattern_units
        distribution_non_consecutive_units += non_consecutive_units

    distribution_pattern_penalty_total = distribution_pattern_units * max(distribution_pattern_penalty, 0)
    distribution_non_consecutive_penalty_total = (
        distribution_non_consecutive_units * max(distribution_non_consecutive_penalty, 0)
    )

    total_penalty = (
        teacher_subject_penalty_total
        + rombel_subject_penalty_total
        + distribution_pattern_penalty_total
        + distribution_non_consecutive_penalty_total
    )

    return {
        "teacher_subject_daily_overload_units": teacher_subject_overload_units,
        "teacher_subject_daily_penalty": teacher_subject_penalty_total,
        "rombel_daily_subject_overload_units": rombel_subject_overload_units,
        "rombel_daily_subject_penalty": rombel_subject_penalty_total,
        "distribution_pattern_units": distribution_pattern_units,
        "distribution_pattern_penalty": distribution_pattern_penalty_total,
        "distribution_non_consecutive_units": distribution_non_consecutive_units,
        "distribution_non_consecutive_penalty": distribution_non_consecutive_penalty_total,
        "total_penalty": total_penalty,
    }


def _build_distribution_compliance_report(
    schedule_map: dict[int, tuple[int, ...]],
    assignments: list[dict[str, Any]],
    slot_day_position_map: dict[int, tuple[int, int]],
    max_top_violations: int = 10,
) -> dict[str, Any]:
    total_assignments = len(assignments)
    compliant_count = 0
    pattern_units_total = 0
    non_consecutive_units_total = 0
    top_violations: list[dict[str, Any]] = []

    for assignment in assignments:
        assignment_id = assignment["id"]
        slot_ids = schedule_map.get(assignment_id, tuple())
        pattern_units, non_consecutive_units = _calculate_distribution_units_for_assignment(
            assignment=assignment,
            slot_ids=slot_ids,
            slot_day_position_map=slot_day_position_map,
        )
        pattern_units_total += pattern_units
        non_consecutive_units_total += non_consecutive_units
        weighted_units = (pattern_units * 2) + non_consecutive_units
        if weighted_units == 0:
            compliant_count += 1
            continue

        top_violations.append(
            {
                "teaching_assignment_id": assignment_id,
                "teacher_id": assignment.get("teacher_id"),
                "subject_id": assignment.get("subject_id"),
                "rombel_id": assignment.get("rombel_id"),
                "weekly_hours": assignment.get("weekly_hours"),
                "pattern_units": pattern_units,
                "non_consecutive_units": non_consecutive_units,
                "weighted_units": weighted_units,
            }
        )

    top_violations.sort(key=lambda item: item["weighted_units"], reverse=True)
    violation_count = total_assignments - compliant_count
    compliance_rate = (
        round((compliant_count / total_assignments) * 100, 2)
        if total_assignments > 0
        else None
    )

    return {
        "total_assignments": total_assignments,
        "compliant_assignments": compliant_count,
        "violation_assignments": violation_count,
        "compliance_rate_percent": compliance_rate,
        "distribution_pattern_units_total": pattern_units_total,
        "distribution_non_consecutive_units_total": non_consecutive_units_total,
        "top_violations": top_violations[:max_top_violations],
    }


def _calculate_hard_constraint_report(
    schedule_map: dict[int, tuple[int, ...]],
    assignments: list[dict[str, Any]],
    slots_by_id: dict[int, dict[str, Any]],
    slot_day_position_map: dict[int, tuple[int, int]],
    max_parallel_elective_subjects: int,
    enforce_grade_track_constraints: bool,
) -> dict[str, Any]:
    del slot_day_position_map
    assignment_exact_violations = 0
    teacher_busy_counter: dict[tuple[int, int], int] = defaultdict(int)
    rombel_busy_counter: dict[tuple[int, int], int] = defaultdict(int)
    teacher_target_hours: dict[int, int] = defaultdict(int)
    teacher_assigned_hours: dict[int, int] = defaultdict(int)
    invalid_slot_refs = 0
    invalid_slot_day = 0
    grade_slot_tracks: dict[tuple[int, int], set[str]] = defaultdict(set)

    for assignment in assignments:
        assignment_id = assignment["id"]
        expected_hours = assignment["weekly_hours"]
        teacher_id = assignment["teacher_id"]
        rombel_id = assignment["rombel_id"]
        grade_level = _safe_int(assignment.get("grade_level"), default=0, min_value=0)
        track = _resolve_assignment_track(assignment)
        teacher_target_hours[teacher_id] += expected_hours

        slot_ids = schedule_map.get(assignment_id, tuple())
        unique_slot_count = len(set(slot_ids))
        if len(slot_ids) != expected_hours or unique_slot_count != len(slot_ids):
            assignment_exact_violations += abs(expected_hours - len(slot_ids))
            assignment_exact_violations += max(0, len(slot_ids) - unique_slot_count)

        for slot_id in slot_ids:
            slot = slots_by_id.get(slot_id)
            if not slot:
                invalid_slot_refs += 1
                continue
            day_of_week = _safe_int(slot.get("day_of_week"), default=0, min_value=0)
            if day_of_week < 1 or day_of_week > 6:
                invalid_slot_day += 1
            teacher_busy_counter[(teacher_id, slot_id)] += 1
            rombel_busy_counter[(rombel_id, slot_id)] += 1
            teacher_assigned_hours[teacher_id] += 1
            if enforce_grade_track_constraints and grade_level > 0 and track:
                grade_slot_tracks[(grade_level, slot_id)].add(track)

    teacher_conflicts = sum(max(0, count - 1) for count in teacher_busy_counter.values())
    rombel_conflicts = sum(max(0, count - 1) for count in rombel_busy_counter.values())
    teacher_weekly_gap = sum(abs(teacher_target_hours[teacher_id] - teacher_assigned_hours.get(teacher_id, 0)) for teacher_id in teacher_target_hours)
    mandatory_elective_overlap_violations = 0
    elective_parallel_overlap_violations = 0
    if enforce_grade_track_constraints:
        mandatory_elective_overlap_violations = sum(
            1
            for tracks in grade_slot_tracks.values()
            if "mandatory" in tracks and "elective" in tracks
        )
        elective_parallel_overlap_violations = _count_grade_elective_parallel_subject_overlaps(
            schedule_map=schedule_map,
            assignments=assignments,
            slots_by_id=slots_by_id,
            max_parallel_subjects=max_parallel_elective_subjects,
        )

    status = {
        "each_event_scheduled_exactly_once": assignment_exact_violations == 0,
        "teacher_weekly_hours_fulfilled": teacher_weekly_gap == 0,
        "no_teacher_conflict": teacher_conflicts == 0,
        "no_rombel_conflict": rombel_conflicts == 0,
        "slot_time_valid": invalid_slot_refs == 0 and invalid_slot_day == 0,
        "mandatory_vs_elective_no_overlap": (
            mandatory_elective_overlap_violations == 0 if enforce_grade_track_constraints else None
        ),
        "elective_parallel_subject_limit_valid": (
            elective_parallel_overlap_violations == 0 if enforce_grade_track_constraints else None
        ),
    }

    return {
        "status": status,
        "violations": {
            "assignment_exact": assignment_exact_violations,
            "teacher_weekly_gap": teacher_weekly_gap,
            "teacher_conflicts": teacher_conflicts,
            "rombel_conflicts": rombel_conflicts,
            "invalid_slot_reference": invalid_slot_refs,
            "invalid_slot_day": invalid_slot_day,
            "mandatory_vs_elective_overlap": (
                mandatory_elective_overlap_violations if enforce_grade_track_constraints else None
            ),
            "elective_parallel_subject_limit": (
                elective_parallel_overlap_violations if enforce_grade_track_constraints else None
            ),
        },
    }


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
    teacher_subject_daily_limit: int,
    teacher_subject_daily_overload_penalty: int,
    rombel_daily_subject_limit: int,
    rombel_daily_subject_overload_penalty: int,
    distribution_pattern_penalty: int,
    distribution_non_consecutive_penalty: int,
    max_parallel_elective_subjects: int,
) -> tuple[int, bool]:
    teacher_busy: set[tuple[int, int]] = set()
    rombel_busy: set[tuple[int, int]] = set()
    student_busy: set[tuple[int, int]] = set()
    grade_slot_track: dict[tuple[int, int], set[str]] = defaultdict(set)
    score = 0

    for assignment in assignments:
        assignment_id = assignment["id"]
        teacher_id = assignment["teacher_id"]
        rombel_id = assignment["rombel_id"]
        student_ids = assignment_student_map.get(assignment_id, tuple())
        grade_level = assignment_grade_map.get(assignment_id, 0)
        track = assignment_track_map.get(assignment_id)
        expected_hours = assignment["weekly_hours"]
        slot_ids = schedule_map.get(assignment_id, tuple())

        if len(slot_ids) != expected_hours:
            return -1_000_000_000, False
        if len(set(slot_ids)) != len(slot_ids):
            return -1_000_000_000, False

        used_days = set()
        for slot_id in slot_ids:
            slot = slots_by_id.get(slot_id)
            if not slot:
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

            day_of_week = _safe_int(slot.get("day_of_week"), default=0, min_value=0)
            if day_of_week < 1 or day_of_week > 6:
                return -1_000_000_000, False

            if grade_level > 0 and track:
                state = grade_slot_track[(grade_level, slot_id)]
                if track == "mandatory" and "elective" in state:
                    return -1_000_000_000, False
                if track == "elective" and "mandatory" in state:
                    return -1_000_000_000, False
                state.add(track)

            score += preference_score_map.get((teacher_id, slot_id), 0)
            used_days.add(day_of_week)

        score += day_spread_weight * len(used_days)

    elective_parallel_overlap_violations = _count_grade_elective_parallel_subject_overlaps(
        schedule_map=schedule_map,
        assignments=assignments,
        slots_by_id=slots_by_id,
        max_parallel_subjects=max_parallel_elective_subjects,
    )
    if elective_parallel_overlap_violations > 0:
        return -1_000_000_000, False

    soft_penalty_breakdown = _calculate_soft_penalty_breakdown(
        schedule_map=schedule_map,
        assignments=assignments,
        slots_by_id=slots_by_id,
        slot_day_position_map=slot_day_position_map,
        teacher_subject_daily_limit=teacher_subject_daily_limit,
        teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
        rombel_daily_subject_limit=rombel_daily_subject_limit,
        rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
        distribution_pattern_penalty=distribution_pattern_penalty,
        distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
    )
    score -= soft_penalty_breakdown["total_penalty"]

    return score, True


def _solve_cp_sat(
    assignments: list[dict[str, Any]],
    slots: list[dict[str, Any]],
    preference_score_map: dict[tuple[int, int], int],
    student_assignment_map: dict[int, tuple[int, ...]],
    grade_track_map: dict[int, dict[str, tuple[int, ...]]],
    config: dict[str, Any],
    seed_schedule_map: dict[int, tuple[int, ...]] | None = None,
) -> tuple[dict[int, tuple[int, ...]] | None, int, list[dict[str, Any]]]:
    model = cp_model.CpModel()

    slot_ids = [slot["id"] for slot in slots]
    slots_by_id = {slot["id"]: slot for slot in slots}
    assignments_by_id = {assignment["id"]: assignment for assignment in assignments}
    assignments_by_teacher: dict[int, list[int]] = defaultdict(list)
    assignments_by_teacher_subject: dict[tuple[int, int], list[int]] = defaultdict(list)
    assignments_by_rombel: dict[int, list[int]] = defaultdict(list)
    assignments_by_rombel_subject: dict[tuple[int, int], list[int]] = defaultdict(list)
    slots_by_day_raw: dict[int, list[int]] = defaultdict(list)
    teacher_subject_daily_limit = _safe_int(
        config["objective"].get("teacher_subject_daily_limit"),
        default=FIXED_TEACHER_SUBJECT_DAILY_HOURS_LIMIT,
        min_value=1,
    )
    teacher_subject_daily_overload_penalty = abs(
        _safe_int(
            config["objective"].get("teacher_subject_daily_overload_penalty"),
            default=FIXED_TEACHER_SUBJECT_DAILY_HOURS_OVERLOAD_PENALTY,
            min_value=0,
            max_value=100,
        )
    )
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
    distribution_pattern_penalty = abs(
        _safe_int(
            config["objective"].get("distribution_pattern_penalty"),
            default=FIXED_DISTRIBUTION_PATTERN_PENALTY,
            min_value=0,
            max_value=100,
        )
    )
    distribution_non_consecutive_penalty = abs(
        _safe_int(
            config["objective"].get("distribution_non_consecutive_penalty"),
            default=FIXED_DISTRIBUTION_NON_CONSECUTIVE_PENALTY,
            min_value=0,
            max_value=100,
        )
    )
    enable_distribution_cp_objective = _safe_bool(
        config.get("enable_distribution_cp_objective"),
        False,
    )
    max_parallel_elective_subjects = _safe_int(
        config["objective"].get("grade_elective_max_parallel_subjects"),
        default=FIXED_GRADE_ELECTIVE_MAX_PARALLEL_SUBJECTS,
        min_value=1,
        max_value=10,
    )
    enforce_grade_track_constraints = _safe_bool(
        config.get("enforce_grade_track_constraints"),
        False,
    )
    if not enforce_grade_track_constraints:
        max_parallel_elective_subjects = 0

    for assignment in assignments:
        assignments_by_teacher[assignment["teacher_id"]].append(assignment["id"])
        assignments_by_teacher_subject[(assignment["teacher_id"], assignment["subject_id"])].append(assignment["id"])
        assignments_by_rombel[assignment["rombel_id"]].append(assignment["id"])
        assignments_by_rombel_subject[(assignment["rombel_id"], assignment["subject_id"])].append(assignment["id"])
    for slot in slots:
        slots_by_day_raw[slot["day_of_week"]].append(slot["id"])

    slots_by_day: dict[int, list[int]] = {
        day: sorted(
            slot_ids_per_day,
            key=lambda slot_id: (
                _safe_int(slots_by_id[slot_id].get("start_seconds"), default=0, min_value=0),
                slot_id,
            ),
        )
        for day, slot_ids_per_day in slots_by_day_raw.items()
    }
    max_teacher_daily_hours = _safe_int(
        config.get("max_teacher_daily_hours"),
        default=8,
        min_value=0,
        max_value=12,
    )
    enforce_consecutive_small_assignments = _safe_bool(
        config.get("enforce_consecutive_small_assignments"),
        True,
    )

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
        for teacher_id, assignment_ids in assignments_by_teacher.items():
            for day, day_slot_ids in slots_by_day.items():
                if not day_slot_ids:
                    continue
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

    if enforce_consecutive_small_assignments:
        # Strategi adaptif untuk hard constraint blok berurutan:
        #
        # Tanpa grade track (model sederhana):
        #   → Terapkan ke SEMUA weekly_hours 2-6 JP.
        #     Kualitas jadwal optimal; model cukup ringan untuk CP-SAT.
        #
        # Dengan grade track aktif (model lebih kompleks):
        #   → Terapkan HANYA untuk 2-3 JP (model terlalu besar jika semua dipaksa blok).
        #     Kualitas 4-6 JP tetap dijaga via soft penalty tinggi + repair phase agresif.
        #     (Override dengan enforce_block_distribution_extended=true di payload jika butuh.)
        #
        enforce_extended_blocks = _safe_bool(
            config.get("enforce_block_distribution_extended"),
            not enforce_grade_track_constraints,
        )
        for assignment in assignments:
            assignment_id = assignment["id"]
            weekly_hours = _safe_int(assignment.get("weekly_hours"), default=0, min_value=0)
            if weekly_hours < 2:
                continue
            if weekly_hours > 3 and not enforce_extended_blocks:
                # Grade track aktif: lewati 4-6 JP dari hard constraint;
                # repair phase dengan penalty tinggi akan menangani distribusinya.
                continue
            _add_block_distribution_constraints(
                model=model,
                assignment_id=assignment_id,
                weekly_hours=weekly_hours,
                slots_by_day=slots_by_day,
                x=x,
            )

    for grade_level, bucket in grade_track_map.items():
        mandatory_ids = bucket.get("mandatory", tuple())
        elective_ids = bucket.get("elective", tuple())
        elective_subject_groups: dict[int, list[int]] = defaultdict(list)

        if elective_ids and max_parallel_elective_subjects > 0:
            for assignment_id in elective_ids:
                assignment = assignments_by_id.get(assignment_id)
                if not assignment:
                    continue
                subject_id = _safe_int(assignment.get("subject_id"), default=0, min_value=0)
                if subject_id <= 0:
                    continue
                elective_subject_groups[subject_id].append(assignment_id)

        for slot_id in slot_ids:
            if mandatory_ids and elective_ids:
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

            if elective_subject_groups:
                subject_active_vars: list[cp_model.IntVar] = []
                for subject_id, subject_assignment_ids in elective_subject_groups.items():
                    if not subject_assignment_ids:
                        continue
                    subject_active = model.NewBoolVar(
                        f"grade_{grade_level}_slot_{slot_id}_subject_{subject_id}_active"
                    )
                    subject_sum = sum(
                        x[(assignment_id, slot_id)]
                        for assignment_id in subject_assignment_ids
                    )
                    for assignment_id in subject_assignment_ids:
                        model.Add(x[(assignment_id, slot_id)] <= subject_active)
                    model.Add(subject_active <= subject_sum)
                    subject_active_vars.append(subject_active)

                if len(subject_active_vars) > max_parallel_elective_subjects:
                    model.Add(sum(subject_active_vars) <= max_parallel_elective_subjects)

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

    # Soft constraint: maksimal 6 JP per guru-mapel per hari.
    if teacher_subject_daily_overload_penalty > 0 and teacher_subject_daily_limit > 0:
        for (teacher_id, subject_id), assignment_ids in assignments_by_teacher_subject.items():
            for day, day_slot_ids in slots_by_day.items():
                day_capacity = len(day_slot_ids)
                if day_capacity <= teacher_subject_daily_limit:
                    continue

                load = model.NewIntVar(
                    0,
                    day_capacity,
                    f"teacher_{teacher_id}_subject_{subject_id}_day_{day}_load",
                )
                model.Add(
                    load == sum(
                        x[(assignment_id, slot_id)]
                        for assignment_id in assignment_ids
                        for slot_id in day_slot_ids
                    )
                )

                overload = model.NewIntVar(
                    0,
                    day_capacity,
                    f"teacher_{teacher_id}_subject_{subject_id}_day_{day}_overload",
                )
                model.Add(overload >= load - teacher_subject_daily_limit)
                model.Add(overload >= 0)
                objective_terms.append(-teacher_subject_daily_overload_penalty * overload)

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

    # Soft constraint distribusi jam (dibawa langsung ke objective CP-SAT):
    # - mendorong jumlah hari aktif sesuai pola weekly_hours
    # - mendorong ukuran blok per hari sesuai pola target
    # - memberi penalti split (tidak berurutan) dalam satu hari
    if enable_distribution_cp_objective and (distribution_pattern_penalty > 0 or distribution_non_consecutive_penalty > 0):
        for assignment in assignments:
            assignment_id = assignment["id"]
            weekly_hours = _safe_int(assignment.get("weekly_hours"), default=0, min_value=0)
            allowed_patterns = _allowed_distribution_patterns(weekly_hours)
            if not allowed_patterns:
                continue

            preferred_segment_sizes = sorted(
                {
                    segment_size
                    for pattern in allowed_patterns
                    for segment_size in pattern
                    if segment_size > 0
                }
            )
            expected_day_counts = sorted(
                {
                    len(pattern)
                    for pattern in allowed_patterns
                    if pattern
                }
            )

            day_active_vars: list[cp_model.IntVar] = []
            for day, day_slot_ids in slots_by_day.items():
                day_capacity = len(day_slot_ids)
                if day_capacity <= 0:
                    continue

                day_load = model.NewIntVar(
                    0,
                    day_capacity,
                    f"distribution_a{assignment_id}_d{day}_load",
                )
                model.Add(
                    day_load == sum(x[(assignment_id, slot_id)] for slot_id in day_slot_ids)
                )

                day_active = model.NewBoolVar(f"distribution_a{assignment_id}_d{day}_active")
                model.Add(day_load >= day_active)
                model.Add(day_load <= day_capacity * day_active)
                day_active_vars.append(day_active)

                if distribution_pattern_penalty > 0 and preferred_segment_sizes:
                    abs_diffs: list[cp_model.IntVar] = []
                    max_abs_bound = max(day_capacity, max(preferred_segment_sizes))
                    for segment_size in preferred_segment_sizes:
                        diff = model.NewIntVar(
                            -max_abs_bound,
                            max_abs_bound,
                            f"distribution_a{assignment_id}_d{day}_size_{segment_size}_diff",
                        )
                        model.Add(diff == day_load - segment_size)
                        abs_diff = model.NewIntVar(
                            0,
                            max_abs_bound,
                            f"distribution_a{assignment_id}_d{day}_size_{segment_size}_abs",
                        )
                        model.AddAbsEquality(abs_diff, diff)
                        abs_diffs.append(abs_diff)

                    min_abs_diff = model.NewIntVar(
                        0,
                        max_abs_bound,
                        f"distribution_a{assignment_id}_d{day}_size_min_abs",
                    )
                    if len(abs_diffs) == 1:
                        model.Add(min_abs_diff == abs_diffs[0])
                    else:
                        model.AddMinEquality(min_abs_diff, abs_diffs)

                    active_size_deviation = model.NewIntVar(
                        0,
                        max_abs_bound,
                        f"distribution_a{assignment_id}_d{day}_size_deviation",
                    )
                    model.Add(active_size_deviation == min_abs_diff).OnlyEnforceIf(day_active)
                    model.Add(active_size_deviation == 0).OnlyEnforceIf(day_active.Not())
                    objective_terms.append(-distribution_pattern_penalty * active_size_deviation)

                if distribution_non_consecutive_penalty > 0 and day_capacity > 1:
                    start_block_vars: list[cp_model.IntVar] = []
                    for index, slot_id in enumerate(day_slot_ids):
                        current_var = x[(assignment_id, slot_id)]
                        start_var = model.NewBoolVar(
                            f"distribution_a{assignment_id}_d{day}_slot_{index}_start"
                        )
                        if index == 0:
                            model.Add(start_var == current_var)
                        else:
                            prev_var = x[(assignment_id, day_slot_ids[index - 1])]
                            model.Add(start_var <= current_var)
                            model.Add(start_var <= 1 - prev_var)
                            model.Add(start_var >= current_var - prev_var)
                        start_block_vars.append(start_var)

                    block_count = model.NewIntVar(
                        0,
                        day_capacity,
                        f"distribution_a{assignment_id}_d{day}_block_count",
                    )
                    model.Add(block_count == sum(start_block_vars))

                    extra_blocks = model.NewIntVar(
                        0,
                        day_capacity,
                        f"distribution_a{assignment_id}_d{day}_extra_blocks",
                    )
                    model.Add(extra_blocks >= block_count - 1)
                    model.Add(extra_blocks >= 0)
                    objective_terms.append(-distribution_non_consecutive_penalty * extra_blocks)

            if distribution_pattern_penalty > 0 and day_active_vars and expected_day_counts:
                active_day_count = model.NewIntVar(
                    0,
                    len(day_active_vars),
                    f"distribution_a{assignment_id}_active_day_count",
                )
                model.Add(active_day_count == sum(day_active_vars))

                min_expected_days = min(expected_day_counts)
                max_expected_days = max(expected_day_counts)

                day_count_under = model.NewIntVar(
                    0,
                    len(day_active_vars),
                    f"distribution_a{assignment_id}_active_day_under",
                )
                day_count_over = model.NewIntVar(
                    0,
                    len(day_active_vars),
                    f"distribution_a{assignment_id}_active_day_over",
                )
                model.Add(day_count_under >= min_expected_days - active_day_count)
                model.Add(day_count_under >= 0)
                model.Add(day_count_over >= active_day_count - max_expected_days)
                model.Add(day_count_over >= 0)
                objective_terms.append(-distribution_pattern_penalty * day_count_under)
                objective_terms.append(-distribution_pattern_penalty * day_count_over)

    if objective_terms:
        model.Maximize(sum(objective_terms))
    else:
        model.Maximize(0)

    seed_match_weight = _safe_int(config.get("seed_match_weight"), default=0, min_value=0, max_value=20)
    if seed_schedule_map:
        for assignment in assignments:
            assignment_id = assignment["id"]
            seeded_slot_ids = set(seed_schedule_map.get(assignment_id, tuple()))
            for slot_id in slot_ids:
                hinted_value = 1 if slot_id in seeded_slot_ids else 0
                model.AddHint(x[(assignment_id, slot_id)], hinted_value)
                if seed_match_weight > 0 and hinted_value == 1:
                    objective_terms.append(seed_match_weight * x[(assignment_id, slot_id)])

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
        diagnostics = _build_infeasibility_diagnostics(
            assignments=assignments,
            slots=slots,
            grade_track_map=grade_track_map,
            max_parallel_elective_subjects=max_parallel_elective_subjects,
            enforce_grade_track_constraints=enforce_grade_track_constraints,
        )
        first_diagnostic_message = diagnostics[0]["message"] if diagnostics else None
        status_name = solver.StatusName(status)
        code = "CP_SAT_NO_SOLUTION"
        message = "CP-SAT tidak menemukan solusi feasible"
        if status == cp_model.UNKNOWN:
            code = "CP_SAT_TIMEOUT"
            message = "CP-SAT belum menemukan solusi feasible dalam batas waktu"
        elif status == cp_model.INFEASIBLE:
            code = "CP_SAT_INFEASIBLE"
            message = "CP-SAT tidak menemukan solusi feasible"
        elif status == cp_model.MODEL_INVALID:
            code = "CP_SAT_MODEL_INVALID"
            message = "Model CP-SAT invalid"

        return None, 0, [
            _issue(
                code,
                (
                    f"{message}"
                    f"{f': {first_diagnostic_message}' if first_diagnostic_message else ''}"
                ),
                {
                    "solver_status": status_name,
                    "solver_seconds": config["solver_seconds"],
                    "num_conflicts": solver.NumConflicts(),
                    "num_branches": solver.NumBranches(),
                    "wall_time_seconds": solver.WallTime(),
                    "diagnostics": diagnostics,
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
    rng: random.Random,
    max_attempts: int,
) -> dict[int, tuple[int, ...]] | None:
    del slot_day_ordered_map
    for _ in range(max_attempts):
        teacher_busy: set[tuple[int, int]] = set()
        rombel_busy: set[tuple[int, int]] = set()
        student_busy: set[tuple[int, int]] = set()
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

            available = [
                slot_id
                for slot_id in slot_ids
                if (teacher_id, slot_id) not in teacher_busy
                and (rombel_id, slot_id) not in rombel_busy
                and all((student_id, slot_id) not in student_busy for student_id in student_ids)
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
    slot_day_ordered_map: dict[int, tuple[int, ...]],
    slot_day_position_map: dict[int, tuple[int, int]],
    preference_score_map: dict[tuple[int, int], int],
    day_spread_weight: int,
    assignment_student_map: dict[int, tuple[int, ...]],
    assignment_grade_map: dict[int, int],
    assignment_track_map: dict[int, str],
    teacher_subject_daily_limit: int,
    teacher_subject_daily_overload_penalty: int,
    rombel_daily_subject_limit: int,
    rombel_daily_subject_overload_penalty: int,
    distribution_pattern_penalty: int,
    distribution_non_consecutive_penalty: int,
    max_parallel_elective_subjects: int,
    rng: random.Random,
) -> dict[int, tuple[int, ...]]:
    base = _clone_schedule_map(schedule_map)
    best_score, base_feasible = _evaluate_schedule(
        base,
        assignments,
        slots_by_id,
        slot_day_position_map,
        preference_score_map,
        day_spread_weight,
        assignment_student_map,
        assignment_grade_map,
        assignment_track_map,
        teacher_subject_daily_limit,
        teacher_subject_daily_overload_penalty,
        rombel_daily_subject_limit,
        rombel_daily_subject_overload_penalty,
        distribution_pattern_penalty,
        distribution_non_consecutive_penalty,
        max_parallel_elective_subjects,
    )
    if not base_feasible:
        best_score = -1_000_000_000
    best_schedule = base

    assignment_ids = [assignment["id"] for assignment in assignments]
    rng.shuffle(assignment_ids)
    mutation_budget = min(len(assignment_ids), 24)

    for assignment_id in assignment_ids[:mutation_budget]:
        assignment = assignments_by_id[assignment_id]
        current_slots = list(best_schedule.get(assignment_id, tuple()))
        if not current_slots:
            continue

        weekly_hours = _safe_int(assignment.get("weekly_hours"), default=0, min_value=0)
        teacher_id = _safe_int(assignment.get("teacher_id"), default=0, min_value=0)

        # Operator blok jam: coba susunan slot per assignment mengikuti pattern distribusi jam.
        if weekly_hours > 1 and teacher_id > 0:
            pattern_candidates = _sample_distribution_pattern_slot_sets(
                weekly_hours=weekly_hours,
                slot_day_ordered_map=slot_day_ordered_map,
                teacher_id=teacher_id,
                preference_score_map=preference_score_map,
                rng=rng,
                max_samples=18,
            )
            for candidate_slots in pattern_candidates:
                if tuple(sorted(current_slots)) == candidate_slots:
                    continue
                trial = _clone_schedule_map(best_schedule)
                trial[assignment_id] = candidate_slots
                trial_score, feasible = _evaluate_schedule(
                    trial,
                    assignments,
                    slots_by_id,
                    slot_day_position_map,
                    preference_score_map,
                    day_spread_weight,
                    assignment_student_map,
                    assignment_grade_map,
                    assignment_track_map,
                    teacher_subject_daily_limit,
                    teacher_subject_daily_overload_penalty,
                    rombel_daily_subject_limit,
                    rombel_daily_subject_overload_penalty,
                    distribution_pattern_penalty,
                    distribution_non_consecutive_penalty,
                    max_parallel_elective_subjects,
                )
                if feasible and trial_score > best_score:
                    best_score = trial_score
                    best_schedule = trial
                    current_slots = list(candidate_slots)

        old_slot = rng.choice(current_slots)
        candidate_slots = [slot_id for slot_id in slot_ids if slot_id not in current_slots]
        rng.shuffle(candidate_slots)
        candidate_slots.sort(
            key=lambda slot_id: preference_score_map.get((assignment["teacher_id"], slot_id), 0),
            reverse=True,
        )
        top_candidates = candidate_slots[:12]
        if len(candidate_slots) > 12:
            random_tail = candidate_slots[12:]
            extra_k = min(4, len(random_tail))
            top_candidates.extend(rng.sample(random_tail, k=extra_k))

        for new_slot in top_candidates:
            next_slots = sorted([(new_slot if slot_id == old_slot else slot_id) for slot_id in current_slots])
            trial = _clone_schedule_map(best_schedule)
            trial[assignment_id] = tuple(next_slots)
            trial_score, feasible = _evaluate_schedule(
                trial,
                assignments,
                slots_by_id,
                slot_day_position_map,
                preference_score_map,
                day_spread_weight,
                assignment_student_map,
                assignment_grade_map,
                assignment_track_map,
                teacher_subject_daily_limit,
                teacher_subject_daily_overload_penalty,
                rombel_daily_subject_limit,
                rombel_daily_subject_overload_penalty,
                distribution_pattern_penalty,
                distribution_non_consecutive_penalty,
                max_parallel_elective_subjects,
            )
            if feasible and trial_score > best_score:
                best_score = trial_score
                best_schedule = trial

    return best_schedule


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
    teacher_subject_daily_limit: int,
    teacher_subject_daily_overload_penalty: int,
    rombel_daily_subject_limit: int,
    rombel_daily_subject_overload_penalty: int,
    distribution_pattern_penalty: int,
    distribution_non_consecutive_penalty: int,
    max_parallel_elective_subjects: int,
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
            teacher_subject_daily_limit,
            teacher_subject_daily_overload_penalty,
            rombel_daily_subject_limit,
            rombel_daily_subject_overload_penalty,
            distribution_pattern_penalty,
            distribution_non_consecutive_penalty,
            max_parallel_elective_subjects,
        )
        if feasible:
            child = trial

    return child


def _repair_distribution_schedule(
    schedule_map: dict[int, tuple[int, ...]],
    assignments: list[dict[str, Any]],
    slots_by_id: dict[int, dict[str, Any]],
    slot_day_ordered_map: dict[int, tuple[int, ...]],
    slot_day_position_map: dict[int, tuple[int, int]],
    preference_score_map: dict[tuple[int, int], int],
    day_spread_weight: int,
    assignment_student_map: dict[int, tuple[int, ...]],
    assignment_grade_map: dict[int, int],
    assignment_track_map: dict[int, str],
    teacher_subject_daily_limit: int,
    teacher_subject_daily_overload_penalty: int,
    rombel_daily_subject_limit: int,
    rombel_daily_subject_overload_penalty: int,
    distribution_pattern_penalty: int,
    distribution_non_consecutive_penalty: int,
    max_parallel_elective_subjects: int,
    random_seed: int,
    max_passes: int = 2,
    max_assignments_per_pass: int = 24,
    max_candidates_per_assignment: int = 18,
    deadline_at: float | None = None,
) -> tuple[dict[int, tuple[int, ...]], int, int, dict[str, Any]]:
    assignments_by_id = {assignment["id"]: assignment for assignment in assignments}
    best_schedule = _clone_schedule_map(schedule_map)
    best_score, best_feasible = _evaluate_schedule(
        best_schedule,
        assignments,
        slots_by_id,
        slot_day_position_map,
        preference_score_map,
        day_spread_weight,
        assignment_student_map,
        assignment_grade_map,
        assignment_track_map,
        teacher_subject_daily_limit,
        teacher_subject_daily_overload_penalty,
        rombel_daily_subject_limit,
        rombel_daily_subject_overload_penalty,
        distribution_pattern_penalty,
        distribution_non_consecutive_penalty,
        max_parallel_elective_subjects,
    )
    if not best_feasible:
        return schedule_map, -1_000_000_000, 1_000_000_000, {
            "improved": False,
            "passes": 0,
            "improved_assignments": 0,
            "reason": "base_schedule_infeasible",
        }

    best_penalty_breakdown = _calculate_soft_penalty_breakdown(
        schedule_map=best_schedule,
        assignments=assignments,
        slots_by_id=slots_by_id,
        slot_day_position_map=slot_day_position_map,
        teacher_subject_daily_limit=teacher_subject_daily_limit,
        teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
        rombel_daily_subject_limit=rombel_daily_subject_limit,
        rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
        distribution_pattern_penalty=distribution_pattern_penalty,
        distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
    )
    best_penalty = _safe_int(
        best_penalty_breakdown.get("total_penalty"),
        default=1_000_000_000,
        min_value=0,
    )
    initial_penalty = best_penalty
    improved_assignments = 0
    executed_passes = 0
    rng = random.Random(random_seed + 211)
    pattern_weight = max(distribution_pattern_penalty, 1)
    non_consecutive_weight = max(distribution_non_consecutive_penalty, 1)

    for _ in range(max_passes):
        if deadline_at is not None and time.perf_counter() >= deadline_at:
            break
        executed_passes += 1
        pass_improved = False

        assignment_priority: list[tuple[int, int, int, int]] = []
        for assignment in assignments:
            assignment_id = assignment["id"]
            slot_ids = best_schedule.get(assignment_id, tuple())
            pattern_units, non_consecutive_units = _calculate_distribution_units_for_assignment(
                assignment=assignment,
                slot_ids=slot_ids,
                slot_day_position_map=slot_day_position_map,
            )
            weighted_units = (pattern_units * pattern_weight) + (non_consecutive_units * non_consecutive_weight)
            if weighted_units <= 0:
                continue
            assignment_priority.append(
                (
                    weighted_units,
                    _safe_int(assignment.get("weekly_hours"), default=0, min_value=0),
                    assignment_id,
                    non_consecutive_units,
                )
            )

        if not assignment_priority:
            break

        assignment_priority.sort(key=lambda item: (item[0], item[1], item[3]), reverse=True)
        target_ids = [item[2] for item in assignment_priority[:max_assignments_per_pass]]

        for assignment_id in target_ids:
            if deadline_at is not None and time.perf_counter() >= deadline_at:
                break

            assignment = assignments_by_id.get(assignment_id)
            if not assignment:
                continue
            weekly_hours = _safe_int(assignment.get("weekly_hours"), default=0, min_value=0)
            teacher_id = _safe_int(assignment.get("teacher_id"), default=0, min_value=0)
            if weekly_hours <= 1 or teacher_id <= 0:
                continue

            current_slots = tuple(sorted(best_schedule.get(assignment_id, tuple())))
            candidates = _sample_distribution_pattern_slot_sets(
                weekly_hours=weekly_hours,
                slot_day_ordered_map=slot_day_ordered_map,
                teacher_id=teacher_id,
                preference_score_map=preference_score_map,
                rng=rng,
                max_samples=max_candidates_per_assignment,
            )
            if not candidates:
                continue

            local_best_slots = None
            local_best_score = best_score
            local_best_penalty = best_penalty

            for candidate_slots in candidates:
                if candidate_slots == current_slots:
                    continue
                trial = _clone_schedule_map(best_schedule)
                trial[assignment_id] = candidate_slots
                trial_score, feasible = _evaluate_schedule(
                    trial,
                    assignments,
                    slots_by_id,
                    slot_day_position_map,
                    preference_score_map,
                    day_spread_weight,
                    assignment_student_map,
                    assignment_grade_map,
                    assignment_track_map,
                    teacher_subject_daily_limit,
                    teacher_subject_daily_overload_penalty,
                    rombel_daily_subject_limit,
                    rombel_daily_subject_overload_penalty,
                    distribution_pattern_penalty,
                    distribution_non_consecutive_penalty,
                    max_parallel_elective_subjects,
                )
                if not feasible:
                    continue

                trial_penalty_breakdown = _calculate_soft_penalty_breakdown(
                    schedule_map=trial,
                    assignments=assignments,
                    slots_by_id=slots_by_id,
                    slot_day_position_map=slot_day_position_map,
                    teacher_subject_daily_limit=teacher_subject_daily_limit,
                    teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                    rombel_daily_subject_limit=rombel_daily_subject_limit,
                    rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                    distribution_pattern_penalty=distribution_pattern_penalty,
                    distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                )
                trial_penalty = _safe_int(
                    trial_penalty_breakdown.get("total_penalty"),
                    default=1_000_000_000,
                    min_value=0,
                )

                if trial_penalty < local_best_penalty or (
                    trial_penalty == local_best_penalty and trial_score > local_best_score
                ):
                    local_best_slots = candidate_slots
                    local_best_score = trial_score
                    local_best_penalty = trial_penalty

            if local_best_slots is not None:
                best_schedule[assignment_id] = local_best_slots
                best_score = local_best_score
                best_penalty = local_best_penalty
                improved_assignments += 1
                pass_improved = True

        if not pass_improved:
            break

    return best_schedule, best_score, best_penalty, {
        "improved": best_penalty < initial_penalty,
        "passes": executed_passes,
        "improved_assignments": improved_assignments,
        "initial_penalty": initial_penalty,
        "final_penalty": best_penalty,
    }


def _tournament_pick(
    scored_population: list[tuple[int, int, dict[int, tuple[int, ...]]]],
    rng: random.Random,
    size: int,
) -> dict[int, tuple[int, ...]]:
    k = min(size, len(scored_population))
    contenders = rng.sample(scored_population, k=k)
    contenders.sort(key=lambda item: (item[0], -item[1]))
    return _clone_schedule_map(contenders[0][2])


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
    teacher_subject_daily_limit: int,
    teacher_subject_daily_overload_penalty: int,
    rombel_daily_subject_limit: int,
    rombel_daily_subject_overload_penalty: int,
    distribution_pattern_penalty: int,
    distribution_non_consecutive_penalty: int,
    max_parallel_elective_subjects: int,
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
    base_penalty_breakdown = _calculate_soft_penalty_breakdown(
        schedule_map=base_schedule,
        assignments=assignments,
        slots_by_id=slots_by_id,
        slot_day_position_map=slot_day_position_map,
        teacher_subject_daily_limit=teacher_subject_daily_limit,
        teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
        rombel_daily_subject_limit=rombel_daily_subject_limit,
        rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
        distribution_pattern_penalty=distribution_pattern_penalty,
        distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
    )
    best_penalty_total = _safe_int(
        base_penalty_breakdown.get("total_penalty"),
        default=1_000_000_000,
        min_value=0,
    )

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
                slot_day_ordered_map=slot_day_ordered_map,
                slot_day_position_map=slot_day_position_map,
                preference_score_map=preference_score_map,
                day_spread_weight=day_spread_weight,
                assignment_student_map=assignment_student_map,
                assignment_grade_map=assignment_grade_map,
                assignment_track_map=assignment_track_map,
                teacher_subject_daily_limit=teacher_subject_daily_limit,
                teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                rombel_daily_subject_limit=rombel_daily_subject_limit,
                rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                distribution_pattern_penalty=distribution_pattern_penalty,
                distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                max_parallel_elective_subjects=max_parallel_elective_subjects,
                rng=rng,
            )
        population.append(candidate)

    best_schedule = _clone_schedule_map(base_schedule)
    best_score = base_score

    for _ in range(config["ga_generations"]):
        scored_population: list[tuple[int, int, dict[int, tuple[int, ...]]]] = []
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
                teacher_subject_daily_limit,
                teacher_subject_daily_overload_penalty,
                rombel_daily_subject_limit,
                rombel_daily_subject_overload_penalty,
                distribution_pattern_penalty,
                distribution_non_consecutive_penalty,
                max_parallel_elective_subjects,
            )
            if feasible:
                penalty_breakdown = _calculate_soft_penalty_breakdown(
                    schedule_map=individual,
                    assignments=assignments,
                    slots_by_id=slots_by_id,
                    slot_day_position_map=slot_day_position_map,
                    teacher_subject_daily_limit=teacher_subject_daily_limit,
                    teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                    rombel_daily_subject_limit=rombel_daily_subject_limit,
                    rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                    distribution_pattern_penalty=distribution_pattern_penalty,
                    distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                )
                penalty_total = _safe_int(
                    penalty_breakdown.get("total_penalty"),
                    default=1_000_000_000,
                    min_value=0,
                )
                scored_population.append((penalty_total, score, individual))

        if not scored_population:
            warnings.append(
                _issue(
                    "GA_EMPTY_FEASIBLE_POPULATION",
                    "GA tidak memiliki kandidat feasible, kembali ke hasil CP-SAT",
                )
            )
            return base_schedule, base_score, warnings

        scored_population.sort(key=lambda item: (item[0], -item[1]))
        top_penalty, top_score, top_individual = scored_population[0]
        if top_penalty < best_penalty_total or (top_penalty == best_penalty_total and top_score > best_score):
            best_penalty_total = top_penalty
            best_score = top_score
            best_schedule = _clone_schedule_map(top_individual)

        next_population: list[dict[int, tuple[int, ...]]] = []
        elite_count = min(config["ga_elite_count"], len(scored_population))
        for index in range(elite_count):
            next_population.append(_clone_schedule_map(scored_population[index][2]))

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
                    teacher_subject_daily_limit=teacher_subject_daily_limit,
                    teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                    rombel_daily_subject_limit=rombel_daily_subject_limit,
                    rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                    distribution_pattern_penalty=distribution_pattern_penalty,
                    distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                    max_parallel_elective_subjects=max_parallel_elective_subjects,
                    rng=rng,
                )
            if rng.random() < config["ga_mutation_rate"]:
                child = _mutate_schedule(
                    schedule_map=child,
                    assignments=assignments,
                    assignments_by_id=assignments_by_id,
                    slot_ids=slot_ids,
                    slots_by_id=slots_by_id,
                    slot_day_ordered_map=slot_day_ordered_map,
                    slot_day_position_map=slot_day_position_map,
                    preference_score_map=preference_score_map,
                    day_spread_weight=day_spread_weight,
                    assignment_student_map=assignment_student_map,
                    assignment_grade_map=assignment_grade_map,
                    assignment_track_map=assignment_track_map,
                    teacher_subject_daily_limit=teacher_subject_daily_limit,
                    teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                    rombel_daily_subject_limit=rombel_daily_subject_limit,
                    rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                    distribution_pattern_penalty=distribution_pattern_penalty,
                    distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                    max_parallel_elective_subjects=max_parallel_elective_subjects,
                    rng=rng,
                )

            next_population.append(child)

        population = next_population

    return best_schedule, best_score, warnings


def generate_schedule(data: dict[str, Any]) -> dict[str, Any]:
    generated_at = _now_iso()
    total_started_at = time.perf_counter()
    constraints = data.get("constraints") if isinstance(data.get("constraints"), dict) else {}
    config = _build_config(constraints)
    overall_runtime_limit_seconds = _safe_float(
        config.get("total_runtime_seconds"),
        default=1800.0,
        min_value=60.0,
        max_value=1800.0,
    )
    deadline_at = total_started_at + overall_runtime_limit_seconds

    normalized, warnings, conflicts = _normalize_inputs(data)
    assignments = normalized["assignments"]
    slots = normalized["slots"]
    preferences = normalized["preferences"]
    student_enrollments = normalized["student_enrollments"]

    assignments_by_id = {assignment["id"]: assignment for assignment in assignments}
    slots_by_id = {slot["id"]: slot for slot in slots}
    slot_day_ordered_map, slot_day_position_map = _build_slot_day_structures(slots_by_id)
    total_requested_hours = sum(assignment["weekly_hours"] for assignment in assignments)
    teacher_subject_daily_limit = _safe_int(
        config["objective"].get("teacher_subject_daily_limit"),
        default=FIXED_TEACHER_SUBJECT_DAILY_HOURS_LIMIT,
        min_value=1,
    )
    teacher_subject_daily_overload_penalty = abs(
        _safe_int(
            config["objective"].get("teacher_subject_daily_overload_penalty"),
            default=FIXED_TEACHER_SUBJECT_DAILY_HOURS_OVERLOAD_PENALTY,
            min_value=0,
            max_value=100,
        )
    )
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
    distribution_pattern_penalty = abs(
        _safe_int(
            config["objective"].get("distribution_pattern_penalty"),
            default=FIXED_DISTRIBUTION_PATTERN_PENALTY,
            min_value=0,
            max_value=100,
        )
    )
    distribution_non_consecutive_penalty = abs(
        _safe_int(
            config["objective"].get("distribution_non_consecutive_penalty"),
            default=FIXED_DISTRIBUTION_NON_CONSECUTIVE_PENALTY,
            min_value=0,
            max_value=100,
        )
    )
    max_parallel_elective_subjects = _safe_int(
        config["objective"].get("grade_elective_max_parallel_subjects"),
        default=FIXED_GRADE_ELECTIVE_MAX_PARALLEL_SUBJECTS,
        min_value=1,
        max_value=10,
    )
    enforce_grade_track_constraints = _safe_bool(
        config.get("enforce_grade_track_constraints"),
        False,
    )
    if not enforce_grade_track_constraints:
        max_parallel_elective_subjects = 0

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

    # Bentrok berbasis siswa bersifat opsional (default: off) agar model tetap ringan.
    if ENABLE_STUDENT_CONFLICT_CHECK and assignments and student_enrollments:
        (
            student_assignment_map,
            assignment_student_map,
            student_mapping_warnings,
        ) = _build_student_assignment_maps(assignments, student_enrollments)
        warnings.extend(student_mapping_warnings)

    # Bentrok wajib-vs-peminatan tingkat kelas dan batas paralel peminatan.
    if enforce_grade_track_constraints and assignments:
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
    cp_sat_runtime_ms = 0
    ga_runtime_ms = 0
    cp_sat_polish_runtime_ms = 0
    cp_sat_solver_score: int | None = None
    cp_sat_evaluated_score: int | None = None
    final_evaluated_score: int | None = None
    cp_sat_soft_penalties: dict[str, Any] | None = None
    final_soft_penalties: dict[str, Any] | None = None
    final_hard_constraints: dict[str, Any] | None = None
    final_schedule_map: dict[int, tuple[int, ...]] = {}
    final_score: int | None = None
    final_penalty_total: int | None = None
    cp_sat_penalty_total: int | None = None
    hybrid_rounds_summary: list[dict[str, Any]] = []

    if not conflicts:
        remaining_seconds = max(1.0, deadline_at - time.perf_counter() - 1.0)
        cp_sat_config = dict(config)
        cp_sat_config["solver_seconds"] = min(float(config["solver_seconds"]), remaining_seconds)
        cp_sat_started_at = time.perf_counter()
        cp_schedule_map, cp_score, cp_conflicts = _solve_cp_sat(
            assignments=assignments,
            slots=slots,
            preference_score_map=preference_score_map,
            student_assignment_map=student_assignment_map,
            grade_track_map=grade_track_map,
            config=cp_sat_config,
        )
        if (
            not cp_schedule_map
            and cp_conflicts
            and cp_conflicts[0].get("code") == "CP_SAT_TIMEOUT"
        ):
            retry_remaining_seconds = max(1.0, deadline_at - time.perf_counter() - 1.0)
            retry_seconds = min(180.0, retry_remaining_seconds)
            if retry_seconds > float(cp_sat_config.get("solver_seconds", 0)):
                retry_config = dict(cp_sat_config)
                retry_config["solver_seconds"] = retry_seconds
                retry_schedule_map, retry_score, retry_conflicts = _solve_cp_sat(
                    assignments=assignments,
                    slots=slots,
                    preference_score_map=preference_score_map,
                    student_assignment_map=student_assignment_map,
                    grade_track_map=grade_track_map,
                    config=retry_config,
                )
                if retry_schedule_map:
                    cp_schedule_map = retry_schedule_map
                    cp_score = retry_score
                    cp_conflicts = []
                    warnings.append(
                        _issue(
                            "CP_SAT_RETRY_SUCCESS",
                            "CP-SAT menemukan solusi setelah retry dengan batas waktu lebih panjang",
                            {"retry_solver_seconds": retry_seconds},
                        )
                    )
                else:
                    cp_conflicts = retry_conflicts or cp_conflicts

        if (
            not cp_schedule_map
            and cp_conflicts
            and cp_conflicts[0].get("code") == "CP_SAT_TIMEOUT"
        ):
            rescue_remaining_seconds = deadline_at - time.perf_counter() - 1.0
            rescue_seconds = min(180.0, rescue_remaining_seconds) if rescue_remaining_seconds > 0 else 45.0
            if rescue_seconds > 0:
                rescue_config = dict(cp_sat_config)
                rescue_config["solver_seconds"] = rescue_seconds
                rescue_objective = dict(rescue_config.get("objective") or {})
                rescue_objective["prefer_weight"] = 0
                rescue_objective["avoid_penalty"] = 0
                rescue_objective["day_spread_weight"] = 0
                rescue_objective["teacher_subject_daily_overload_penalty"] = 0
                rescue_objective["rombel_daily_subject_overload_penalty"] = 0
                rescue_objective["distribution_pattern_penalty"] = 0
                rescue_objective["distribution_non_consecutive_penalty"] = 0
                rescue_config["objective"] = rescue_objective
                rescue_config["seed_match_weight"] = 0

                rescue_schedule_map, rescue_score, rescue_conflicts = _solve_cp_sat(
                    assignments=assignments,
                    slots=slots,
                    preference_score_map=preference_score_map,
                    student_assignment_map=student_assignment_map,
                    grade_track_map=grade_track_map,
                    config=rescue_config,
                )
                if rescue_schedule_map:
                    cp_schedule_map = rescue_schedule_map
                    cp_score = rescue_score
                    cp_conflicts = []
                    warnings.append(
                        _issue(
                            "CP_SAT_FEASIBILITY_RESCUE",
                            (
                                "CP-SAT menemukan solusi pada mode feasibility-first "
                                "setelah timeout di mode optimasi."
                            ),
                            {"rescue_solver_seconds": rescue_seconds},
                        )
                    )
                else:
                    cp_conflicts = rescue_conflicts or cp_conflicts

        cp_sat_runtime_ms = int(round((time.perf_counter() - cp_sat_started_at) * 1000))
        conflicts.extend(cp_conflicts)

        if cp_schedule_map:
            cp_sat_solver_score = cp_score
            cp_sat_evaluated_score, cp_sat_feasible = _evaluate_schedule(
                schedule_map=cp_schedule_map,
                assignments=assignments,
                slots_by_id=slots_by_id,
                slot_day_position_map=slot_day_position_map,
                preference_score_map=preference_score_map,
                day_spread_weight=config["objective"]["day_spread_weight"],
                assignment_student_map=assignment_student_map,
                assignment_grade_map=assignment_grade_map,
                assignment_track_map=assignment_track_map,
                teacher_subject_daily_limit=teacher_subject_daily_limit,
                teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                rombel_daily_subject_limit=rombel_daily_subject_limit,
                rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                distribution_pattern_penalty=distribution_pattern_penalty,
                distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                max_parallel_elective_subjects=max_parallel_elective_subjects,
            )
            cp_sat_soft_penalties = _calculate_soft_penalty_breakdown(
                schedule_map=cp_schedule_map,
                assignments=assignments,
                slots_by_id=slots_by_id,
                slot_day_position_map=slot_day_position_map,
                teacher_subject_daily_limit=teacher_subject_daily_limit,
                teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                rombel_daily_subject_limit=rombel_daily_subject_limit,
                rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                distribution_pattern_penalty=distribution_pattern_penalty,
                distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
            )
            if not cp_sat_feasible:
                conflicts.append(
                    _issue(
                        "CP_SAT_EVALUATION_INFEASIBLE",
                        "Solusi CP-SAT tidak memenuhi hard constraint saat evaluasi internal",
                    )
                )

            cp_sat_penalty_total = (
                _safe_int(cp_sat_soft_penalties.get("total_penalty"), default=0, min_value=0)
                if cp_sat_soft_penalties
                else 0
            )
            final_schedule_map = cp_schedule_map
            final_score = cp_sat_evaluated_score
            final_penalty_total = cp_sat_penalty_total
            if config["ga_enabled"]:
                engine = "hybrid-cp-sat-ga"
                best_schedule_map = cp_schedule_map
                best_score = cp_sat_evaluated_score
                best_penalty_total = cp_sat_penalty_total
                no_improvement_rounds = 0
                cp_polish_timeout_rounds = 0
                target_rounds = _safe_int(config.get("hybrid_rounds"), default=2, min_value=1, max_value=3)
                stop_rounds = _safe_int(
                    config.get("hybrid_no_improvement_stop_rounds"),
                    default=2,
                    min_value=1,
                    max_value=3,
                )

                for round_index in range(1, target_rounds + 1):
                    remaining_round_seconds = deadline_at - time.perf_counter()
                    if remaining_round_seconds <= 5:
                        warnings.append(
                            _issue(
                                "HYBRID_RUNTIME_GUARD_STOP",
                                f"Hybrid dihentikan di round #{round_index} karena mendekati batas waktu proses",
                                {"runtime_limit_seconds": overall_runtime_limit_seconds},
                            )
                        )
                        break

                    round_entry: dict[str, Any] = {"round": round_index}

                    ga_started_at = time.perf_counter()
                    ga_schedule_map, _, ga_warnings = _run_ga_refinement(
                        base_schedule=best_schedule_map,
                        base_score=best_score,
                        assignments=assignments,
                        slot_ids=[slot["id"] for slot in slots],
                        slots_by_id=slots_by_id,
                        slot_day_ordered_map=slot_day_ordered_map,
                        slot_day_position_map=slot_day_position_map,
                        preference_score_map=preference_score_map,
                        assignment_student_map=assignment_student_map,
                        assignment_grade_map=assignment_grade_map,
                        assignment_track_map=assignment_track_map,
                        teacher_subject_daily_limit=teacher_subject_daily_limit,
                        teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                        rombel_daily_subject_limit=rombel_daily_subject_limit,
                        rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                        distribution_pattern_penalty=distribution_pattern_penalty,
                        distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                        max_parallel_elective_subjects=max_parallel_elective_subjects,
                        config=config,
                    )
                    ga_round_runtime = int(round((time.perf_counter() - ga_started_at) * 1000))
                    ga_runtime_ms += ga_round_runtime
                    warnings.extend(ga_warnings)

                    ga_score_eval, ga_feasible = _evaluate_schedule(
                        schedule_map=ga_schedule_map,
                        assignments=assignments,
                        slots_by_id=slots_by_id,
                        slot_day_position_map=slot_day_position_map,
                        preference_score_map=preference_score_map,
                        day_spread_weight=config["objective"]["day_spread_weight"],
                        assignment_student_map=assignment_student_map,
                        assignment_grade_map=assignment_grade_map,
                        assignment_track_map=assignment_track_map,
                        teacher_subject_daily_limit=teacher_subject_daily_limit,
                        teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                        rombel_daily_subject_limit=rombel_daily_subject_limit,
                        rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                        distribution_pattern_penalty=distribution_pattern_penalty,
                        distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                        max_parallel_elective_subjects=max_parallel_elective_subjects,
                    )

                    if not ga_feasible:
                        warnings.append(
                            _issue(
                                "HYBRID_ROUND_GA_INFEASIBLE",
                                f"Round #{round_index}: hasil GA tidak feasible, kembali ke kandidat round sebelumnya",
                            )
                        )
                        ga_schedule_map = best_schedule_map
                        ga_score_eval = best_score

                    cp_polish_started_at = time.perf_counter()
                    remaining_polish_seconds = max(1.0, deadline_at - time.perf_counter() - 1.0)
                    cp_polish_config = dict(config)
                    cp_polish_config["solver_seconds"] = min(
                        float(config["solver_seconds"]),
                        20.0,
                        remaining_polish_seconds,
                    )
                    cp_polish_schedule_map, _, cp_polish_conflicts = _solve_cp_sat(
                        assignments=assignments,
                        slots=slots,
                        preference_score_map=preference_score_map,
                        student_assignment_map=student_assignment_map,
                        grade_track_map=grade_track_map,
                        config=cp_polish_config,
                        seed_schedule_map=ga_schedule_map,
                    )
                    cp_polish_round_runtime = int(round((time.perf_counter() - cp_polish_started_at) * 1000))
                    cp_sat_polish_runtime_ms += cp_polish_round_runtime

                    if cp_polish_conflicts:
                        for conflict_item in cp_polish_conflicts:
                            conflict_code = str(conflict_item.get("code") or "")
                            if conflict_code == "CP_SAT_TIMEOUT":
                                cp_polish_timeout_rounds += 1
                                continue
                            warnings.append(conflict_item)

                    selected_schedule_map = ga_schedule_map
                    selected_score = ga_score_eval
                    ga_penalty = _calculate_soft_penalty_breakdown(
                        schedule_map=ga_schedule_map,
                        assignments=assignments,
                        slots_by_id=slots_by_id,
                        slot_day_position_map=slot_day_position_map,
                        teacher_subject_daily_limit=teacher_subject_daily_limit,
                        teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                        rombel_daily_subject_limit=rombel_daily_subject_limit,
                        rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                        distribution_pattern_penalty=distribution_pattern_penalty,
                        distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                    )
                    selected_penalty_total = _safe_int(
                        ga_penalty.get("total_penalty"),
                        default=1_000_000_000,
                        min_value=0,
                    )
                    cp_polish_score_eval: int | None = None
                    cp_polish_feasible = False
                    cp_polish_penalty_total: int | None = None

                    if cp_polish_schedule_map:
                        cp_polish_score_eval, cp_polish_feasible = _evaluate_schedule(
                            schedule_map=cp_polish_schedule_map,
                            assignments=assignments,
                            slots_by_id=slots_by_id,
                            slot_day_position_map=slot_day_position_map,
                            preference_score_map=preference_score_map,
                            day_spread_weight=config["objective"]["day_spread_weight"],
                            assignment_student_map=assignment_student_map,
                            assignment_grade_map=assignment_grade_map,
                            assignment_track_map=assignment_track_map,
                            teacher_subject_daily_limit=teacher_subject_daily_limit,
                            teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                            rombel_daily_subject_limit=rombel_daily_subject_limit,
                            rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                            distribution_pattern_penalty=distribution_pattern_penalty,
                            distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                            max_parallel_elective_subjects=max_parallel_elective_subjects,
                        )
                        if cp_polish_feasible:
                            cp_polish_penalty = _calculate_soft_penalty_breakdown(
                                schedule_map=cp_polish_schedule_map,
                                assignments=assignments,
                                slots_by_id=slots_by_id,
                                slot_day_position_map=slot_day_position_map,
                                teacher_subject_daily_limit=teacher_subject_daily_limit,
                                teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                                rombel_daily_subject_limit=rombel_daily_subject_limit,
                                rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                                distribution_pattern_penalty=distribution_pattern_penalty,
                                distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                            )
                            cp_polish_penalty_total = _safe_int(
                                cp_polish_penalty.get("total_penalty"),
                                default=1_000_000_000,
                                min_value=0,
                            )
                            if (
                                cp_polish_penalty_total < selected_penalty_total
                                or (
                                    cp_polish_penalty_total == selected_penalty_total
                                    and cp_polish_score_eval >= selected_score
                                )
                            ):
                                selected_schedule_map = cp_polish_schedule_map
                                selected_score = cp_polish_score_eval
                                selected_penalty_total = cp_polish_penalty_total

                    improved = (
                        selected_penalty_total < best_penalty_total
                        or (
                            selected_penalty_total == best_penalty_total
                            and selected_score > best_score
                        )
                    )
                    if improved:
                        best_schedule_map = selected_schedule_map
                        best_score = selected_score
                        best_penalty_total = selected_penalty_total
                        no_improvement_rounds = 0
                    else:
                        no_improvement_rounds += 1

                    round_entry.update(
                        {
                            "ga_runtime_ms": ga_round_runtime,
                            "cp_sat_polish_runtime_ms": cp_polish_round_runtime,
                            "ga_score": ga_score_eval,
                            "ga_penalty": ga_penalty["total_penalty"],
                            "cp_sat_polish_score": cp_polish_score_eval,
                            "cp_sat_polish_penalty": cp_polish_penalty_total,
                            "cp_sat_polish_feasible": cp_polish_feasible,
                            "selected_score": selected_score,
                            "selected_penalty": selected_penalty_total,
                            "improved": improved,
                        }
                    )
                    hybrid_rounds_summary.append(round_entry)

                    if selected_penalty_total <= 0:
                        warnings.append(
                            _issue(
                                "HYBRID_ZERO_PENALTY_REACHED",
                                f"Hybrid berhenti di round #{round_index} karena penalty sudah 0",
                            )
                        )
                        break

                    if no_improvement_rounds >= stop_rounds:
                        warnings.append(
                            _issue(
                                "HYBRID_NO_IMPROVEMENT_STOP",
                                (
                                    "Hybrid berhenti karena tidak ada perbaikan "
                                    f"penalty/score dalam {stop_rounds} round terakhir"
                                ),
                                {"stop_round": round_index},
                            )
                        )
                        break

                if cp_polish_timeout_rounds > 0:
                    warnings.append(
                        _issue(
                            "HYBRID_CP_POLISH_TIMEOUT",
                            (
                                "Sebagian round CP-SAT polish melewati batas waktu, "
                                "namun proses hybrid tetap berjalan dengan kandidat terbaik yang tersedia."
                            ),
                            {"timeout_rounds": cp_polish_timeout_rounds},
                        )
                    )

                final_schedule_map = best_schedule_map
                final_score = best_score
                final_penalty_total = best_penalty_total

            # Post-optimization khusus pola pemerataan jam berbasis blok (2/3, 2+2, 3+2, dst).
            remaining_repair_seconds = max(0.0, deadline_at - time.perf_counter() - 1.0)
            if remaining_repair_seconds >= 1.0:
                repair_deadline = time.perf_counter() + min(25.0, remaining_repair_seconds)
                repaired_schedule_map, repaired_score, repaired_penalty, repair_meta = _repair_distribution_schedule(
                    schedule_map=final_schedule_map,
                    assignments=assignments,
                    slots_by_id=slots_by_id,
                    slot_day_ordered_map=slot_day_ordered_map,
                    slot_day_position_map=slot_day_position_map,
                    preference_score_map=preference_score_map,
                    day_spread_weight=config["objective"]["day_spread_weight"],
                    assignment_student_map=assignment_student_map,
                    assignment_grade_map=assignment_grade_map,
                    assignment_track_map=assignment_track_map,
                    teacher_subject_daily_limit=teacher_subject_daily_limit,
                    teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                    rombel_daily_subject_limit=rombel_daily_subject_limit,
                    rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                    distribution_pattern_penalty=distribution_pattern_penalty,
                    distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
                    max_parallel_elective_subjects=max_parallel_elective_subjects,
                    random_seed=config["random_seed"],
                    max_passes=3,
                    max_assignments_per_pass=32,
                    max_candidates_per_assignment=24,
                    deadline_at=repair_deadline,
                )
                if repaired_penalty < final_penalty_total or (
                    repaired_penalty == final_penalty_total and repaired_score > final_score
                ):
                    final_schedule_map = repaired_schedule_map
                    final_score = repaired_score
                    final_evaluated_score = repaired_score
                    final_penalty_total = repaired_penalty
                    warnings.append(
                        _issue(
                            "DISTRIBUTION_REPAIR_APPLIED",
                            "Post-optimization distribusi jam memperbaiki kualitas jadwal.",
                            repair_meta,
                        )
                    )

            final_evaluated_score = final_score
            final_hard_constraints = _calculate_hard_constraint_report(
                schedule_map=final_schedule_map,
                assignments=assignments,
                slots_by_id=slots_by_id,
                slot_day_position_map=slot_day_position_map,
                max_parallel_elective_subjects=max_parallel_elective_subjects,
                enforce_grade_track_constraints=enforce_grade_track_constraints,
            )
            final_soft_penalties = _calculate_soft_penalty_breakdown(
                schedule_map=final_schedule_map,
                assignments=assignments,
                slots_by_id=slots_by_id,
                slot_day_position_map=slot_day_position_map,
                teacher_subject_daily_limit=teacher_subject_daily_limit,
                teacher_subject_daily_overload_penalty=teacher_subject_daily_overload_penalty,
                rombel_daily_subject_limit=rombel_daily_subject_limit,
                rombel_daily_subject_overload_penalty=rombel_daily_subject_overload_penalty,
                distribution_pattern_penalty=distribution_pattern_penalty,
                distribution_non_consecutive_penalty=distribution_non_consecutive_penalty,
            )
            final_penalty_total = (
                _safe_int(
                    final_soft_penalties.get("total_penalty"),
                    default=final_penalty_total,
                    min_value=0,
                )
                if final_soft_penalties
                else final_penalty_total
            )

            if config["ga_enabled"]:
                if final_penalty_total > cp_sat_penalty_total:
                    warnings.append(
                        _issue(
                            "HYBRID_REGRESSION_GUARD",
                            (
                                "Penalty hasil hybrid lebih buruk dari CP-SAT. "
                                "Sistem otomatis memakai solusi CP-SAT."
                            ),
                            {
                                "cp_sat_penalty": cp_sat_penalty_total,
                                "hybrid_penalty": final_penalty_total,
                            },
                        )
                    )
                    final_schedule_map = cp_schedule_map
                    final_score = cp_sat_evaluated_score
                    final_evaluated_score = cp_sat_evaluated_score
                    final_soft_penalties = cp_sat_soft_penalties
                    final_penalty_total = cp_sat_penalty_total
                    final_hard_constraints = _calculate_hard_constraint_report(
                        schedule_map=final_schedule_map,
                        assignments=assignments,
                        slots_by_id=slots_by_id,
                        slot_day_position_map=slot_day_position_map,
                        max_parallel_elective_subjects=max_parallel_elective_subjects,
                        enforce_grade_track_constraints=enforce_grade_track_constraints,
                    )
                    engine = "cp-sat"
                elif final_penalty_total < cp_sat_penalty_total:
                    warnings.append(
                        _issue(
                            "HYBRID_FINAL_SUMMARY",
                            "Hybrid menghasilkan jadwal lebih baik dari CP-SAT pada metric penalty.",
                            {
                                "cp_sat_penalty": cp_sat_penalty_total,
                                "final_penalty": final_penalty_total,
                                "cp_sat_score": cp_sat_evaluated_score,
                                "final_score": final_evaluated_score,
                            },
                        )
                    )
                else:
                    warnings.append(
                        _issue(
                            "HYBRID_FINAL_SUMMARY",
                            "Hybrid selesai tanpa perbaikan penalty dibanding CP-SAT.",
                            {
                                "cp_sat_penalty": cp_sat_penalty_total,
                                "final_penalty": final_penalty_total,
                                "cp_sat_score": cp_sat_evaluated_score,
                                "final_score": final_evaluated_score,
                            },
                        )
                    )

            schedule_items = _schedule_map_to_items(
                schedule_map=final_schedule_map,
                assignments_by_id=assignments_by_id,
                slots_by_id=slots_by_id,
            )
            hard_status = final_hard_constraints.get("status") if final_hard_constraints else {}
            hard_feasible = bool(hard_status) and all(
                value is None or bool(value)
                for value in hard_status.values()
            )
            feasible = hard_feasible and len(schedule_items) == total_requested_hours
            if not feasible:
                conflicts.append(
                    _issue(
                        "UNASSIGNED_SESSIONS",
                        "Jadwal hasil generate belum memenuhi hard constraint final",
                        {
                            "requested_sessions": total_requested_hours,
                            "generated_sessions": len(schedule_items),
                            "hard_constraints": hard_status,
                        },
                    )
                )
    total_runtime_ms = int(round((time.perf_counter() - total_started_at) * 1000))
    score_delta = (
        final_evaluated_score - cp_sat_evaluated_score
        if final_evaluated_score is not None and cp_sat_evaluated_score is not None
        else None
    )
    distribution_compliance = (
        _build_distribution_compliance_report(
            schedule_map=final_schedule_map,
            assignments=assignments,
            slot_day_position_map=slot_day_position_map,
        )
        if schedule_items
        else None
    )
    summary = {
        "total_teaching_assignments": len(assignments),
        "total_time_slots": len(slots),
        "total_teacher_preferences": len(preferences),
        "total_student_enrollments": len(student_enrollments),
        "requested_sessions": total_requested_hours,
        "generated_items": len(schedule_items),
        "feasible": feasible and not conflicts,
        "engine": engine,
        "runtime_ms": {
            "total": total_runtime_ms,
            "cp_sat": cp_sat_runtime_ms,
            "ga": ga_runtime_ms,
            "cp_sat_polish": cp_sat_polish_runtime_ms,
        },
        "objective_scores": {
            "cp_sat_solver": cp_sat_solver_score,
            "cp_sat_evaluated": cp_sat_evaluated_score,
            "final": final_evaluated_score,
            "delta": score_delta,
        },
        "hard_constraints": final_hard_constraints,
        "soft_penalties": {
            "cp_sat": cp_sat_soft_penalties,
            "final": final_soft_penalties,
        },
        "distribution_compliance": distribution_compliance,
        "constraint_profile": {
            "teacher_subject_daily_soft_limit": teacher_subject_daily_limit,
            "rombel_daily_subject_soft_limit": rombel_daily_subject_limit,
            "distribution_pattern_penalty": distribution_pattern_penalty,
            "distribution_non_consecutive_penalty": distribution_non_consecutive_penalty,
            "distribution_cp_objective_enabled": _safe_bool(
                config.get("enable_distribution_cp_objective"),
                False,
            ),
            "hybrid_rounds": _safe_int(config.get("hybrid_rounds"), default=2, min_value=1, max_value=3),
            "runtime_limit_seconds": overall_runtime_limit_seconds,
            "distribution_rules": [
                "1 jam/minggu: bebas",
                "2-3 jam/minggu: 1 hari, berurutan",
                "4 jam/minggu: 2 hari (2+2)",
                "5 jam/minggu: 2 hari (3+2)",
                "6 jam/minggu: 2 hari (3+3) atau 3 hari (2+2+2)",
            ],
            "wajib_peminatan_conflict_check_enabled": enforce_grade_track_constraints,
            "student_conflict_check_enabled": ENABLE_STUDENT_CONFLICT_CHECK,
            "hybrid_ga_enabled": config["ga_enabled"],
            "mode": "minimal-baseline" if not enforce_grade_track_constraints and not config["ga_enabled"] else "custom",
        },
        "hybrid_rounds": hybrid_rounds_summary,
        "rombel_daily_subject_soft_limit": rombel_daily_subject_limit,
        "teacher_subject_daily_soft_limit": teacher_subject_daily_limit,
    }

    return {
        "generated_at": generated_at,
        "period_id": normalized["period_id"],
        "summary": summary,
        "schedule": schedule_items,
        "warnings": warnings,
        "conflicts": conflicts,
    }
