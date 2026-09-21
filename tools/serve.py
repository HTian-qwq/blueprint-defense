"""Serve the built game locally. No third-party dependencies are required."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class GameHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(302)
            self.send_header('Location', '/blueprint_defense.html')
            self.end_headers()
            return
        super().do_GET()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8770)
    args = parser.parse_args()
    dist = Path(__file__).resolve().parents[1] / 'dist'
    if not (dist / 'blueprint_defense.html').is_file():
        parser.error('Build the game first: python tools/build.py')
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(GameHandler, directory=str(dist)))
    except OSError as error:
        parser.exit(1, f'Cannot start local server on port {args.port}: {error}\n')
    print(f'Blueprint Defense: http://127.0.0.1:{server.server_port}/blueprint_defense.html', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
