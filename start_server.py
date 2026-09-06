#!/usr/bin/env python3
"""
PrivBrowse — 1-Click Demo Server
Starts a local HTTP server and automatically opens test-form.html in your browser.
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    # Attempt to bind to PORT or find next available port
    global PORT
    for p in range(PORT, PORT + 20):
        try:
            httpd = socketserver.TCPServer(("", p), Handler)
            PORT = p
            break
        except OSError:
            continue
    else:
        print("Could not find open port between 8000 and 8020.")
        sys.exit(1)

    url = f"http://localhost:{PORT}/test-form.html"
    malicious_url = f"http://localhost:{PORT}/test-form-malicious.html"

    print("================================================================")
    print(" 🚀 PrivBrowse Demo Server Running!")
    print("================================================================")
    print(f" Clean Demo Form:       {url}")
    print(f" Malicious Attack Demo:  {malicious_url}")
    print("================================================================")
    print(" Opening Clean Form in your default browser...")
    print(" Press Ctrl+C to stop the server.")

    webbrowser.open(url)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping PrivBrowse demo server...")
        httpd.server_close()

if __name__ == "__main__":
    start_server()
