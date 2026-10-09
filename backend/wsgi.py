"""
AgriMandi WSGI Production Entry Point.
-----------------------------------------------------------------------------
Entry point for production WSGI servers such as Gunicorn or uWSGI.

Production Startup:
    gunicorn wsgi:app \
        --bind 0.0.0.0:${PORT:-5000} \
        --workers 4 \
        --threads 2 \
        --timeout 120 \
        --access-logfile - \
        --error-logfile -

Worker count recommendation:
    Standard formula: (2 x $NUM_CORES) + 1 (usually 2 to 4 workers on Render/containers).
"""

import os
from app import create_app
from config import Config

app = create_app(Config)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

