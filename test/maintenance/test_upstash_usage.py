"""Exercise only aggregate Redis commands and the secret-safe report boundary."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/upstash-usage.py"
SPEC = importlib.util.spec_from_file_location("upstash_usage", SCRIPT)
usage = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(usage)
SENTINEL = "never-print-this-private-value"
ENV = {"UPSTASH_REDIS_REST_URL": "https://unit-test.upstash.io", "UPSTASH_REDIS_REST_TOKEN": SENTINEL}
INFO = "# Memory\r\nused_memory:12345\r\nused_memory_peak:67890\r\nmaxmemory:0\r\nunknown:" + SENTINEL


class FakeOpener:
    def __init__(self, values=None, error=None):
        self.values = values if values is not None else [{"result": 7}, {"result": INFO}]
        self.error = error
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        if self.error:
            raise self.error
        value = self.values[len(self.requests) - 1]
        return io.BytesIO(value if isinstance(value, bytes) else json.dumps(value).encode())


class UsageTests(unittest.TestCase):
    def test_only_two_get_commands_and_allowlisted_output(self):
        opener = FakeOpener()
        report = usage.collect(ENV, opener)
        self.assertEqual(report["status"], "ok")
        self.assertEqual(report["measurements"], {"database_key_count": 7, "used_memory_bytes": 12345,
                         "used_memory_peak_bytes": 67890, "maxmemory_bytes": 0})
        self.assertEqual([r.full_url for r, _ in opener.requests],
                         [ENV["UPSTASH_REDIS_REST_URL"] + "/dbsize", ENV["UPSTASH_REDIS_REST_URL"] + "/info/memory"])
        for request, timeout in opener.requests:
            self.assertEqual(request.get_method(), "GET")
            self.assertIsNone(request.data)
            self.assertEqual(request.get_header("Authorization"), "Bearer " + SENTINEL)
            self.assertEqual(timeout, 20)
        self.assertNotIn(SENTINEL, json.dumps(report))

    def test_missing_configuration_does_not_request(self):
        for key in ENV:
            with self.subTest(key=key):
                opener = FakeOpener()
                report = usage.collect({k: v for k, v in ENV.items() if k != key}, opener)
                self.assertEqual(report["failure_code"], "missing_configuration")
                self.assertEqual(opener.requests, [])

    def test_untrusted_urls_do_not_receive_credentials(self):
        for url in ["http://unit-test.upstash.io", "https://unit-test.upstash.io.evil.test",
                    "https://user:pass@unit-test.upstash.io", "https://unit-test.upstash.io/path",
                    "https://unit-test.upstash.io?token=" + SENTINEL]:
            with self.subTest(url_type=url.split(":", 1)[0]):
                opener = FakeOpener()
                report = usage.collect({**ENV, "UPSTASH_REDIS_REST_URL": url}, opener)
                self.assertEqual(report["failure_code"], "invalid_configuration")
                self.assertEqual(opener.requests, [])
                self.assertNotIn(SENTINEL, json.dumps(report))

    def test_header_newline_is_rejected(self):
        opener = FakeOpener()
        report = usage.collect({**ENV, "UPSTASH_REDIS_REST_TOKEN": "x\ny"}, opener)
        self.assertEqual(report["failure_code"], "invalid_configuration")
        self.assertEqual(opener.requests, [])

    def test_provider_errors_do_not_disclose_body_or_message(self):
        for code in [401, 403, 429, 500, 302]:
            with self.subTest(code=code):
                error = urllib.error.HTTPError("https://" + SENTINEL, code, SENTINEL, {}, io.BytesIO(SENTINEL.encode()))
                report = usage.collect(ENV, FakeOpener(error=error))
                self.assertEqual(report["status"], "error")
                for command in report["commands"].values():
                    self.assertEqual(command["http_status"], code)
                    self.assertEqual(command["failure_code"], "provider_http_error")
                self.assertNotIn(SENTINEL, json.dumps(report))

    def test_network_failure_does_not_disclose_exception(self):
        report = usage.collect(ENV, FakeOpener(error=RuntimeError(SENTINEL)))
        self.assertEqual(report["commands"]["dbsize"]["failure_code"], "request_failed")
        self.assertNotIn(SENTINEL, json.dumps(report))

    def test_malformed_and_provider_error_responses(self):
        for data in [SENTINEL.encode(), b"null", b"[]", {"error": SENTINEL}]:
            with self.subTest(value_type=type(data).__name__):
                report = usage.collect(ENV, FakeOpener([data, data]))
                self.assertEqual(report["status"], "error")
                self.assertTrue(all(c["failure_code"] == "invalid_response" for c in report["commands"].values()))
                self.assertNotIn(SENTINEL, json.dumps(report))

    def test_invalid_key_counts_are_rejected(self):
        for value in [True, -1, 1.5, "123", SENTINEL, None]:
            with self.subTest(value_type=type(value).__name__):
                report = usage.collect(ENV, FakeOpener([{"result": value}, {"result": INFO}]))
                self.assertEqual(report["commands"]["dbsize"]["failure_code"], "invalid_response")
                self.assertNotIn("database_key_count", report["measurements"])
                self.assertNotIn(SENTINEL, json.dumps(report))

    def test_invalid_memory_and_duplicate_fields_are_rejected(self):
        for info in [SENTINEL, "used_memory:-1", "used_memory:1.5", "used_memory:1\nused_memory:2", {"used_memory": 1}]:
            with self.subTest(value_type=type(info).__name__):
                report = usage.collect(ENV, FakeOpener([{"result": 7}, {"result": info}]))
                self.assertEqual(report["commands"]["info/memory"]["failure_code"], "invalid_response")
                self.assertEqual(report["measurements"], {"database_key_count": 7})
                self.assertNotIn(SENTINEL, json.dumps(report))

    def test_oversized_response_is_rejected(self):
        report = usage.collect(ENV, FakeOpener([b"x" * (usage.MAX_RESPONSE_BYTES + 1), {"result": INFO}]))
        self.assertEqual(report["commands"]["dbsize"]["failure_code"], "response_too_large")

    def test_redirects_are_not_followed(self):
        self.assertIsNone(usage.NoRedirects().redirect_request(None, None, 302, SENTINEL, {}, "https://example.com"))

    def test_stdout_and_summary_are_secret_safe(self):
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / "summary.txt"
            output = io.StringIO()
            with patch.dict(usage.os.environ, {**ENV, "GITHUB_STEP_SUMMARY": str(summary)}, clear=True), \
                    patch.object(usage.urllib.request, "build_opener", return_value=FakeOpener()), \
                    contextlib.redirect_stdout(output):
                self.assertEqual(usage.main(), 0)
            self.assertEqual(json.loads(output.getvalue())["measurements"]["database_key_count"], 7)
            self.assertNotIn(SENTINEL, output.getvalue() + summary.read_text())

    def test_failure_exit_is_secret_safe(self):
        output = io.StringIO()
        with patch.dict(usage.os.environ, ENV, clear=True), \
                patch.object(usage.urllib.request, "build_opener", return_value=FakeOpener(error=RuntimeError(SENTINEL))), \
                contextlib.redirect_stdout(output):
            self.assertEqual(usage.main(), 1)
        self.assertEqual(json.loads(output.getvalue())["status"], "error")
        self.assertNotIn(SENTINEL, output.getvalue())


if __name__ == "__main__":
    unittest.main()
