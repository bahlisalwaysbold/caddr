"""Vercel serverless entry point for Caddr structural analysis."""
from http.server import BaseHTTPRequestHandler
import json

from backend.structural_solver import ModelInputError, SolverRunError, analyze_model


MAX_REQUEST_BYTES = 256 * 1024


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, payload):
        body = json.dumps(payload, allow_nan=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send_json(405, {"ok": False, "error": "Method not allowed. Send a POST request with a structural model."})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"ok": False, "error": "Invalid Content-Length header."})
            return
        if length <= 0 or length > MAX_REQUEST_BYTES:
            self._send_json(413 if length > MAX_REQUEST_BYTES else 400, {"ok": False, "error": "Request body must be between 1 byte and 256 KB."})
            return
        try:
            raw_body = self.rfile.read(length)
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"ok": False, "error": "Request body must be valid UTF-8 JSON."})
            return
        if not isinstance(payload, dict):
            self._send_json(400, {"ok": False, "error": "Request JSON must be an object."})
            return
        try:
            model = payload.get("model", payload)
            result = analyze_model(model)
        except ModelInputError as exc:
            self._send_json(422, {"ok": False, "error": str(exc)})
            return
        except SolverRunError as exc:
            self._send_json(422, {"ok": False, "error": str(exc)})
            return
        except Exception:
            self._send_json(500, {"ok": False, "error": "Unexpected analysis service error. Check the server logs and retry with a small model."})
            return
        self._send_json(200, result)

    def log_message(self, format, *args):
        return
