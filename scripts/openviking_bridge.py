from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import openviking as ov
import requests
from openviking.message import TextPart


DEFAULT_ENDPOINT = "http://127.0.0.1:1933"
DEFAULT_AGENT_ID = "opencode-local"
DEFAULT_TIMEOUT = 30.0


@dataclass
class Hit:
    uri: str
    score: float | None = None
    abstract: str | None = None


def normalize_level(level: str) -> str:
    if level == "auto":
        return "read"
    return level


def hit_to_dict(hit: Any) -> dict[str, Any]:
    if isinstance(hit, dict):
        return {
            "uri": hit.get("uri", ""),
            "score": hit.get("score"),
            "abstract": hit.get("abstract"),
        }
    return asdict(
        Hit(
            uri=getattr(hit, "uri", ""),
            score=getattr(hit, "score", None),
            abstract=getattr(hit, "abstract", None),
        )
    )


def serialize_find_results(results: Any) -> dict[str, list[dict[str, Any]]]:
    return {
        "resources": [hit_to_dict(x) for x in getattr(results, "resources", [])],
        "memories": [hit_to_dict(x) for x in getattr(results, "memories", [])],
        "skills": [hit_to_dict(x) for x in getattr(results, "skills", [])],
    }


def parse_search_response(payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    wrapped = payload.get("result")
    if isinstance(wrapped, dict):
        payload = wrapped
    return {
        "resources": [hit_to_dict(x) for x in payload.get("resources", [])],
        "memories": [hit_to_dict(x) for x in payload.get("memories", [])],
        "skills": [hit_to_dict(x) for x in payload.get("skills", [])],
    }


def build_headers(*, api_key: str, agent_id: str) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "X-OpenViking-Agent": agent_id,
    }
    if api_key:
        headers["x-api-key"] = api_key
    return headers


def build_runtime_config() -> dict[str, Any]:
    return {
        "endpoint": os.environ.get("OPENVIKING_ENDPOINT", DEFAULT_ENDPOINT).rstrip("/"),
        "api_key": os.environ.get("OPENVIKING_API_KEY", ""),
        "agent_id": os.environ.get("OPENVIKING_AGENT_ID", DEFAULT_AGENT_ID),
        "timeout": float(os.environ.get("OPENVIKING_TIMEOUT", str(DEFAULT_TIMEOUT))),
    }


def build_child_target_uri(base_uri: str, relative_path: str) -> str:
    trimmed = base_uri.rstrip("/")
    cleaned = relative_path.strip("/").replace("\\", "/")
    return f"{trimmed}/{cleaned}"


def ensure_viking_uri(value: str, *, command: str) -> str:
    if value.startswith("viking://"):
        return value
    raise ValueError(
        f"{command} 需要传入 viking:// URI，而不是本地路径: {value}. "
        f"如果你要导入本地文件，请使用 ingest/ov_ingest；如果你要浏览资源，请先传类似 "
        f"viking://resources/ 或 viking://resources/your-project/ 的 URI。"
    )


def normalize_search_scope_uri(value: str | None) -> str:
    if not value:
        return "viking://"
    return ensure_viking_uri(value, command="search-scope")


def http_json_request(
    *,
    method: str,
    endpoint: str,
    path: str,
    api_key: str,
    agent_id: str,
    timeout: float,
    query: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
) -> Any:
    url = f"{endpoint}{path}"
    if query:
        clean_query = {k: v for k, v in query.items() if v is not None}
        if clean_query:
            url = f"{url}?{urlencode(clean_query)}"
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=data,
        headers=build_headers(api_key=api_key, agent_id=agent_id),
        method=method,
    )
    with urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8")
    if not body:
        return {}
    return json.loads(body)


def upload_temp_file(*, endpoint: str, api_key: str, agent_id: str, timeout: float, path: Path) -> str:
    headers = build_headers(api_key=api_key, agent_id=agent_id)
    headers.pop("Content-Type", None)
    with path.open("rb") as file_obj:
        response = requests.post(
            f"{endpoint}/api/v1/resources/temp_upload",
            headers=headers,
            files={"file": (path.name, file_obj)},
            timeout=timeout,
        )
    response.raise_for_status()
    payload = response.json()
    return payload["result"]["temp_file_id"]


def ingest_local_file(
    *,
    endpoint: str,
    api_key: str,
    agent_id: str,
    timeout: float,
    path: Path,
    target_uri: str | None,
    wait: bool,
) -> Any:
    temp_file_id = upload_temp_file(
        endpoint=endpoint,
        api_key=api_key,
        agent_id=agent_id,
        timeout=timeout,
        path=path,
    )
    payload: dict[str, Any] = {
        "temp_file_id": temp_file_id,
        "wait": wait,
    }
    if target_uri:
        payload["to"] = target_uri
    return http_json_request(
        method="POST",
        endpoint=endpoint,
        path="/api/v1/resources",
        api_key=api_key,
        agent_id=agent_id,
        timeout=timeout,
        payload=payload,
    )


def load_client() -> Any:
    endpoint = os.environ.get("OPENVIKING_ENDPOINT", DEFAULT_ENDPOINT)
    api_key = os.environ.get("OPENVIKING_API_KEY", "")
    agent_id = os.environ.get("OPENVIKING_AGENT_ID", DEFAULT_AGENT_ID)
    timeout = float(os.environ.get("OPENVIKING_TIMEOUT", str(DEFAULT_TIMEOUT)))
    return ov.SyncHTTPClient(
        url=endpoint,
        api_key=api_key,
        agent_id=agent_id,
        timeout=timeout,
    )


def command_ingest(client: Any, args: argparse.Namespace) -> dict[str, Any]:
    path = str(Path(args.path).expanduser())
    config = build_runtime_config()
    source = Path(path)
    if not source.exists():
        raise FileNotFoundError(f"Path not found: {source}")

    if source.is_file():
        result = ingest_local_file(
            endpoint=config["endpoint"],
            api_key=config["api_key"],
            agent_id=config["agent_id"],
            timeout=config["timeout"],
            path=source,
            target_uri=args.target_uri,
            wait=bool(args.wait),
        )
    else:
        items: list[dict[str, Any]] = []
        for child in sorted(p for p in source.rglob("*") if p.is_file()):
            relative_path = str(child.relative_to(source))
            child_target_uri = None
            if args.target_uri:
                child_target_uri = build_child_target_uri(args.target_uri, relative_path)
            child_result = ingest_local_file(
                endpoint=config["endpoint"],
                api_key=config["api_key"],
                agent_id=config["agent_id"],
                timeout=config["timeout"],
                path=child,
                target_uri=child_target_uri,
                wait=bool(args.wait),
            )
            items.append(
                {
                    "path": str(child),
                    "target_uri": child_target_uri,
                    "result": child_result,
                }
            )
        result = {"items": items}
    return {
        "ok": True,
        "action": "ingest",
        "path": path,
        "target_uri": args.target_uri,
        "result": result,
    }


def command_search(client: Any, args: argparse.Namespace) -> dict[str, Any]:
    config = build_runtime_config()
    results = http_json_request(
        method="POST",
        endpoint=config["endpoint"],
        path="/api/v1/search/find",
        api_key=config["api_key"],
        agent_id=config["agent_id"],
        timeout=config["timeout"],
        payload={
            "query": args.query,
            "target_uri": args.target_uri or "",
        },
    )
    payload = parse_search_response(results)
    payload["ok"] = True
    payload["action"] = "search"
    payload["query"] = args.query
    return payload


def command_grep(client: Any, args: argparse.Namespace) -> dict[str, Any]:
    config = build_runtime_config()
    uri = ensure_viking_uri(args.uri, command="grep")
    results = http_json_request(
        method="POST",
        endpoint=config["endpoint"],
        path="/api/v1/search/grep",
        api_key=config["api_key"],
        agent_id=config["agent_id"],
        timeout=config["timeout"],
        payload={
            "uri": uri,
            "pattern": args.pattern,
            "case_insensitive": bool(args.case_insensitive),
        },
    )
    return {
        "ok": True,
        "action": "grep",
        "uri": uri,
        "pattern": args.pattern,
        "result": results.get("result", results),
    }


def command_glob(client: Any, args: argparse.Namespace) -> dict[str, Any]:
    config = build_runtime_config()
    uri = normalize_search_scope_uri(args.uri)
    results = http_json_request(
        method="POST",
        endpoint=config["endpoint"],
        path="/api/v1/search/glob",
        api_key=config["api_key"],
        agent_id=config["agent_id"],
        timeout=config["timeout"],
        payload={
            "pattern": args.pattern,
            "uri": uri,
        },
    )
    return {
        "ok": True,
        "action": "glob",
        "uri": uri,
        "pattern": args.pattern,
        "result": results.get("result", results),
    }


def command_read(client: Any, args: argparse.Namespace) -> dict[str, Any]:
    level = normalize_level(args.level)
    config = build_runtime_config()
    uri = ensure_viking_uri(args.uri, command="read")
    endpoint_map = {
        "abstract": "/api/v1/content/abstract",
        "overview": "/api/v1/content/overview",
        "read": "/api/v1/content/read",
    }
    content = http_json_request(
        method="GET",
        endpoint=config["endpoint"],
        path=endpoint_map[level],
        api_key=config["api_key"],
        agent_id=config["agent_id"],
        timeout=config["timeout"],
        query={"uri": uri},
    )
    return {
        "ok": True,
        "action": "read",
        "uri": uri,
        "level": level,
        "content": content,
    }


def command_browse(client: Any, args: argparse.Namespace) -> dict[str, Any]:
    config = build_runtime_config()
    uri = ensure_viking_uri(args.uri, command="browse")
    endpoint_map = {
        "list": "/api/v1/fs/ls",
        "tree": "/api/v1/fs/tree",
        "stat": "/api/v1/fs/stat",
    }
    entries = http_json_request(
        method="GET",
        endpoint=config["endpoint"],
        path=endpoint_map[args.view],
        api_key=config["api_key"],
        agent_id=config["agent_id"],
        timeout=config["timeout"],
        query={
            "uri": uri,
            "recursive": str(args.recursive).lower(),
            "simple": str(args.simple).lower(),
            "output": "agent",
        },
    )
    return {
        "ok": True,
        "action": "browse",
        "uri": uri,
        "view": args.view,
        "recursive": args.recursive,
        "simple": args.simple,
        "entries": entries,
    }


def command_commit(client: Any, args: argparse.Namespace) -> dict[str, Any]:
    config = build_runtime_config()
    if args.note:
        http_json_request(
            method="POST",
            endpoint=config["endpoint"],
            path=f"/api/v1/sessions/{args.session_id}/messages",
            api_key=config["api_key"],
            agent_id=config["agent_id"],
            timeout=config["timeout"],
            payload={
                "role": "user",
                "parts": [TextPart(text=args.note).model_dump()],
            },
        )
    result = http_json_request(
        method="POST",
        endpoint=config["endpoint"],
        path=f"/api/v1/sessions/{args.session_id}/commit",
        api_key=config["api_key"],
        agent_id=config["agent_id"],
        timeout=config["timeout"],
    )
    return {
        "ok": True,
        "action": "commit",
        "session_id": args.session_id,
        "note_added": bool(args.note),
        "result": result,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="OpenViking bridge for OpenCode")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest = subparsers.add_parser("ingest")
    ingest.add_argument("path")
    ingest.add_argument("--target-uri")
    ingest.add_argument("--wait", action="store_true")

    search = subparsers.add_parser("search")
    search.add_argument("query")
    search.add_argument("--target-uri")

    grep = subparsers.add_parser("grep")
    grep.add_argument("uri")
    grep.add_argument("pattern")
    grep.add_argument("--case-insensitive", action="store_true")

    glob = subparsers.add_parser("glob")
    glob.add_argument("pattern")
    glob.add_argument("--uri")

    read = subparsers.add_parser("read")
    read.add_argument("uri")
    read.add_argument(
        "--level",
        choices=["auto", "abstract", "overview", "read"],
        default="auto",
    )

    browse = subparsers.add_parser("browse")
    browse.add_argument("uri")
    browse.add_argument("--view", choices=["list", "tree", "stat"], default="list")
    browse.add_argument("--recursive", action="store_true")
    browse.add_argument("--simple", action="store_true")

    commit = subparsers.add_parser("commit")
    commit.add_argument("--session-id", required=True)
    commit.add_argument("--note")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    client = load_client()
    try:
        if args.command == "ingest":
            payload = command_ingest(client, args)
        elif args.command == "search":
            payload = command_search(client, args)
        elif args.command == "read":
            payload = command_read(client, args)
        elif args.command == "browse":
            payload = command_browse(client, args)
        elif args.command == "grep":
            payload = command_grep(client, args)
        elif args.command == "glob":
            payload = command_glob(client, args)
        elif args.command == "commit":
            payload = command_commit(client, args)
        else:
            raise ValueError(f"Unsupported command: {args.command}")
        print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
        return 0
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "command": args.command,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            close()


if __name__ == "__main__":
    raise SystemExit(main())
