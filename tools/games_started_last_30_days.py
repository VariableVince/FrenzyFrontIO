#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import re
import shlex
import subprocess
from collections import Counter
from pathlib import Path


START_LINE_RE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \| GAME_START \| .*\| players=(?P<players>\d+) \|"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Plot games started per day for the last 30 days from games.log. "
            "Ignores GAME_START entries with 0 players and prints how many had >1 player."
        )
    )
    parser.add_argument(
        "--ssh-host",
        default="root@167.235.146.119",
        help=(
            "SSH host to fetch the log from (default: root@167.235.146.119). "
            "Use empty string to disable SSH fetching and only use --log-file."
        ),
    )
    parser.add_argument(
        "--remote-log-file",
        default="/var/log/frenzyfront/games.log",
        help="Remote games log path used with --ssh-host",
    )
    parser.add_argument(
        "--log-file",
        type=Path,
        default=Path("games.log"),
        help=(
            "Local games log file path (used when --ssh-host is empty, "
            "or as fallback if remote fetch is disabled)."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("games_started_last_30_days.png"),
        help="Output PNG file path for the graph",
    )
    return parser.parse_args()


def build_date_window(today: dt.date, days: int = 30) -> list[dt.date]:
    start = today - dt.timedelta(days=days - 1)
    return [start + dt.timedelta(days=offset) for offset in range(days)]


def parse_start_events(lines: list[str]) -> list[tuple[dt.date, int]]:
    events: list[tuple[dt.date, int]] = []
    for raw_line in lines:
        line = raw_line.strip()
        match = START_LINE_RE.match(line)
        if not match:
            continue

        players = int(match.group("players"))
        if players == 0:
            continue

        timestamp = dt.datetime.strptime(match.group("ts"), "%Y-%m-%d %H:%M:%S")
        events.append((timestamp.date(), players))

    return events


def read_start_events_from_local_file(log_file: Path) -> list[tuple[dt.date, int]]:
    if not log_file.exists():
        raise FileNotFoundError(f"Log file not found: {log_file}")
    with log_file.open("r", encoding="utf-8", errors="replace") as handle:
        return parse_start_events(handle.readlines())


def read_start_events_via_ssh(
    ssh_host: str,
    remote_log_file: str,
) -> list[tuple[dt.date, int]]:
    command = f"cat {shlex.quote(remote_log_file)}"
    result = subprocess.run(
        ["ssh", ssh_host, command],
        check=False,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        stderr = result.stderr.strip() or "unknown error"
        raise RuntimeError(
            f"Failed to fetch remote log via SSH (host={ssh_host}, file={remote_log_file}): {stderr}"
        )

    return parse_start_events(result.stdout.splitlines())


def render_chart(dates: list[dt.date], counts: list[int], output_file: Path) -> None:
    try:
        import matplotlib.pyplot as plt
    except ImportError as exc:
        raise RuntimeError(
            "matplotlib is required to generate the graph. Install with: pip install matplotlib"
        ) from exc

    labels = [d.strftime("%m-%d") for d in dates]

    plt.figure(figsize=(12, 5))
    plt.plot(labels, counts, marker="o", linewidth=2)
    plt.title("Games Started Per Day (Last 30 Days, Players > 0)")
    plt.xlabel("Date")
    plt.ylabel("Games started")
    plt.xticks(rotation=45, ha="right")
    plt.grid(True, axis="y", linestyle="--", alpha=0.4)
    plt.tight_layout()

    output_file.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_file, dpi=150)
    plt.close()


def main() -> int:
    args = parse_args()

    today = dt.date.today()
    date_window = build_date_window(today, days=30)
    start_date = date_window[0]
    end_date = date_window[-1]

    source_label: str
    if args.ssh_host.strip():
        events = read_start_events_via_ssh(args.ssh_host.strip(), args.remote_log_file)
        source_label = f"ssh://{args.ssh_host.strip()}{args.remote_log_file}"
    else:
        events = read_start_events_from_local_file(args.log_file)
        source_label = str(args.log_file)

    in_window_events = [
        (event_date, players)
        for event_date, players in events
        if start_date <= event_date <= end_date
    ]

    per_day = Counter(event_date for event_date, _ in in_window_events)
    daily_counts = [per_day.get(day, 0) for day in date_window]
    more_than_one_player = sum(1 for _, players in in_window_events if players > 1)

    render_chart(date_window, daily_counts, args.output)

    print(f"Source: {source_label}")
    print(f"Date range: {start_date.isoformat()} to {end_date.isoformat()}")
    print(f"Graph saved to: {args.output}")
    print(f"Games started with >1 player (last 30 days): {more_than_one_player}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
