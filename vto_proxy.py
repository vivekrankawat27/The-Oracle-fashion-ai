"""
Oracle VTO Image Proxy Server
Runs on port 7799 — fetches external images (Myntra, Amazon, etc.)
and serves them with Access-Control-Allow-Origin: * so Canvas can use them.

Usage:  python vto_proxy.py
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import urlopen, Request
from urllib.parse import urlparse, parse_qs, unquote
from urllib.error import URLError
import sys

ALLOWED_HOSTS = [
    'assets.myntassets.com', 'myntra.com', 'amazon.in', 'amazon.com',
    'ajio.com', 'nnnow.com', 'meesho.com', 'static.zara.net',
    'img.maximages.com', 'cdn.shopify.com', 'images.unsplash.com',
    'lh3.googleusercontent.com', 'storage.googleapis.com',
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.myntra.com/',
}


class ProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[VTO Proxy] {args[0]} {args[1]}")

    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        # Parse: GET /proxy?url=<encoded_url>
        parsed = urlparse(self.path)
        if parsed.path != '/proxy':
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Oracle VTO Proxy - use /proxy?url=<image_url>')
            return

        params = parse_qs(parsed.query)
        if 'url' not in params:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'Missing url parameter')
            return

        target_url = unquote(params['url'][0])
        target_host = urlparse(target_url).netloc.replace('www.', '')

        # Security: only proxy image domains
        allowed = any(h in target_host for h in ALLOWED_HOSTS)
        if not allowed:
            # Allow anyway for demo — remove this to restrict
            print(f"[VTO Proxy] Allowing unlisted host: {target_host}")

        try:
            req = Request(target_url, headers=HEADERS)
            with urlopen(req, timeout=12) as resp:
                content_type = resp.headers.get('Content-Type', 'image/jpeg')
                data = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.send_cors()
                self.end_headers()
                self.wfile.write(data)
        except URLError as e:
            print(f"[VTO Proxy] Fetch error: {e}")
            self.send_response(502)
            self.send_cors()
            self.end_headers()
            self.wfile.write(f'Proxy error: {e}'.encode())
        except Exception as e:
            print(f"[VTO Proxy] Unexpected error: {e}")
            self.send_response(500)
            self.send_cors()
            self.end_headers()


if __name__ == '__main__':
    PORT = 7799
    server = HTTPServer(('localhost', PORT), ProxyHandler)
    print(f"Oracle VTO Proxy running at http://localhost:{PORT}/proxy?url=<image_url>")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nProxy stopped.")
        sys.exit(0)
