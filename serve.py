"""
HairStudio Local Server & Mobile Access Launcher
Run this script to launch the app locally and access it from your iPhone / Android.
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
    local_ip = get_local_ip()

    Handler = http.server.SimpleHTTPRequestHandler
    # Ensure correct MIME types
    Handler.extensions_map.update({
        '.json': 'application/json',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.jpg': 'image/jpeg',
        '.png': 'image/png'
    })

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("=" * 60)
        print("   ✂️  HairStudio — Сервер запущен успешно!")
        print("=" * 60)
        print(f"\n💻 На этом компьютере:")
        print(f"   👉 http://localhost:{PORT}")
        print(f"\n📱 На iPhone / Android (в той же сети Wi-Fi):")
        print(f"   👉 http://{local_ip}:{PORT}")
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
