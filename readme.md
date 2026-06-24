# zig-server

A zero-dependency HTTP/1.1 web server built from scratch in Zig.

## Features
- Raw POSIX sockets
- Edge-triggered epoll event loop
- Zero-copy file serving via sendfile()
- HTTP/1.1 Keep-Alive
- Cache-Control headers
- Path traversal protection
- Connection timeouts
- Structured file logging
- ~404KB RSS at idle

## Running locally
zig build -Doptimize=ReleaseSafe
./zig-out/bin/zig-server

## Architecture
[redgabriel.me/blog/zig-server.html]