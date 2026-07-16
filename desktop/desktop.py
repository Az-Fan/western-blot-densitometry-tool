"""Optional Windows desktop wrapper for the web application."""
from __future__ import annotations

import sys
import threading
import os
from http.server import ThreadingHTTPServer
from pathlib import Path

import webview

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from server import Handler


APP_TITLE = "Western Blot Densitometry Tool"


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    host, port = server.server_address
    worker = threading.Thread(target=server.serve_forever, name="wb-local-server", daemon=True)
    worker.start()

    window = webview.create_window(
        APP_TITLE,
        f"http://{host}:{port}/",
        width=1440,
        height=920,
        min_size=(980, 680),
        confirm_close=False,
        text_select=True,
    )

    def stop_server() -> None:
        server.shutdown()
        server.server_close()

    window.events.closed += stop_server
    storage_path = str(Path(os.environ.get("LOCALAPPDATA", Path.home())) / "WB-Densitometry" / "WebView")
    webview.start(gui="edgechromium", private_mode=False, storage_path=storage_path)


if __name__ == "__main__":
    main()
