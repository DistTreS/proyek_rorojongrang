#!/usr/bin/env python3
"""Generate demo attendance SQL from an existing phpMyAdmin-style dump.

The output is designed to be imported after the base dump so reports can be
tested with realistic attendance history without requiring a live database
connection during generation.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import re
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any


INSERT_RE = re.compile(
    r"INSERT INTO `(?P<table>[^`]+)` \((?P<columns>.*?)\) VALUES\s*(?P<values>.*?);",
    re.DOTALL | re.IGNORECASE,
)
INT_RE = re.compile(r"^-?\d+$")
TARGET_TABLES = {
    "academicperiod",
    "attendance",
    "schedulebatch",
    "schedule",
    "studentrombel",
    "teachingassignment",
    "timeslot",
}
MEETING_NOTE_PREFIX = "Seed demo laporan Codex"


def parse_args() -> argparse.Namespace:
    default_dump = Path("/mnt/c/Users/ASUSN/Downloads/akademik (5).sql")
    default_output = Path("backend/scripts/generated/seed_attendance_demo.sql")

    parser = argparse.ArgumentParser()
    parser.add_argument("--dump", type=Path, default=default_dump)
    parser.add_argument("--output", type=Path, default=default_output)
    parser.add_argument("--lookback-days", type=int, default=70)
    parser.add_argument("--templates-per-rombel", type=int, default=2)
    parser.add_argument("--max-students-per-meeting", type=int, default=0)
    return parser.parse_args()


def parse_sql_values_block(block: str) -> list[list[Any]]:
    rows: list[list[Any]] = []
    row: list[Any] = []
    token: list[str] = []
    in_string = False
    quoted_token = False
    escape_next = False
    row_open = False
    index = 0

    while index < len(block):
        char = block[index]

        if in_string:
            if escape_next:
                token.append(char)
                escape_next = False
            elif char == "\\":
                escape_next = True
            elif char == "'":
                next_char = block[index + 1] if index + 1 < len(block) else ""
                if next_char == "'":
                    token.append("'")
                    index += 1
                else:
                    in_string = False
            else:
                token.append(char)
            index += 1
            continue

        if char == "'":
            in_string = True
            quoted_token = True
            index += 1
            continue

        if char == "(":
            row_open = True
            row = []
            token = []
            quoted_token = False
            index += 1
            continue

        if char == ")":
            if row_open:
                row.append(convert_sql_token("".join(token).strip(), quoted_token))
                rows.append(row)
            row_open = False
            row = []
            token = []
            quoted_token = False
            index += 1
            continue

        if char == ",":
            if row_open:
                row.append(convert_sql_token("".join(token).strip(), quoted_token))
                token = []
                quoted_token = False
            index += 1
            continue

        if row_open:
            token.append(char)

        index += 1

    return rows


def convert_sql_token(token: str, quoted: bool) -> Any:
    if quoted:
        return token

    normalized = token.strip()
    if not normalized or normalized.upper() == "NULL":
        return None
    if INT_RE.match(normalized):
        return int(normalized)
    return normalized


def load_dump_tables(dump_path: Path) -> dict[str, list[dict[str, Any]]]:
    sql_text = dump_path.read_text(encoding="utf-8")
    tables: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for match in INSERT_RE.finditer(sql_text):
        table = match.group("table").lower()
        if table not in TARGET_TABLES:
            continue

        columns = [
            column.strip().strip("`")
            for column in match.group("columns").split(",")
        ]
        rows = parse_sql_values_block(match.group("values"))
        for row in rows:
            tables[table].append(dict(zip(columns, row)))

    return tables


def to_date(value: Any) -> dt.date:
    return dt.date.fromisoformat(str(value))


def to_datetime_sql(date_value: dt.date, time_value: str) -> str:
    return f"{date_value.isoformat()} {time_value}"


def sql_quote(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)

    text = str(value).replace("\\", "\\\\").replace("'", "\\'")
    return f"'{text}'"


def deterministic_random_0_999(*parts: Any) -> int:
    raw = "::".join(str(part) for part in parts)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 1000


def pick_status(meeting_key: str, student_id: int) -> tuple[str, str | None]:
    meeting_roll = deterministic_random_0_999(meeting_key, "meeting")
    student_roll = deterministic_random_0_999(meeting_key, student_id)

    if meeting_roll < 35:
        thresholds = (
            ("hadir", 790),
            ("izin", 880),
            ("sakit", 950),
            ("alpa", 1000),
        )
    elif meeting_roll < 80:
        thresholds = (
            ("hadir", 830),
            ("izin", 900),
            ("sakit", 960),
            ("alpa", 1000),
        )
    else:
        thresholds = (
            ("hadir", 885),
            ("izin", 930),
            ("sakit", 970),
            ("alpa", 1000),
        )

    for status, upper_bound in thresholds:
        if student_roll < upper_bound:
            note = None
            if status == "izin":
                note = "izin kegiatan keluarga"
            elif status == "sakit":
                note = "sakit, istirahat di rumah"
            elif status == "alpa":
                note = "belum ada keterangan"
            return status, note

    return "hadir", None


def choose_templates(
    schedule_rows: list[dict[str, Any]],
    assignments_by_id: dict[int, dict[str, Any]],
    timeslots_by_id: dict[int, dict[str, Any]],
    rombel_student_map: dict[int, list[int]],
    templates_per_rombel: int,
) -> list[dict[str, Any]]:
    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in schedule_rows:
        rombel_id = int(row["rombel_id"])
        if rombel_id not in rombel_student_map:
            continue

        time_slot = timeslots_by_id.get(int(row["time_slot_id"]))
        assignment = assignments_by_id.get(int(row["teaching_assignment_id"]))
        if not time_slot or not assignment:
            continue
        if int(time_slot["day_of_week"]) not in {1, 2, 3, 4, 5}:
            continue

        grouped[rombel_id].append(
            {
                "schedule_id": int(row["id"]),
                "rombel_id": rombel_id,
                "time_slot_id": int(row["time_slot_id"]),
                "teaching_assignment_id": int(row["teaching_assignment_id"]),
                "teacher_id": int(assignment["teacher_id"]),
                "subject_id": int(assignment["subject_id"]),
                "day_of_week": int(time_slot["day_of_week"]),
                "start_time": str(time_slot["start_time"]),
                "end_time": str(time_slot["end_time"]),
            }
        )

    templates: list[dict[str, Any]] = []
    for rombel_id in sorted(grouped):
        candidates = sorted(
            grouped[rombel_id],
            key=lambda item: (
                item["day_of_week"],
                item["start_time"],
                item["teacher_id"],
                item["subject_id"],
                item["schedule_id"],
            ),
        )

        chosen: list[dict[str, Any]] = []
        used_days: set[int] = set()
        for candidate in candidates:
            if candidate["day_of_week"] in used_days and len(used_days) < templates_per_rombel:
                continue
            chosen.append(candidate)
            used_days.add(candidate["day_of_week"])
            if len(chosen) >= templates_per_rombel:
                break

        if len(chosen) < templates_per_rombel:
            chosen_ids = {item["schedule_id"] for item in chosen}
            for candidate in candidates:
                if candidate["schedule_id"] in chosen_ids:
                    continue
                chosen.append(candidate)
                chosen_ids.add(candidate["schedule_id"])
                if len(chosen) >= templates_per_rombel:
                    break

        templates.extend(chosen)

    return templates


def build_rows(
    tables: dict[str, list[dict[str, Any]]],
    lookback_days: int,
    templates_per_rombel: int,
    max_students_per_meeting: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    periods = tables["academicperiod"]
    schedule_batches = tables["schedulebatch"]
    schedules = tables["schedule"]
    assignments = tables["teachingassignment"]
    student_rombels = tables["studentrombel"]
    timeslots = tables["timeslot"]
    existing_attendance = tables["attendance"]

    active_period = next(
        (row for row in periods if int(row.get("is_active") or 0) == 1),
        periods[0] if periods else None,
    )
    if not active_period:
        raise SystemExit("Tidak menemukan data academicperiod pada dump.")

    period_id = int(active_period["id"])
    period_start = to_date(active_period["start_date"])
    period_end = to_date(active_period["end_date"])
    today = dt.date.today()
    seed_end = min(period_end, today - dt.timedelta(days=1))
    seed_start = max(period_start, seed_end - dt.timedelta(days=lookback_days))

    approved_batches = [
        row
        for row in schedule_batches
        if int(row["period_id"]) == period_id and str(row["status"]).lower() == "approved"
    ]
    if not approved_batches:
        raise SystemExit("Tidak menemukan schedule batch berstatus approved.")

    approved_batches.sort(
        key=lambda row: (
            row.get("approved_at") or "",
            int(row["id"]),
        )
    )
    approved_batch = approved_batches[-1]
    batch_id = int(approved_batch["id"])

    assignments_by_id = {int(row["id"]): row for row in assignments}
    timeslots_by_id = {int(row["id"]): row for row in timeslots}

    rombel_student_map: dict[int, list[int]] = defaultdict(list)
    for row in student_rombels:
        rombel_student_map[int(row["rombel_id"])].append(int(row["student_id"]))
    for rombel_id in list(rombel_student_map):
        rombel_student_map[rombel_id] = sorted(set(rombel_student_map[rombel_id]))

    approved_schedules = [
        row
        for row in schedules
        if int(row["batch_id"]) == batch_id and int(row["period_id"]) == period_id
    ]

    templates = choose_templates(
        schedule_rows=approved_schedules,
        assignments_by_id=assignments_by_id,
        timeslots_by_id=timeslots_by_id,
        rombel_student_map=rombel_student_map,
        templates_per_rombel=templates_per_rombel,
    )

    if not templates:
        raise SystemExit("Tidak ada template jadwal yang bisa dipakai untuk seed presensi.")

    existing_meeting_keys = {
        (
            str(row["date"]),
            int(row["rombel_id"]),
            int(row["time_slot_id"]),
        )
        for row in existing_attendance
    }
    next_attendance_id = max((int(row["id"]) for row in existing_attendance), default=0) + 1

    generated_rows: list[dict[str, Any]] = []
    generated_meetings = 0

    current_date = seed_start
    while current_date <= seed_end:
        if current_date.isoweekday() in {1, 2, 3, 4, 5}:
            for template in templates:
                if current_date.isoweekday() != template["day_of_week"]:
                    continue

                meeting_key = (
                    current_date.isoformat(),
                    template["rombel_id"],
                    template["time_slot_id"],
                )
                if meeting_key in existing_meeting_keys:
                    continue

                students = rombel_student_map.get(template["rombel_id"], [])
                if max_students_per_meeting > 0:
                    students = students[:max_students_per_meeting]
                if not students:
                    continue

                meeting_id = str(
                    uuid.uuid5(
                        uuid.NAMESPACE_DNS,
                        f"codex-attendance::{current_date.isoformat()}::{template['rombel_id']}::{template['time_slot_id']}",
                    )
                )
                meeting_note = (
                    f"{MEETING_NOTE_PREFIX} | batch #{batch_id} | "
                    f"period {period_id} | {current_date.isoformat()}"
                )

                for student_id in students:
                    status, note = pick_status(meeting_id, student_id)
                    generated_rows.append(
                        {
                            "id": next_attendance_id,
                            "meeting_id": meeting_id,
                            "student_id": student_id,
                            "rombel_id": template["rombel_id"],
                            "time_slot_id": template["time_slot_id"],
                            "subject_id": template["subject_id"],
                            "teacher_id": template["teacher_id"],
                            "substitute_teacher_id": None,
                            "date": current_date.isoformat(),
                            "status": status,
                            "note": note,
                            "meeting_note": meeting_note,
                            "attachment_url": None,
                            "created_at": to_datetime_sql(current_date, template["start_time"]),
                            "updated_at": to_datetime_sql(current_date, template["end_time"]),
                        }
                    )
                    next_attendance_id += 1

                generated_meetings += 1

        current_date += dt.timedelta(days=1)

    summary = {
        "period_id": period_id,
        "batch_id": batch_id,
        "seed_start": seed_start.isoformat(),
        "seed_end": seed_end.isoformat(),
        "template_count": len(templates),
        "generated_meetings": generated_meetings,
        "generated_rows": len(generated_rows),
        "rombel_count": len({row["rombel_id"] for row in templates}),
    }
    return generated_rows, summary


def write_sql(output_path: Path, attendance_rows: list[dict[str, Any]], summary: dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    columns = [
        "id",
        "meeting_id",
        "student_id",
        "rombel_id",
        "time_slot_id",
        "subject_id",
        "teacher_id",
        "substitute_teacher_id",
        "date",
        "status",
        "note",
        "meeting_note",
        "attachment_url",
        "created_at",
        "updated_at",
    ]

    lines = [
        "-- Seed demo attendance generated by Codex",
        f"-- Period ID: {summary['period_id']}",
        f"-- Approved batch ID: {summary['batch_id']}",
        f"-- Range: {summary['seed_start']} to {summary['seed_end']}",
        f"-- Meetings: {summary['generated_meetings']}",
        f"-- Rows: {summary['generated_rows']}",
        "",
        "START TRANSACTION;",
        "",
        f"DELETE FROM `attendance` WHERE `meeting_note` LIKE {sql_quote(MEETING_NOTE_PREFIX + '%')};",
        "",
    ]

    chunk_size = 500
    for chunk_start in range(0, len(attendance_rows), chunk_size):
        chunk = attendance_rows[chunk_start:chunk_start + chunk_size]
        lines.append(
            "INSERT INTO `attendance` "
            "(`id`, `meeting_id`, `student_id`, `rombel_id`, `time_slot_id`, `subject_id`, "
            "`teacher_id`, `substitute_teacher_id`, `date`, `status`, `note`, `meeting_note`, "
            "`attachment_url`, `created_at`, `updated_at`) VALUES"
        )
        value_lines = []
        for row in chunk:
            values = ", ".join(sql_quote(row[column]) for column in columns)
            value_lines.append(f"({values})")
        lines.append(",\n".join(value_lines) + ";")
        lines.append("")

    if attendance_rows:
        next_auto_increment = max(int(row["id"]) for row in attendance_rows) + 1
        lines.append(f"ALTER TABLE `attendance` AUTO_INCREMENT = {next_auto_increment};")
        lines.append("")

    lines.append("COMMIT;")
    lines.append("")

    output_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = parse_args()
    tables = load_dump_tables(args.dump)
    rows, summary = build_rows(
        tables=tables,
        lookback_days=args.lookback_days,
        templates_per_rombel=args.templates_per_rombel,
        max_students_per_meeting=args.max_students_per_meeting,
    )
    write_sql(args.output, rows, summary)
    print("Generated SQL seed:")
    print(f"  dump:   {args.dump}")
    print(f"  output: {args.output}")
    for key, value in summary.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
