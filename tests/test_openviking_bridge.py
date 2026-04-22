from pathlib import Path
import sys
from types import SimpleNamespace
from argparse import Namespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import scripts.openviking_bridge as bridge
from scripts.openviking_bridge import (
    build_headers,
    build_child_target_uri,
    ensure_viking_uri,
    normalize_search_scope_uri,
    command_ingest,
    normalize_level,
    parse_search_response,
    serialize_find_results,
)


def test_normalize_level_maps_auto_to_read() -> None:
    assert normalize_level("auto") == "read"
    assert normalize_level("overview") == "overview"


def test_serialize_find_results_collects_all_groups() -> None:
    results = SimpleNamespace(
        resources=[SimpleNamespace(uri="viking://resources/a", score=0.9, abstract="A")],
        memories=[SimpleNamespace(uri="viking://user/memories/b", score=0.8, abstract="B")],
        skills=[],
    )

    payload = serialize_find_results(results)

    assert payload["resources"][0]["uri"] == "viking://resources/a"
    assert payload["memories"][0]["abstract"] == "B"
    assert payload["skills"] == []


def test_build_headers_uses_api_key_and_agent_id() -> None:
    headers = build_headers(api_key="secret", agent_id="opencode-local")

    assert headers["x-api-key"] == "secret"
    assert headers["X-OpenViking-Agent"] == "opencode-local"


def test_parse_search_response_accepts_plain_http_payload() -> None:
    payload = parse_search_response(
        {
            "resources": [{"uri": "viking://resources/demo", "score": 0.7}],
            "memories": [],
            "skills": [],
        }
    )

    assert payload["resources"][0]["uri"] == "viking://resources/demo"
    assert payload["memories"] == []


def test_parse_search_response_accepts_wrapped_http_payload() -> None:
    payload = parse_search_response(
        {
            "status": "ok",
            "result": {
                "resources": [{"uri": "viking://resources/demo", "score": 0.7}],
                "memories": [],
                "skills": [],
            },
        }
    )

    assert payload["resources"][0]["uri"] == "viking://resources/demo"


def test_command_ingest_keeps_target_uri_for_directory_children(
    tmp_path: Path, monkeypatch
) -> None:
    source_dir = tmp_path / "materials"
    source_dir.mkdir()
    (source_dir / "a.txt").write_text("a", encoding="utf-8")
    nested = source_dir / "docs"
    nested.mkdir()
    (nested / "b.txt").write_text("b", encoding="utf-8")

    captured: list[tuple[str, str | None]] = []

    def fake_ingest_local_file(**kwargs: object) -> dict[str, object]:
        captured.append((str(kwargs["path"]), kwargs.get("target_uri")))  # type: ignore[index]
        return {"status": "ok"}

    monkeypatch.setattr(bridge, "ingest_local_file", fake_ingest_local_file)

    args = Namespace(
        path=str(source_dir),
        target_uri="viking://resources/openviking-demo/",
        wait=True,
    )

    payload = command_ingest(client=None, args=args)

    assert payload["ok"] is True
    assert captured[0][1] == "viking://resources/openviking-demo/a.txt"
    assert captured[1][1] == "viking://resources/openviking-demo/docs/b.txt"


def test_build_child_target_uri_keeps_relative_structure() -> None:
    uri = build_child_target_uri(
        "viking://resources/openviking-demo/",
        "docs/intro.md",
    )

    assert uri == "viking://resources/openviking-demo/docs/intro.md"


def test_ensure_viking_uri_rejects_local_path() -> None:
    try:
        ensure_viking_uri("/tmp/demo", command="browse")
    except ValueError as exc:
        assert "viking://" in str(exc)
        assert "本地路径" in str(exc)
    else:
        raise AssertionError("expected ValueError for local path")


def test_normalize_search_scope_uri_defaults_to_viking_root() -> None:
    assert normalize_search_scope_uri(None) == "viking://"
    assert normalize_search_scope_uri("viking://resources/") == "viking://resources/"
