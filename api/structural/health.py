"""Health endpoint for Caddr's PyNiteFEA analysis service."""
from http.server import BaseHTTPRequestHandler
import json

from backend.structural_solver import engine_health


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(engine_health(), separators=(",", ":")).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.send_response(405)
        self.send_header("Allow", "GET")
        self.end_headers()

    def log_message(self, format, *args):
        return
