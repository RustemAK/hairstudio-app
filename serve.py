"""
HairStudio Local Server & Mobile Access Launcher
Run this script to launch the app locally and access it from your iPhone / Android.

Usage:
  python serve.py          # localhost only (safe)
  python serve.py --lan    # accessible from LAN (for mobile testing)
"""

import http.server
import socket
import socketserver
import webbrowser
import os
import sys

# Ensure UTF-8 output in Windows console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

PORT = 8080

# Allowed file extensions to serve (blocks .git/, .py, etc.)
ALLOWED_EXTENSIONS = {'.html', '.css', '.js', '.json', '.jpg', '.jpeg', '.png', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf'}

class SafeHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler that blocks access to sensitive files."""

    def do_GET(self):
        # Normalize path
        path = self.path.split('?')[0].split('#')[0]

        # Block dotfiles and dotfolders (.git, .env, etc.)
        if '/.' in path or path.startswith('.'):
            self.send_error(403, 'Forbidden')
            return

        # Block access to Python files
        if path.endswith('.py') or path.endswith('.pyc'):
            self.send_error(403, 'Forbidden')
            return

        # For files (not directories), check extension whitelist
        _, ext = os.path.splitext(path)
        if ext and ext.lower() not in ALLOWED_EXTENSIONS and path != '/':
            self.send_error(403, 'Forbidden')
            return

        super().do_GET()

    # Suppress request logging noise
    def log_message(self, format, *args):
        pass

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.json': 'application/json',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
    }


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need to be reachable, just triggers local IP resolution
        s.connect(('8.8.8.8', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def run_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # By default bind to localhost only (safe); use --lan for network access
    lan_mode = '--lan' in sys.argv
    bind_addr = '' if lan_mode else '127.0.0.1'
    local_ip = get_local_ip()

    with socketserver.TCPServer((bind_addr, PORT), SafeHandler) as httpd:
        print("=" * 60)
        print("   ✂️  HairStudio — Сервер запущен успешно!")
        print("=" * 60)
        print(f"\n💻 На этом компьютере:")
        print(f"   👉 http://localhost:{PORT}")
        if lan_mode:
            print(f"\n📱 На iPhone / Android (в той же сети Wi-Fi):")
            print(f"   👉 http://{local_ip}:{PORT}")
        else:
            print(f"\n📱 Для доступа с телефона запустите:")
            print(f"   👉 python serve.py --lan")
        print("\n📲 Как установить приложение на телефон:")
        print("   • На iPhone: Откройте ссылку в Safari -> Поделиться -> На экран 'Домой'")
        print("   • На Android: Откройте ссылку в Chrome -> Меню (3 точки) -> Установить приложение")
        print("=" * 60)
        print("Нажмите Ctrl + C для остановки сервера.\n")

        # Open in browser automatically
        try:
            webbrowser.open(f"http://localhost:{PORT}")
        except Exception:
            pass

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nСервер остановлен.")
            sys.exit(0)

if __name__ == '__main__':
    run_server()

