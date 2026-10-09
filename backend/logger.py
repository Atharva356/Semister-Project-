"""
Structured JSON Logger for AgriMandi Backend.
Formats log records as JSON lines for production observability without extra dependencies.
"""

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Dict


class JSONFormatter(logging.Formatter):
    """Formats Python logging records as single-line structured JSON."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include optional contextual metadata if provided in extra
        for attr in ("method", "path", "status_code", "ip", "user_id", "request_id"):
            val = getattr(record, attr, None)
            if val is not None:
                log_entry[attr] = val

        # Include exception trace only in internal log stream (never in HTTP response)
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry)


def configure_logging(debug: bool = False) -> logging.Logger:
    """Configures application logger with JSON formatting."""
    root = logging.getLogger()
    level = logging.DEBUG if debug else logging.INFO
    root.setLevel(level)

    formatter = JSONFormatter()

    if not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(formatter)
        root.addHandler(handler)
    else:
        for handler in root.handlers:
            handler.setFormatter(formatter)

    return logging.getLogger("agrimandi.app")
