"""Read only DBSIZE and INFO memory; never enumerate keys or read trip records."""
import json
import os
import re
import sys
import urllib.error
import urllib.request

MAX_RESPONSE_BYTES = 65536


class NoRedirects(urllib.request.HTTPRedirectHandler):
    """Never forward the credential header to another URL."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def counter(value):
    if type(value) is not int or value < 0:
        raise ValueError("invalid counter")
    return value


def parse_result(payload, command):
    """Read only documented numeric aggregate fields, without provider messages."""
    if not isinstance(payload, dict) or "error" in payload:
        raise ValueError("invalid response")
    value = payload["result"]
    if command == "dbsize":
        return {"database_key_count": counter(value)}
    if command != "info/memory" or not isinstance(value, str):
        raise ValueError("invalid response")
    fields = {}
    for line in value.splitlines():
        key, separator, number = line.partition(":")
        if separator and key in ("used_memory", "used_memory_peak", "maxmemory"):
            if key in fields or not re.fullmatch(r"[0-9]{1,20}", number):
                raise ValueError("invalid counter")
            fields[key] = counter(int(number))
    if "used_memory" not in fields:
        raise ValueError("missing memory counter")
    return {key + "_bytes": number for key, number in fields.items()}


def collect(env, opener=None):
    report = {"provider": "upstash", "scope": "database",
              "units": {"database_key_count": "count", "used_memory_bytes": "bytes",
                        "used_memory_peak_bytes": "bytes", "maxmemory_bytes": "bytes"}}
    url = env.get("UPSTASH_REDIS_REST_URL", "").strip().rstrip("/")
    token = env.get("UPSTASH_REDIS_REST_TOKEN", "").strip()
    if not url or not token:
        return {**report, "status": "error", "failure_code": "missing_configuration"}
    if not re.fullmatch(r"https://[a-zA-Z0-9-]+\.upstash\.io", url) or any(c in token for c in "\r\n"):
        return {**report, "status": "error", "failure_code": "invalid_configuration"}
    opener = opener or urllib.request.build_opener(NoRedirects())
    commands = {}
    measurements = {}
    for command in ("dbsize", "info/memory"):
        request = urllib.request.Request(url + "/" + command, method="GET",
            headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
        try:
            with opener.open(request, timeout=20) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    commands[command] = {"status": "error", "failure_code": "response_too_large"}
                    continue
                measurements.update(parse_result(json.loads(raw), command))
            commands[command] = {"status": "ok", "http_status": 200}
        except urllib.error.HTTPError as exc:
            commands[command] = {"status": "error", "failure_code": "provider_http_error", "http_status": exc.code}
        except (ValueError, KeyError, TypeError):
            commands[command] = {"status": "error", "failure_code": "invalid_response"}
        except Exception:  # Do not log exception text: it can contain the URL or token.
            commands[command] = {"status": "error", "failure_code": "request_failed"}
    status = "ok" if all(row["status"] == "ok" for row in commands.values()) else "error"
    return {**report, "status": status, "commands": commands, "measurements": measurements}


def main():
    report = collect(os.environ)
    encoded = json.dumps(report, sort_keys=True)
    print(encoded)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write("```json\n" + encoded + "\n```\n")
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
