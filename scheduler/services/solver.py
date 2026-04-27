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
FIXED_ROMBEL_DAILY_SUBJECT_LIMIT = 6
FIXED_ROMBEL_DAILY_SUBJECT_OVERLOAD_PENALTY = 5
FIXED_DISTRIBUTION_PATTERN_PENALTY = 12
FIXED_DISTRIBUTION_NON_CONSECUTIVE_PENALTY = 15
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
        objective_cfg.get("prefer", constraints.get("prefer_weight", 15)),
        default=15,
        min_value=0,
        max_value=100,
    )
    avoid_penalty = abs(
        _safe_int(
            objective_cfg.get("avoid", constraints.get("avoid_penalty", 25)),
            default=25,
            min_value=-100,
            max_value=100,
        )
    )
    day_spread_weight = _safe_int(
        objective_cfg.get("day_spread", constraints.get("day_spread_weight", 0)),
        default=0,
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
        # Hard constraint per guru per hari DIHAPUS (diganti: hanya soft per guru-mapel ≤6 JP).
        # Guru beda mata pelajaran boleh mengajar lebih dari 8 jam/hari.
        # No-conflict constraint sudah memastikan tidak ada bentrok waktu fisik.
        "max_teacher_daily_hours": 0,
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
        # Slot utama tidak boleh kosong kecuali ada peminatan pada tingkat yang sama.
        # Default: aktif otomatis jika enforce_grade_track_constraints aktif.
        "enforce_utama_slot_coverage": _safe_bool(
            constraints.get("enforce_utama_slot_coverage"),
            bool(requested_grade_track_constraints),
        ),
        # Jumlah optimal peminatan paralel per slot (preferred, bukan batas keras).
        # Jika aktual > preferred → kena soft penalty (mendorong klasterisasi 3 bukan 4).
        "preferred_parallel_elective_subjects": _safe_int(
            constraints.get("preferred_parallel_elective_subjects"),
            default=3,
            min_value=1,
        ),
        # Penalti per kelas peminatan di atas preferred_parallel per slot.
        "elective_excess_soft_penalty": _safe_int(
            constraints.get("elective_excess_soft_penalty"),
            default=5,
            min_value=0,
        ),
        # Penalti per gap (jeda antar blok) dalam satu hari untuk kelas peminatan.
        # Nilai tinggi mendorong CP-SAT menempatkan jp peminatan berurutan tanpa jeda.
        "elective_block_gap_penalty": _safe_int(
            constraints.get("elective_block_gap_penalty"),
            default=20,
            min_value=0,
        ),
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

    # Simpan identitas siswa (nama + NIS) dari raw payload untuk pelaporan konflik
    student_identity_map: dict[int, dict[str, str | None]] = {}
    for raw in raw_student_enrollments:
        sid = _safe_int(raw.get("student_id"), default=0, min_value=0)
        if sid > 0:
            student_identity_map[sid] = {
                "student_name": str(raw["student_name"]) if raw.get("student_name") else None,
                "nis": str(raw["nis"]) if raw.get("nis") else None,
            }
    student_enrollments: list[dict[str, Any]] = []
    for student_id, rombel_ids in student_enrollment_map.items():
        if not rombel_ids:
            continue
        identity = student_identity_map.get(student_id, {})
        student_enrollments.append(
            {
                "student_id": student_id,
                "student_name": identity.get("student_name"),
                "nis": identity.get("nis"),
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


def _build_elective_student_conflict_pairs(
    assignments: list[dict[str, Any]],
    student_enrollments: list[dict[str, Any]],
) -> tuple[frozenset[tuple[int, int]], dict[tuple[int, int], int]]:
    """Bangun set pasangan (a1, a2) assignment PEMINATAN yang berbagi siswa.

    Mengembalikan:
    - frozenset pasangan (aid1, aid2) yang berpotensi bentrok
    - dict bobot {(aid1, aid2): jumlah_siswa_bersama}
      (pasang dengan lebih banyak siswa bersama = penalti lebih tinggi)
    """
    # Step 1: elective rombel → assignment IDs
    elective_rombel_to_assignments: dict[int, list[int]] = defaultdict(list)
    for assignment in assignments:
        if _resolve_assignment_track(assignment) == "elective":
            rombel_id = _safe_int(assignment.get("rombel_id"), default=0, min_value=0)
            if rombel_id > 0:
                elective_rombel_to_assignments[rombel_id].append(assignment["id"])

    if not elective_rombel_to_assignments:
        return frozenset(), {}

    # Step 2: hitung bobot tiap pasang berdasarkan jumlah siswa bersama
    pair_student_count: dict[tuple[int, int], int] = defaultdict(int)
    for enrollment in student_enrollments:
        rombel_ids = enrollment["rombel_ids"]

        # Kumpulkan semua assignment peminatan siswa ini
        student_elective_aids: list[int] = []
        for rombel_id in rombel_ids:
            student_elective_aids.extend(elective_rombel_to_assignments.get(rombel_id, []))

        if len(student_elective_aids) < 2:
            continue

        sorted_aids = sorted(set(student_elective_aids))
        for i in range(len(sorted_aids)):
            for j in range(i + 1, len(sorted_aids)):
                pair_student_count[(sorted_aids[i], sorted_aids[j])] += 1

    return frozenset(pair_student_count.keys()), dict(pair_student_count)


def _report_elective_student_conflicts(
    final_schedule_map: dict[int, tuple[int, ...]],
    assignments: list[dict[str, Any]],
    student_enrollments: list[dict[str, Any]],
    slots_by_id: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Deteksi dan laporkan konflik peminatan siswa pada jadwal final.

    Mengembalikan list konflik per-siswa, masing-masing berisi:
      - student_id, student_name, nis
      - conflicting_pairs: pasangan assignment peminatan yang bentrok di slot yang sama,
        beserta detail slot (hari, jam, label).
    """
    # elective rombel → assignment IDs
    elective_rombel_to_assignments: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for assignment in assignments:
        if _resolve_assignment_track(assignment) == "elective":
            rombel_id = _safe_int(assignment.get("rombel_id"), default=0, min_value=0)
            if rombel_id > 0:
                elective_rombel_to_assignments[rombel_id].append(assignment)

    if not elective_rombel_to_assignments:
        return []

    # Build slot set per assignment (elective only)
    elective_slot_sets: dict[int, set[int]] = {}
    for assignment in assignments:
        if _resolve_assignment_track(assignment) == "elective":
            aid = assignment["id"]
            elective_slot_sets[aid] = set(final_schedule_map.get(aid, ()))

    reports: list[dict[str, Any]] = []

    for enrollment in student_enrollments:
        student_id = enrollment["student_id"]
        student_name = enrollment.get("student_name")
        nis = enrollment.get("nis")
        rombel_ids = enrollment["rombel_ids"]

        # Kumpulkan semua assignment peminatan siswa ini
        student_elective_assignments: list[dict[str, Any]] = []
        for rombel_id in rombel_ids:
            student_elective_assignments.extend(elective_rombel_to_assignments.get(rombel_id, []))

        if len(student_elective_assignments) < 2:
            continue

        # Cek setiap pasangan apakah ada slot yang sama
        conflicting_pairs: list[dict[str, Any]] = []
        sorted_assignments = sorted(student_elective_assignments, key=lambda a: a["id"])
        for i in range(len(sorted_assignments)):
            for j in range(i + 1, len(sorted_assignments)):
                a1 = sorted_assignments[i]
                a2 = sorted_assignments[j]
                aid1, aid2 = a1["id"], a2["id"]
                shared_slots = elective_slot_sets.get(aid1, set()) & elective_slot_sets.get(aid2, set())
                if not shared_slots:
                    continue

                # Format detail slot yang bentrok
                slot_details = []
                for slot_id in sorted(shared_slots):
                    slot = slots_by_id.get(slot_id, {})
                    day_labels = {1: "Senin", 2: "Selasa", 3: "Rabu", 4: "Kamis", 5: "Jumat", 6: "Sabtu"}
                    day = slot.get("day_of_week", 0)
                    slot_details.append({
                        "slot_id": slot_id,
                        "day": day_labels.get(day, f"Hari {day}"),
                        "time": f"{slot.get('start_time', '?')} - {slot.get('end_time', '?')}",
                        "label": slot.get("label"),
                    })

                conflicting_pairs.append({
                    "assignment_id_1": aid1,
                    "rombel_id_1": a1.get("rombel_id"),
                    "assignment_id_2": aid2,
                    "rombel_id_2": a2.get("rombel_id"),
                    "shared_slot_count": len(shared_slots),
                    "slots": slot_details,
                })

        if conflicting_pairs:
            reports.append({
                "student_id": student_id,
                "student_name": student_name,
                "nis": nis,
                "conflict_count": len(conflicting_pairs),
                "conflicting_pairs": conflicting_pairs,
            })

    return reports


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
        # 4, 5, 6 JP: tidak ada pola wajib — bebas ditempatkan di hari manapun.
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
    """Menghitung total slot yang memiliki lebih dari max_parallel_subjects
    assignment peminatan (bukan distinct subject) di grade yang sama.
    """
    if max_parallel_subjects <= 0:
        return 0

    # Hitung TOTAL assignment peminatan per (grade, slot), bukan distinct subjects.
    grade_slot_count: dict[tuple[int, int], int] = defaultdict(int)
    for assignment in assignments:
        assignment_id = assignment["id"]
        grade_level = _safe_int(assignment.get("grade_level"), default=0, min_value=0)
        if grade_level <= 0:
            continue
        track = _resolve_assignment_track(assignment)
        if track != "elective":
            continue
        for slot_id in schedule_map.get(assignment_id, tuple()):
            if slot_id not in slots_by_id:
                continue
            grade_slot_count[(grade_level, slot_id)] += 1

    overlap_units = 0
    for count in grade_slot_count.values():
        overload = count - max_parallel_subjects
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
    elective_conflict_pairs: frozenset[tuple[int, int]] = frozenset(),
    elective_pair_weights: dict[tuple[int, int], int] | None = None,
) -> dict[str, Any]:
    if elective_pair_weights is None:
        elective_pair_weights = {}

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

    # S7: Elective Student Conflict — 1 pasang bentrok = 1 penalty (untuk tampilan UI)
    # GA internal (_evaluate_schedule) tetap pakai weighted penalty agar optimasi tetap agresif.
    elective_student_conflict_pairs_count = 0
    elective_student_conflict_penalty_total = 0
    if elective_conflict_pairs:
        slot_set_by_assignment: dict[int, set[int]] = {
            a["id"]: set(schedule_map.get(a["id"], ()))
            for a in assignments
        }
        for (aid1, aid2) in elective_conflict_pairs:
            shared_slots = slot_set_by_assignment.get(aid1, set()) & slot_set_by_assignment.get(aid2, set())
            if not shared_slots:
                continue
            elective_student_conflict_pairs_count += 1
            # Display: 1 bentrok pasang peminatan = 1 penalty (mudah dibaca)
            # Catatan: GA internal _evaluate_schedule tetap pakai weighted penalty
            #          (300 × bobot × slot) agar tetap agresif mengoptimasi.
            elective_student_conflict_penalty_total += 1

    total_penalty = (
        teacher_subject_penalty_total
        + rombel_subject_penalty_total
        + distribution_pattern_penalty_total
        + distribution_non_consecutive_penalty_total
        + elective_student_conflict_penalty_total
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
        "elective_student_conflict_pairs": elective_student_conflict_pairs_count,
        "elective_student_conflict_penalty": elective_student_conflict_penalty_total,
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
    elective_conflict_pairs: frozenset[tuple[int, int]] = frozenset(),
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

    # Hitung pelanggaran S7: pasangan peminatan yang berbagi siswa dijadwalkan bersamaan
    elective_student_conflict_violations = 0
    if enforce_grade_track_constraints and elective_conflict_pairs:
        slot_set_by_aid: dict[int, set[int]] = {}
        for assignment in assignments:
            aid = assignment["id"]
            slot_set_by_aid[aid] = set(schedule_map.get(aid, ()))
        for (aid1, aid2) in elective_conflict_pairs:
            shared = slot_set_by_aid.get(aid1, set()) & slot_set_by_aid.get(aid2, set())
            elective_student_conflict_violations += len(shared)

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
        "no_elective_student_conflict": (
            elective_student_conflict_violations == 0 if enforce_grade_track_constraints else None
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
            "elective_student_conflict": (
                elective_student_conflict_violations if enforce_grade_track_constraints else None
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
    # Parameter tambahan agar GA mengevaluasi constraint peminatan
    sorted_slot_ids_weekly: list[int] | None = None,
    elective_block_gap_penalty: int = 0,
    preferred_parallel_elective_subjects: int = 0,
    elective_excess_soft_penalty: int = 0,
    elective_conflict_pairs: frozenset[tuple[int, int]] = frozenset(),
    elective_pair_weights: dict[tuple[int, int], int] | None = None,
) -> tuple[int, bool]:
    if elective_pair_weights is None:
        elective_pair_weights = {}
    teacher_busy: set[tuple[int, int]] = set()
    rombel_busy: set[tuple[int, int]] = set()
    student_busy: set[tuple[int, int]] = set()
    grade_slot_track: dict[tuple[int, int], set[str]] = defaultdict(set)
    # Untuk H9 Utama Slot Coverage
    grade_elective_slot_set: dict[int, set[int]] = defaultdict(set)   # grade → set(slot_ids)
    grade_mandatory_rombel_slot: dict[tuple[int, int], set[int]] = defaultdict(set)  # (grade, rombel_id) → set(slot_ids)
    grade_mandatory_rombel_total_jp: dict[tuple[int, int], int] = defaultdict(int)   # (grade, rombel_id) → total JP
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
                # Kumpulkan data untuk H9 check
                if track == "elective":
                    grade_elective_slot_set[grade_level].add(slot_id)
                elif track == "mandatory":
                    gr_rombel_key = (grade_level, rombel_id)
                    grade_mandatory_rombel_slot[gr_rombel_key].add(slot_id)
                    grade_mandatory_rombel_total_jp[gr_rombel_key] += 1

            score += preference_score_map.get((teacher_id, slot_id), 0)
            used_days.add(day_of_week)

        score += day_spread_weight * len(used_days)

    # ===== H9: Utama Slot Coverage Check =====
    # Jika tidak ada peminatan di grade G slot S, setiap rombel utama grade G WAJIB ada JP di slot S.
    # Cek hanya grade yang MEMILIKI peminatan (grade yang tidak punya peminatan → lewati).
    for grade_level, elective_slots in grade_elective_slot_set.items():
        # Cari semua slot yang ada di schedule (dari slots_by_id) tapi TIDAK ada peminatan
        all_known_slots = set(slots_by_id.keys())
        mandatory_slots = all_known_slots - elective_slots  # slot tanpa peminatan di grade ini
        # Untuk setiap rombel utama grade ini: harus ada JP di setiap mandatory_slot
        rombel_ids_in_grade = {
            rombel_id
            for (g, rombel_id) in grade_mandatory_rombel_slot
            if g == grade_level
        }
        for rombel_id in rombel_ids_in_grade:
            gr_rombel_key = (grade_level, rombel_id)
            total_jp = grade_mandatory_rombel_total_jp[gr_rombel_key]
            # Feasibility guard: jika JP rombel < jumlah slot yang-dicakup, skip (sama dgn CP-SAT)
            if total_jp < len(mandatory_slots):
                continue
            covered = grade_mandatory_rombel_slot[gr_rombel_key]
            for slot_id in mandatory_slots:
                if slot_id not in covered:
                    return -1_000_000_000, False  # Jam kosong terdeteksi!

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

    # ---- Elective-aware scoring (agar GA mengevaluasi constraint peminatan) ----

    # 1. Elective tiered pair scoring per day (mirrors CP-SAT objective)
    if elective_block_gap_penalty > 0 and sorted_slot_ids_weekly:
        ps1 = elective_block_gap_penalty // 4    # +5: pairs >= 1
        ps2 = elective_block_gap_penalty // 4    # +5: pairs >= 2
        ps3 = -5 * (elective_block_gap_penalty // 4)  # -25: pairs >= 3
        spen = elective_block_gap_penalty // 4   # 5: no-pair day penalty
        for assignment in assignments:
            assignment_id = assignment["id"]
            track = assignment_track_map.get(assignment_id)
            if track != "elective":
                continue
            weekly_hours_a = _safe_int(assignment.get("weekly_hours"), default=0, min_value=0)
            if weekly_hours_a < 2:
                continue
            slot_ids_a = schedule_map.get(assignment_id, tuple())
            if len(slot_ids_a) < 2:
                continue

            slot_id_set_a = set(slot_ids_a)

            # Count active slots per day and consecutive pairs per day
            by_day_total: dict[int, int] = defaultdict(int)
            by_day_pairs: dict[int, int] = defaultdict(int)
            for sid in slot_ids_a:
                by_day_total[_safe_int(slots_by_id[sid].get("day_of_week"), default=0)] += 1

            for wk_i, wk_sid in enumerate(sorted_slot_ids_weekly):
                if wk_sid not in slot_id_set_a:
                    continue
                if wk_i > 0:
                    prv = sorted_slot_ids_weekly[wk_i - 1]
                    prv_day = _safe_int(slots_by_id[prv].get("day_of_week"), default=-1)
                    cur_day = _safe_int(slots_by_id[wk_sid].get("day_of_week"), default=0)
                    if prv_day == cur_day and prv in slot_id_set_a:
                        by_day_pairs[cur_day] += 1

            for day, total_slots in by_day_total.items():
                pairs = by_day_pairs.get(day, 0)
                # Threshold scoring
                if pairs >= 1:
                    score += ps1   # +5
                if pairs >= 2:
                    score += ps2   # +5 (cumulative: +10 for 3-block)
                if pairs >= 3:
                    score += ps3   # -25 (cumulative: -15 for 4-block or 5-block)
                # No-pair penalty: day active but 0 consecutive pairs
                if pairs == 0:
                    score -= spen  # -5
                # Within-day gap penalty
                if total_slots >= 2:
                    extra_gaps = max(0, total_slots - 1 - pairs)
                    score -= elective_block_gap_penalty * extra_gaps

            # Days-over penalty: penalti jika tersebar ke > 2 hari
            # Contoh: 2+2+1 (3 hari) → +5 - 15 = -10
            if weekly_hours_a > 2:
                days_over_target = elective_block_gap_penalty * 3 // 4  # 15
                n_active_days = len(by_day_total)
                days_over = max(0, n_active_days - 2)
                score -= days_over_target * days_over

    # 1b. Hard enforcement elective: max 2 hari aktif + blok konsekutif per hari
    # Individu GA yang melanggar ini langsung DIBUANG (infeasible) agar GA tidak
    # menerima solusi yang tidak konsisten dengan hard constraint CP-SAT.
    if sorted_slot_ids_weekly:
        slot_day_lookup: dict[int, int] = {
            sid: _safe_int(slots_by_id[sid].get("day_of_week"), default=0)
            for sid in slots_by_id
        }
        # Bangun urutan slot per hari (berurutan sesuai waktu) untuk cek consecutive
        slots_sorted_by_day: dict[int, list[int]] = defaultdict(list)
        for sid in sorted_slot_ids_weekly:
            d = slot_day_lookup.get(sid, 0)
            if d > 0:
                slots_sorted_by_day[d].append(sid)

        for assignment in assignments:
            assignment_id = assignment["id"]
            track = assignment_track_map.get(assignment_id)
            if track != "elective":
                continue
            weekly_hours_check = assignment.get("weekly_hours", 0)
            if (weekly_hours_check or 0) < 4:
                continue
            slot_ids_a = set(schedule_map.get(assignment_id, ()))
            if not slot_ids_a:
                continue

            by_day_check: dict[int, list[int]] = defaultdict(list)
            for sid in slot_ids_a:
                d = slot_day_lookup.get(sid, 0)
                if d > 0:
                    by_day_check[d].append(sid)

            # Hard: max 2 hari aktif
            if len(by_day_check) > 2:
                return -1_000_000_000, False

            # Hard: setiap hari harus berurutan (tidak ada celah)
            for day, day_sids in by_day_check.items():
                ordered = [s for s in slots_sorted_by_day[day] if s in slot_ids_a]
                if len(ordered) < 2:
                    continue
                for k in range(len(ordered) - 1):
                    cur_pos = slots_sorted_by_day[day].index(ordered[k])
                    nxt_pos = slots_sorted_by_day[day].index(ordered[k + 1])
                    if nxt_pos != cur_pos + 1:
                        return -1_000_000_000, False  # ada celah → infeasible

    # 2. Peminatan parallel excess soft penalty (preferred < max hard)
    if elective_excess_soft_penalty > 0 and preferred_parallel_elective_subjects > 0:
        grade_slot_count: dict[tuple[int, int], int] = defaultdict(int)
        for assignment in assignments:
            assignment_id = assignment["id"]
            grade_level = assignment_grade_map.get(assignment_id, 0)
            if grade_level <= 0:
                continue
            if assignment_track_map.get(assignment_id) != "elective":
                continue
            for sid in schedule_map.get(assignment_id, tuple()):
                grade_slot_count[(grade_level, sid)] += 1
        for cnt in grade_slot_count.values():
            excess = cnt - preferred_parallel_elective_subjects
            if excess > 0:
                score -= elective_excess_soft_penalty * excess
    # 3. S7: Elective vs Elective Student Conflict — weighted soft penalty
    # Penalti per slot yang bertabrakan, dikalikan bobot (jumlah siswa bersama).
    # Pasangan dengan lebih banyak siswa bersama mendapat penalti lebih tinggi
    # sehingga GA memprioritaskan pemisahan kelas yang paling berdampak.
    BASE_ELECTIVE_CONFLICT_PENALTY = 300
    if elective_conflict_pairs:
        slot_set_by_assignment: dict[int, set[int]] = {
            a["id"]: set(schedule_map.get(a["id"], ()))
            for a in assignments
        }
        for (aid1, aid2) in elective_conflict_pairs:
            shared_slots = slot_set_by_assignment.get(aid1, set()) & slot_set_by_assignment.get(aid2, set())
            if not shared_slots:
                continue
            # Bobot berdasarkan jumlah siswa yang terpengaruh (dari elective_pair_weights)
            weight = elective_pair_weights.get((aid1, aid2), elective_pair_weights.get((aid2, aid1), 1))
            score -= BASE_ELECTIVE_CONFLICT_PENALTY * weight * len(shared_slots)

    return score, True


def _solve_cp_sat(
    assignments: list[dict[str, Any]],
    slots: list[dict[str, Any]],
    preference_score_map: dict[tuple[int, int], int],
    student_assignment_map: dict[int, tuple[int, ...]],
    grade_track_map: dict[int, dict[str, tuple[int, ...]]],
    config: dict[str, Any],
    seed_schedule_map: dict[int, tuple[int, ...]] | None = None,
    elective_conflict_pairs: frozenset[tuple[int, int]] = frozenset(),
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
                # Grade track aktif: 4-6 JP dijadikan soft constraint via penalty + repair.
                # 2-3 JP tetap hard constraint karena tidak menyebabkan konflik dengan grade track.
                continue
            _add_block_distribution_constraints(
                model=model,
                assignment_id=assignment_id,
                weekly_hours=weekly_hours,
                slots_by_day=slots_by_day,
                x=x,
            )

    # ======= ELECTIVE CONSECUTIVE + MAX 2 DAYS CONSTRAINT ====================
    # Untuk mata pelajaran peminatan (≥ 4 JP/minggu), terapkan dua aturan ketat:
    #   1. Maksimal 2 hari aktif per minggu  (tidak tersebar lebih dari 2 hari)
    #   2. Setiap hari aktif: slot harus berurutan tanpa celah (blok konsekutif)
    # Contoh ideal untuk 5 JP: 3+2 atau 2+3 pada 2 hari berbeda.
    # Alasan: guru peminatan lebih efisien masuk 2 hari blok daripada 5 hari × 1 JP.
    # Hanya aktif saat enforce_grade_track_constraints = True (ada peminatan).
    # ==========================================================================
    if enforce_grade_track_constraints:
        for assignment in assignments:
            assignment_id = assignment["id"]
            track = _resolve_assignment_track(assignment)
            if track != "elective":
                continue
            weekly_hours = _safe_int(assignment.get("weekly_hours"), default=0, min_value=0)
            if weekly_hours < 4:
                continue  # < 4 JP tidak perlu aturan ini

            day_active_vars_elec: list[cp_model.IntVar] = []

            for day, day_slot_ids in slots_by_day.items():
                if not day_slot_ids:
                    continue

                day_sum_elec = sum(x[(assignment_id, sid)] for sid in day_slot_ids)
                day_active_elec = model.NewBoolVar(f"elec_blk_act_a{assignment_id}_d{day}")
                model.Add(day_sum_elec >= 1).OnlyEnforceIf(day_active_elec)
                model.Add(day_sum_elec == 0).OnlyEnforceIf(day_active_elec.Not())
                day_active_vars_elec.append(day_active_elec)

                # Hard: setiap slot pada hari ini harus berurutan (max 1 blok/hari)
                # Teknik start-of-block: start_var = 1 iff slot[i]=1 AND slot[i-1]=0
                start_vars_elec: list[cp_model.IntVar] = []
                for idx, sid in enumerate(day_slot_ids):
                    sv = model.NewBoolVar(f"elec_blk_sv_a{assignment_id}_d{day}_i{idx}")
                    if idx == 0:
                        model.Add(sv == x[(assignment_id, sid)])
                    else:
                        prev_sid = day_slot_ids[idx - 1]
                        model.Add(sv <= x[(assignment_id, sid)])
                        model.Add(sv <= 1 - x[(assignment_id, prev_sid)])
                        model.Add(sv >= x[(assignment_id, sid)] - x[(assignment_id, prev_sid)])
                    start_vars_elec.append(sv)

                blk_cnt = model.NewIntVar(0, len(day_slot_ids), f"elec_blk_cnt_a{assignment_id}_d{day}")
                model.Add(blk_cnt == sum(start_vars_elec))
                # Maksimal 1 blok berurutan per hari (tanpa gap)
                model.Add(blk_cnt <= 1)

            # Hard: maksimal 2 hari aktif per minggu
            if day_active_vars_elec:
                total_active_days_elec = model.NewIntVar(
                    0, len(day_active_vars_elec), f"elec_blk_days_a{assignment_id}"
                )
                model.Add(total_active_days_elec == sum(day_active_vars_elec))
                model.Add(total_active_days_elec <= 2)

    # grade_slot_elective_active_map: menyimpan elective_active variable per grade per slot
    # untuk digunakan kembali pada constraint utama slot coverage di bawah.
    grade_slot_elective_active_map: dict[int, dict[int, cp_model.IntVar]] = defaultdict(dict)

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

                # Simpan elective_active untuk digunakan di utama slot coverage.
                grade_slot_elective_active_map[grade_level][slot_id] = elective_active

            # Batasi TOTAL assignment peminatan per slot (bukan distinct subject).
            # Sebelumnya menggunakan distinct subject_id — ini tidak akurat jika
            # ada 2 rombel peminatan yang mapelnya sama (misal Biologi TKL + Biologi MP2).
            if elective_ids and max_parallel_elective_subjects > 0:
                elective_total = sum(x[(aid, slot_id)] for aid in elective_ids)
                if len(elective_ids) > max_parallel_elective_subjects:
                    model.Add(elective_total <= max_parallel_elective_subjects)

    # ======= UTAMA SLOT COVERAGE CONSTRAINT ==============================
    # Aturan: jika tidak ada kelas peminatan pada grade X di slot S,
    # maka SETIAP rombel utama grade X harus memiliki mata pelajaran di slot S.
    # Ini menghilangkan "jam kosong" pada kelas utama di luar waktu peminatan.
    #
    # Logika:
    #   rombel_occupied[R][S] + elective_active[X][S] >= 1
    #   → Ketika elective_active = 0 (tidak ada peminatan): rombel_occupied harus 1
    #   → Ketika elective_active = 1 (ada peminatan)    : trivially satisfied (rombel wajib kosong anyway)
    # ======================================================================
    enforce_utama_slot_coverage = _safe_bool(
        config.get("enforce_utama_slot_coverage"),
        False,
    )
    if enforce_utama_slot_coverage and grade_slot_elective_active_map:
        # Kumpulkan assignment utama per rombel per grade.
        mandatory_by_rombel_per_grade: dict[int, dict[int, list[int]]] = defaultdict(lambda: defaultdict(list))
        for grade_level, bucket in grade_track_map.items():
            for aid in bucket.get("mandatory", tuple()):
                a_obj = assignments_by_id.get(aid)
                if not a_obj:
                    continue
                rombel_id = _safe_int(a_obj.get("rombel_id"), default=0, min_value=0)
                if rombel_id > 0:
                    mandatory_by_rombel_per_grade[grade_level][rombel_id].append(aid)

        for grade_level, rombel_map in mandatory_by_rombel_per_grade.items():
            elective_active_by_slot = grade_slot_elective_active_map.get(grade_level, {})
            if not elective_active_by_slot:
                continue  # grade ini tidak punya peminatan, lewati

            total_slots = len(elective_active_by_slot)

            for rombel_id, rombel_aid_list in rombel_map.items():
                # Guard feasibility: total JP rombel harus >= jumlah slot yang dikelola constraint ini.
                # Jika kurang, constraint ini tidak mungkin dipenuhi → lewati rombel ini.
                total_rombel_jp = sum(
                    _safe_int(assignments_by_id.get(aid, {}).get("weekly_hours"), default=0, min_value=0)
                    for aid in rombel_aid_list
                )
                if total_rombel_jp < total_slots:
                    # JP rombel tidak cukup untuk mengisi semua slot coverage → skip.
                    continue

                for slot_id, elective_active in elective_active_by_slot.items():
                    rombel_sum = sum(x[(aid, slot_id)] for aid in rombel_aid_list)
                    # rombel_sum + elective_active >= 1:
                    # Ketika tidak ada peminatan (elective_active=0) → rombel harus terisi
                    model.Add(rombel_sum + elective_active >= 1)

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

    # ======= ELECTIVE SPLIT & WITHIN-DAY CONSECUTIVE PENALTY ================
    # Aturan baru:
    #   ≤ 2 JP → cukup 1 hari (jika nyasar ke 2 hari = penalti)
    #   > 2 JP → ideal 2 hari terpisah (beda hari DIANJURKAN untuk variasi)
    #           setiap hari sebaiknya memiliki blok berurutan (tanpa gap).
    #
    # Contoh 4 JP:
    #   Mon jp3+jp4 + Wed jp1+jp2  → 2 hari, masing-masing berurutan ✓  (ideal)
    #   Mon jp3+jp4+jp5+jp6        → 1 hari, berurutan, TAPI terlalu padat ✗
    #   Mon jp3+jp5 + Tue jp1+jp2  → 2 hari, tapi Mon ada gap (jp3 dan jp5) ✗
    # ======================================================================
    elective_block_gap_penalty = _safe_int(
        config.get("elective_block_gap_penalty"), default=20, min_value=0
    )
    if elective_block_gap_penalty > 0 and enforce_grade_track_constraints:
        for assignment in assignments:
            assignment_id = assignment["id"]
            track = _resolve_assignment_track(assignment)
            if track != "elective":
                continue
            weekly_hours = _safe_int(assignment.get("weekly_hours"), default=0, min_value=0)
            if weekly_hours < 2:
                continue

            # --- Scoring Peminatan Per Hari (Tiered Threshold) ---
            # Scoring pola blok konsekutif pada SATU hari:
            #   pairs >= 1 (+5): ada minimal 1 pasang berurutan  → blok >= 2
            #   pairs >= 2 (+5): ada minimal 2 pasang berurutan  → blok >= 3
            #   pairs >= 3 (-25): ada minimal 3 pasang berurutan → blok >= 4 (TERLALU PADAT)
            #   0 pairs tapi hari aktif (-5): slot terisolasi
            # Hasil per pola (5 JP):
            #   3+2  → (+10)+( +5)          = +15  ← ideal
            #   2+2+1→ ( +5)+( +5)+(  -5)   = +5
            #   5+0  → (+5+5-25)             = -15
            #   4+1  → (+5+5-25)+(    -5)   = -20
            # Day-count tidak diperhitungkan → scoring organik sudah cukup.
            ps1 = elective_block_gap_penalty // 4   # +5
            ps2 = elective_block_gap_penalty // 4   # +5
            ps3 = -5 * (elective_block_gap_penalty // 4)  # -25
            spen = elective_block_gap_penalty // 4  # -5

            for day, day_slot_ids in slots_by_day.items():
                if not day_slot_ids:
                    continue
                day_count_var = model.NewIntVar(
                    0, len(day_slot_ids), f"elec_dc_a{assignment_id}_d{day}"
                )
                model.Add(day_count_var == sum(x[(assignment_id, sid)] for sid in day_slot_ids))

                # Build consecutive pair BoolVars
                pair_active_vars: list[cp_model.IntVar] = []
                for idx in range(len(day_slot_ids) - 1):
                    sid1 = day_slot_ids[idx]
                    sid2 = day_slot_ids[idx + 1]
                    pv = model.NewBoolVar(f"elec_pv_a{assignment_id}_d{day}_i{idx}")
                    model.Add(pv <= x[(assignment_id, sid1)])
                    model.Add(pv <= x[(assignment_id, sid2)])
                    model.Add(pv >= x[(assignment_id, sid1)] + x[(assignment_id, sid2)] - 1)
                    pair_active_vars.append(pv)

                # pairs_count_d
                n_max_pairs = len(pair_active_vars)
                pairs_count_d = model.NewIntVar(0, max(n_max_pairs, 1), f"elec_pc_a{assignment_id}_d{day}")
                if pair_active_vars:
                    model.Add(pairs_count_d == sum(pair_active_vars))
                else:
                    model.Add(pairs_count_d == 0)

                # Threshold pair indicators: pairs >= k
                for k, score_k in [(1, ps1), (2, ps2), (3, ps3)]:
                    if k > n_max_pairs:
                        break
                    pk = model.NewBoolVar(f"elec_pk_a{assignment_id}_d{day}_k{k}")
                    model.Add(pairs_count_d >= k).OnlyEnforceIf(pk)
                    model.Add(pairs_count_d <= k - 1).OnlyEnforceIf(pk.Not())
                    objective_terms.append(score_k * pk)

                # No-pair active day penalty (singleton or non-consecutive → -5)
                is_day_active = model.NewBoolVar(f"elec_da1_a{assignment_id}_d{day}")
                model.Add(day_count_var >= 1).OnlyEnforceIf(is_day_active)
                model.Add(day_count_var == 0).OnlyEnforceIf(is_day_active.Not())
                if pair_active_vars:
                    has_pair = model.NewBoolVar(f"elec_hp_a{assignment_id}_d{day}")
                    model.AddBoolOr(pair_active_vars).OnlyEnforceIf(has_pair)
                    model.AddBoolAnd([pv.Not() for pv in pair_active_vars]).OnlyEnforceIf(has_pair.Not())
                    npa = model.NewBoolVar(f"elec_npa_a{assignment_id}_d{day}")
                    model.Add(npa <= is_day_active)
                    model.Add(npa <= 1 - has_pair)
                    model.Add(npa >= is_day_active - has_pair)
                    objective_terms.append(-spen * npa)
                else:
                    objective_terms.append(-spen * is_day_active)

                # Within-day gap penalty
                if pair_active_vars and elective_block_gap_penalty > 0:
                    extra_gaps = model.NewIntVar(0, len(day_slot_ids), f"elec_eg_a{assignment_id}_d{day}")
                    model.Add(extra_gaps >= day_count_var - 1 - pairs_count_d)
                    model.Add(extra_gaps >= 0)
                    objective_terms.append(-elective_block_gap_penalty * extra_gaps)

            # Days-over penalty: penalti jika peminatan tersebar ke > 2 hari
            # (tidak berlaku jika terlalu sedikit hari — 1 hari sudah ditangani oleh scoring blok)
            # Contoh: 2+2+1 = 3 hari → +5 - 15 = -10
            days_over_target_penalty = elective_block_gap_penalty * 3 // 4  # default 15
            target_days_dop = 2  # hanya untuk peminatan > 2 JP
            if days_over_target_penalty > 0 and weekly_hours > 2:
                day_active_dop: list[cp_model.IntVar] = []
                for day, day_slot_ids in slots_by_day.items():
                    da_dop = model.NewBoolVar(f"elec_dadop_a{assignment_id}_d{day}")
                    dsum_dop = sum(x[(assignment_id, sid)] for sid in day_slot_ids)
                    model.Add(dsum_dop >= 1).OnlyEnforceIf(da_dop)
                    model.Add(dsum_dop == 0).OnlyEnforceIf(da_dop.Not())
                    day_active_dop.append(da_dop)
                n_days_dop = model.NewIntVar(0, len(day_active_dop), f"elec_ndop_a{assignment_id}")
                model.Add(n_days_dop == sum(day_active_dop))
                dop = model.NewIntVar(0, len(day_active_dop), f"elec_dop_a{assignment_id}")
                model.Add(dop >= n_days_dop - target_days_dop)
                model.Add(dop >= 0)
                objective_terms.append(-days_over_target_penalty * dop)

    # Soft preference: dorong klasterisasi peminatan di ≤ preferred_parallel per slot.
    # Penalti per assignment peminatan melebihi preferred (membuat 3 lebih baik dari 4).
    preferred_parallel_elective = _safe_int(
        config.get("preferred_parallel_elective_subjects"), default=3, min_value=1
    )
    elective_excess_penalty = _safe_int(
        config.get("elective_excess_soft_penalty"), default=5, min_value=0
    )
    if elective_excess_penalty > 0 and enforce_grade_track_constraints:
        for grade_level, bucket in grade_track_map.items():
            elective_ids_grade = bucket.get("elective", tuple())
            if len(elective_ids_grade) <= preferred_parallel_elective:
                continue  # tidak mungkin melebihi preferred → lewati
            for slot_id in slot_ids:
                elective_count_expr = sum(x[(aid, slot_id)] for aid in elective_ids_grade)
                max_excess = len(elective_ids_grade) - preferred_parallel_elective
                excess = model.NewIntVar(
                    0,
                    max_excess,
                    f"elective_excess_g{grade_level}_s{slot_id}",
                )
                model.Add(excess >= elective_count_expr - preferred_parallel_elective)
                model.Add(excess >= 0)
                objective_terms.append(-elective_excess_penalty * excess)

    if objective_terms:
        model.Maximize(sum(objective_terms))
    else:
        model.Maximize(0)

    # S7 (Elective Student Conflict) TIDAK dimasukkan ke CP-SAT objective.
    # Alasan: formulasi dengan has_conflict BoolVars menambah 20.000+ constraint,
    # membuat CP-SAT sangat lambat dan memicu rescue loop yang panjang.
    # S7 ditangani sepenuhnya oleh GA evaluator + repair + Phase 2.

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
    sorted_slot_ids_weekly: list[int] | None = None,
    elective_block_gap_penalty: int = 0,
    preferred_parallel_elective_subjects: int = 0,
    elective_excess_soft_penalty: int = 0,
    elective_conflict_pairs: frozenset[tuple[int, int]] = frozenset(),
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
        sorted_slot_ids_weekly=sorted_slot_ids_weekly,
        elective_block_gap_penalty=elective_block_gap_penalty,
        preferred_parallel_elective_subjects=preferred_parallel_elective_subjects,
        elective_excess_soft_penalty=elective_excess_soft_penalty,
        elective_conflict_pairs=elective_conflict_pairs,
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
                    sorted_slot_ids_weekly=sorted_slot_ids_weekly,
                    elective_block_gap_penalty=elective_block_gap_penalty,
                    preferred_parallel_elective_subjects=preferred_parallel_elective_subjects,
                    elective_excess_soft_penalty=elective_excess_soft_penalty,
                    elective_conflict_pairs=elective_conflict_pairs,
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
                sorted_slot_ids_weekly=sorted_slot_ids_weekly,
                elective_block_gap_penalty=elective_block_gap_penalty,
                preferred_parallel_elective_subjects=preferred_parallel_elective_subjects,
                elective_excess_soft_penalty=elective_excess_soft_penalty,
                elective_conflict_pairs=elective_conflict_pairs,
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
    sorted_slot_ids_weekly: list[int] | None = None,
    elective_block_gap_penalty: int = 0,
    preferred_parallel_elective_subjects: int = 0,
    elective_excess_soft_penalty: int = 0,
    elective_conflict_pairs: frozenset[tuple[int, int]] = frozenset(),
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
            sorted_slot_ids_weekly=sorted_slot_ids_weekly,
            elective_block_gap_penalty=elective_block_gap_penalty,
            preferred_parallel_elective_subjects=preferred_parallel_elective_subjects,
            elective_excess_soft_penalty=elective_excess_soft_penalty,
        )
        if feasible:
            child = trial

    return child


def _repair_elective_student_conflicts(
    schedule_map: dict[int, tuple[int, ...]],
    assignments: list[dict[str, Any]],
    slots_by_id: dict[int, dict[str, Any]],
    elective_conflict_pairs: frozenset[tuple[int, int]],
    slot_ids: list[int],
    max_passes: int = 3,
    elective_pair_weights: dict[tuple[int, int], int] | None = None,
) -> tuple[dict[int, tuple[int, ...]], int]:
    """Greedy S7 repair: untuk setiap pasang peminatan yang berbagi slot,
    coba pindahkan salah satu ke slot lain yang tidak bentrok.
    Pasangan dengan lebih banyak siswa diprioritaskan lebih dulu.
    Mengembalikan (jadwal_baru, jumlah_pelanggaran_sisa)."""
    if not elective_conflict_pairs:
        return schedule_map, 0

    if elective_pair_weights is None:
        elective_pair_weights = {}

    assignments_by_id = {a["id"]: a for a in assignments}

    # Bangun indeks busy per guru & rombel untuk validasi cepat
    teacher_busy: dict[int, set[int]] = defaultdict(set)
    rombel_busy: dict[int, set[int]] = defaultdict(set)
    for assignment in assignments:
        aid = assignment["id"]
        for slot_id in schedule_map.get(aid, ()):
            teacher_busy[assignment["teacher_id"]].add(slot_id)
            rombel_busy[assignment["rombel_id"]].add(slot_id)

    result = _clone_schedule_map(schedule_map)
    all_slot_ids_set = set(slot_ids)

    # Urut pasangan berdasarkan bobot siswa: pasang paling berdampak duluan
    sorted_pairs = sorted(
        elective_conflict_pairs,
        key=lambda p: elective_pair_weights.get(p, elective_pair_weights.get((p[1], p[0]), 1)),
        reverse=True,
    )

    for _pass in range(max_passes):
        improved = False
        for (aid1, aid2) in sorted_pairs:
            slots1 = set(result.get(aid1, ()))
            slots2 = set(result.get(aid2, ()))
            shared = slots1 & slots2
            if not shared:
                continue

            a2 = assignments_by_id.get(aid2)
            if not a2:
                continue
            teacher_id2 = a2["teacher_id"]
            rombel_id2 = a2["rombel_id"]

            for conflict_slot in sorted(shared):
                # Slot kandidat: tidak dipakai a2, tidak ada di slots1, guru & rombel bebas
                candidates = [
                    s for s in all_slot_ids_set
                    if s not in slots2
                    and s not in slots1
                    and s not in teacher_busy[teacher_id2]
                    and s not in rombel_busy[rombel_id2]
                    # Validasi day_of_week jika tersedia
                    and slots_by_id.get(s, {}).get("day_of_week", 0) in range(1, 7)
                ]
                if not candidates:
                    continue

                new_slot = candidates[0]  # ambil yang pertama (greedy)

                # Pindahkan slot
                new_slots2 = (slots2 - {conflict_slot}) | {new_slot}
                result[aid2] = tuple(sorted(new_slots2))

                # Update indeks
                teacher_busy[teacher_id2].discard(conflict_slot)
                teacher_busy[teacher_id2].add(new_slot)
                rombel_busy[rombel_id2].discard(conflict_slot)
                rombel_busy[rombel_id2].add(new_slot)

                slots2 = new_slots2
                improved = True

        if not improved:
            break

    # Hitung sisa pelanggaran
    remaining = 0
    for (aid1, aid2) in elective_conflict_pairs:
        shared = set(result.get(aid1, ())) & set(result.get(aid2, ()))
        remaining += len(shared)

    return result, remaining


def _solve_elective_phase2(
    elective_assignments: list[dict[str, Any]],
    current_schedule_map: dict[int, tuple[int, ...]],
    all_assignments: list[dict[str, Any]],
    slots: list[dict[str, Any]],
    elective_conflict_pairs: frozenset[tuple[int, int]],
    assignment_grade_map: dict[int, int],
    assignment_track_map: dict[int, str],
    max_parallel_elective_subjects: int,
    solver_seconds: float = 90.0,
    random_seed: int = 42,
    solver_workers: int = 8,
) -> tuple[dict[int, tuple[int, ...]] | None, list[dict[str, Any]]]:
    """Phase 2: Re-solve HANYA assignment peminatan dengan S7 sebagai hard constraint.
    Submasalah jauh lebih kecil (50-150 assignment vs ratusan total) sehingga feasible
    diselesaikan dalam hitungan detik oleh CP-SAT.
    Mandatory assignments tetap pada posisi awal (tidak diubah).
    """
    if not elective_assignments:
        return None, []

    slot_ids = [s["id"] for s in slots]
    slots_by_id = {s["id"]: s for s in slots}
    elective_ids_set = {a["id"] for a in elective_assignments}

    # === Bangun peta "slot sibuk" dari assignment NON-elective (mandatory/fixed) ===
    teacher_busy_slots: dict[int, set[int]] = defaultdict(set)
    rombel_busy_slots: dict[int, set[int]] = defaultdict(set)
    grade_mandatory_slots: dict[int, set[int]] = defaultdict(set)

    for assignment in all_assignments:
        aid = assignment["id"]
        track = assignment_track_map.get(aid)
        if track == "elective":
            continue  # elective akan di-re-solve
        grade_level = assignment_grade_map.get(aid, 0)
        for sid in current_schedule_map.get(aid, ()):
            teacher_busy_slots[assignment["teacher_id"]].add(sid)
            rombel_busy_slots[assignment["rombel_id"]].add(sid)
            if grade_level > 0:
                grade_mandatory_slots[grade_level].add(sid)

    # === Bangun CP-SAT model untuk elective saja ===
    model = cp_model.CpModel()
    x: dict[tuple[int, int], Any] = {}

    for assignment in elective_assignments:
        aid = assignment["id"]
        teacher_id = assignment["teacher_id"]
        rombel_id = assignment["rombel_id"]
        weekly_hours = assignment["weekly_hours"]
        grade_level = assignment_grade_map.get(aid, 0)

        available = [
            sid for sid in slot_ids
            if sid not in teacher_busy_slots[teacher_id]
            and sid not in rombel_busy_slots[rombel_id]
            and (grade_level <= 0 or sid not in grade_mandatory_slots[grade_level])
            and slots_by_id.get(sid, {}).get("day_of_week", 0) in range(1, 7)
        ]

        if len(available) < weekly_hours:
            # Tidak cukup slot — phase 2 tidak feasible untuk assignment ini
            return None, [_issue(
                "ELECTIVE_PHASE2_INFEASIBLE",
                f"Phase 2 gagal: assignment {aid} hanya punya {len(available)} slot tersedia, butuh {weekly_hours}",
                {"assignment_id": aid, "available": len(available), "needed": weekly_hours},
            )]

        for sid in available:
            x[(aid, sid)] = model.NewBoolVar(f"ep2_{aid}_{sid}")

        model.Add(sum(x[(aid, sid)] for sid in available if (aid, sid) in x) == weekly_hours)

    # Hard: tidak ada dua elective yang sama guru di slot yang sama
    teacher_slot_vars: dict[tuple[int, int], list[Any]] = defaultdict(list)
    rombel_slot_vars: dict[tuple[int, int], list[Any]] = defaultdict(list)
    grade_slot_vars: dict[tuple[int, int], list[Any]] = defaultdict(list)

    for assignment in elective_assignments:
        aid = assignment["id"]
        grade_level = assignment_grade_map.get(aid, 0)
        for sid in slot_ids:
            if (aid, sid) not in x:
                continue
            teacher_slot_vars[(assignment["teacher_id"], sid)].append(x[(aid, sid)])
            rombel_slot_vars[(assignment["rombel_id"], sid)].append(x[(aid, sid)])
            if grade_level > 0:
                grade_slot_vars[(grade_level, sid)].append(x[(aid, sid)])

    for vlist in teacher_slot_vars.values():
        if len(vlist) > 1:
            model.Add(sum(vlist) <= 1)
    for vlist in rombel_slot_vars.values():
        if len(vlist) > 1:
            model.Add(sum(vlist) <= 1)
    for vlist in grade_slot_vars.values():
        if len(vlist) > max_parallel_elective_subjects:
            model.Add(sum(vlist) <= max_parallel_elective_subjects)

    # Hard S7: pasangan elective yang berbagi siswa TIDAK BOLEH dijadwalkan bersama
    for (aid1, aid2) in elective_conflict_pairs:
        if aid1 not in elective_ids_set or aid2 not in elective_ids_set:
            continue
        for sid in slot_ids:
            if (aid1, sid) not in x or (aid2, sid) not in x:
                continue
            model.Add(x[(aid1, sid)] + x[(aid2, sid)] <= 1)

    # Objective: cocokkan sebisa mungkin dengan jadwal lama (gunakan hint)
    for assignment in elective_assignments:
        aid = assignment["id"]
        old_slots = set(current_schedule_map.get(aid, ()))
        for sid in slot_ids:
            if (aid, sid) in x:
                model.AddHint(x[(aid, sid)], 1 if sid in old_slots else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(solver_seconds)
    solver.parameters.num_search_workers = int(solver_workers)
    solver.parameters.random_seed = int(random_seed + 999)

    status = solver.Solve(model)

    if status not in {cp_model.OPTIMAL, cp_model.FEASIBLE}:
        return None, [_issue(
            "ELECTIVE_PHASE2_FAILED",
            "Phase 2 tidak menemukan jadwal peminatan bebas-bentrok dalam batas waktu",
            {"status": solver.StatusName(status), "solver_seconds": solver_seconds,
             "wall_time": solver.WallTime()},
        )]

    new_elective: dict[int, tuple[int, ...]] = {}
    for assignment in elective_assignments:
        aid = assignment["id"]
        chosen = tuple(sorted(
            sid for sid in slot_ids
            if (aid, sid) in x and solver.BooleanValue(x[(aid, sid)])
        ))
        new_elective[aid] = chosen

    return new_elective, [_issue(
        "ELECTIVE_PHASE2_SUCCESS",
        "Phase 2 berhasil menjadwalkan ulang peminatan tanpa bentrok siswa",
        {"status": solver.StatusName(status), "wall_time": round(solver.WallTime(), 2),
         "elective_count": len(elective_assignments)},
    )]


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
    # Elective-aware params agar GA mengevaluasi constraint peminatan
    elective_block_gap_penalty: int = 0,
    preferred_parallel_elective_subjects: int = 0,
    elective_excess_soft_penalty: int = 0,
    elective_conflict_pairs: frozenset[tuple[int, int]] = frozenset(),
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

    # Urutkan slot secara global (weekly) sekali untuk scoring elective gap di GA
    sorted_slot_ids_weekly: list[int] = sorted(
        slot_ids,
        key=lambda sid: (
            _safe_int(slots_by_id[sid].get("day_of_week"), default=0),
            _safe_int(slots_by_id[sid].get("start_seconds"), default=0),
        ),
    )
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
                sorted_slot_ids_weekly=sorted_slot_ids_weekly,
                elective_block_gap_penalty=elective_block_gap_penalty,
                preferred_parallel_elective_subjects=preferred_parallel_elective_subjects,
                elective_excess_soft_penalty=elective_excess_soft_penalty,
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
                sorted_slot_ids_weekly=sorted_slot_ids_weekly,
                elective_block_gap_penalty=elective_block_gap_penalty,
                preferred_parallel_elective_subjects=preferred_parallel_elective_subjects,
                elective_excess_soft_penalty=elective_excess_soft_penalty,
                elective_conflict_pairs=elective_conflict_pairs,
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

        # Setelah menemukan kandidat terbaik, jalankan S7 repair greedy untuk langsung
        # memperbaiki pelanggaran bentrok siswa peminatan yang tersisa.
        if elective_conflict_pairs:
            repaired_s7, remaining_s7 = _repair_elective_student_conflicts(
                schedule_map=best_schedule,
                assignments=assignments,
                slots_by_id=slots_by_id,
                elective_conflict_pairs=elective_conflict_pairs,
                slot_ids=slot_ids,
                max_passes=3,
            )
            if remaining_s7 == 0 or True:  # selalu pertimbangkan hasil repair
                repair_score, repair_feasible = _evaluate_schedule(
                    repaired_s7,
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
                    elective_conflict_pairs=elective_conflict_pairs,
                )
                if repair_feasible and repair_score > best_score:
                    best_score = repair_score
                    best_schedule = repaired_s7

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
                    sorted_slot_ids_weekly=sorted_slot_ids_weekly,
                    elective_block_gap_penalty=elective_block_gap_penalty,
                    preferred_parallel_elective_subjects=preferred_parallel_elective_subjects,
                    elective_excess_soft_penalty=elective_excess_soft_penalty,
                    elective_conflict_pairs=elective_conflict_pairs,
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
                    sorted_slot_ids_weekly=sorted_slot_ids_weekly,
                    elective_block_gap_penalty=elective_block_gap_penalty,
                    preferred_parallel_elective_subjects=preferred_parallel_elective_subjects,
                    elective_excess_soft_penalty=elective_excess_soft_penalty,
                    elective_conflict_pairs=elective_conflict_pairs,
                )

            next_population.append(child)

        population = next_population

    # Satu kali final S7 repair pada hasil terbaik
    if elective_conflict_pairs:
        final_repaired, _ = _repair_elective_student_conflicts(
            schedule_map=best_schedule,
            assignments=assignments,
            slots_by_id=slots_by_id,
            elective_conflict_pairs=elective_conflict_pairs,
            slot_ids=slot_ids,
            max_passes=5,
        )
        final_repair_score, final_repair_feasible = _evaluate_schedule(
            final_repaired,
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
            elective_conflict_pairs=elective_conflict_pairs,
        )
        if final_repair_feasible and final_repair_score > best_score:
            best_schedule = final_repaired
            best_score = final_repair_score

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

    # S7: Pasangan assignment peminatan yang berbagi siswa (student enrollments).
    # Dihitung sekali di sini dan dipakai oleh semua call ke CP-SAT dan GA evaluation.
    elective_conflict_pairs: frozenset[tuple[int, int]] = frozenset()
    elective_pair_weights: dict[tuple[int, int], int] = {}
    if enforce_grade_track_constraints and assignments and student_enrollments:
        elective_conflict_pairs, elective_pair_weights = _build_elective_student_conflict_pairs(
            assignments, student_enrollments
        )

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
            elective_conflict_pairs=elective_conflict_pairs,
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
                    elective_conflict_pairs=elective_conflict_pairs,
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
                    elective_conflict_pairs=elective_conflict_pairs,
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
                elective_conflict_pairs=elective_conflict_pairs,
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
                elective_conflict_pairs=elective_conflict_pairs,
                elective_pair_weights=elective_pair_weights,
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
                        elective_block_gap_penalty=_safe_int(
                            config.get("elective_block_gap_penalty"), default=20, min_value=0
                        ),
                        preferred_parallel_elective_subjects=_safe_int(
                            config.get("preferred_parallel_elective_subjects"), default=3, min_value=1
                        ),
                        elective_excess_soft_penalty=_safe_int(
                            config.get("elective_excess_soft_penalty"), default=5, min_value=0
                        ),
                        elective_conflict_pairs=elective_conflict_pairs,
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
                        elective_block_gap_penalty=_safe_int(
                            config.get("elective_block_gap_penalty"), default=20, min_value=0
                        ),
                        preferred_parallel_elective_subjects=_safe_int(
                            config.get("preferred_parallel_elective_subjects"), default=3, min_value=1
                        ),
                        elective_excess_soft_penalty=_safe_int(
                            config.get("elective_excess_soft_penalty"), default=5, min_value=0
                        ),
                        elective_conflict_pairs=elective_conflict_pairs,
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
                        elective_conflict_pairs=elective_conflict_pairs,
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
                        elective_conflict_pairs=elective_conflict_pairs,
                        elective_pair_weights=elective_pair_weights,
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
                            elective_conflict_pairs=elective_conflict_pairs,
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
                                elective_conflict_pairs=elective_conflict_pairs,
                                elective_pair_weights=elective_pair_weights,
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

            # ===== PHASE 2: Re-solve peminatan dengan S7 sebagai HARD constraint =====
            # Hanya dijalankan jika: (1) ada konflik siswa, (2) cukup sisa waktu.
            # Jika Phase 2 gagal (infeasible/timeout), jadwal original tetap dipakai.
            if elective_conflict_pairs and enforce_grade_track_constraints:
                try:
                    elective_assignments_list = [
                        a for a in assignments
                        if assignment_track_map.get(a["id"]) == "elective"
                    ]
                    phase2_remaining_seconds = max(0.0, deadline_at - time.perf_counter() - 10.0)
                    phase2_seconds = min(90.0, phase2_remaining_seconds * 0.5)
                    if elective_assignments_list and phase2_seconds >= 20.0:
                        phase2_result, phase2_msgs = _solve_elective_phase2(
                            elective_assignments=elective_assignments_list,
                            current_schedule_map=final_schedule_map,
                            all_assignments=assignments,
                            slots=slots,
                            elective_conflict_pairs=elective_conflict_pairs,
                            assignment_grade_map=assignment_grade_map,
                            assignment_track_map=assignment_track_map,
                            max_parallel_elective_subjects=max_parallel_elective_subjects,
                            solver_seconds=phase2_seconds,
                            random_seed=config["random_seed"],
                            solver_workers=config["solver_workers"],
                        )
                        warnings.extend(phase2_msgs)
                        if phase2_result:
                            merged = _clone_schedule_map(final_schedule_map)
                            for aid, sids in phase2_result.items():
                                merged[aid] = sids
                            merged_score, merged_feasible = _evaluate_schedule(
                                schedule_map=merged,
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
                                elective_conflict_pairs=elective_conflict_pairs,
                            )
                            # Hanya pakai hasil Phase 2 jika schedule tetap feasible
                            # (tidak melanggar hard constraint lainnya)
                            if merged_feasible:
                                final_schedule_map = merged
                                final_score = merged_score
                                final_evaluated_score = merged_score
                except Exception as _phase2_err:
                    warnings.append(_issue(
                        "ELECTIVE_PHASE2_ERROR",
                        f"Phase 2 dibatalkan karena kesalahan internal: {type(_phase2_err).__name__}",
                        {"error": str(_phase2_err)[:200]},
                    ))

            final_hard_constraints = _calculate_hard_constraint_report(
                schedule_map=final_schedule_map,
                assignments=assignments,
                slots_by_id=slots_by_id,
                slot_day_position_map=slot_day_position_map,
                max_parallel_elective_subjects=max_parallel_elective_subjects,
                enforce_grade_track_constraints=enforce_grade_track_constraints,
                elective_conflict_pairs=elective_conflict_pairs,
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
                elective_conflict_pairs=elective_conflict_pairs,
                elective_pair_weights=elective_pair_weights,
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
                        elective_conflict_pairs=elective_conflict_pairs,
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

    # Laporan bentrok peminatan siswa pada jadwal final (informatif, bukan error)
    if enforce_grade_track_constraints and final_schedule_map and student_enrollments:
        conflict_report = _report_elective_student_conflicts(
            final_schedule_map=final_schedule_map,
            assignments=assignments,
            student_enrollments=student_enrollments,
            slots_by_id=slots_by_id,
        )
        if conflict_report:
            warnings.append(
                _issue(
                    "ELECTIVE_STUDENT_CONFLICT_DETECTED",
                    (
                        f"Terdapat {len(conflict_report)} siswa yang masih mengalami bentrok "
                        f"jadwal peminatan pada hasil akhir. Ini adalah soft constraint — "
                        f"jadwal tetap valid namun disarankan untuk ditinjau."
                    ),
                    {
                        "total_affected_students": len(conflict_report),
                        "student_conflicts": conflict_report,
                    },
                )
            )

    return {
        "generated_at": generated_at,
        "period_id": normalized["period_id"],
        "summary": summary,
        "schedule": schedule_items,
        "warnings": warnings,
        "conflicts": conflicts,
    }
