# zig-server

An HTTP/1.1 server written from scratch in Zig, with no dependencies beyond the
standard library. One thread, one Linux `epoll` loop, raw POSIX sockets, and
`sendfile` for static files. It serves my portfolio,
[redgabriel.me](https://redgabriel.me), from a 1 GB Azure VM behind Caddy.

About 800 lines of Zig. The stripped binary is about 310 KB, and the process
idles at roughly 0.3 MB of resident memory.

## Highlights

- **One thread, no blocking.** Every socket is non-blocking and registered
  with `epoll`. The loop sleeps in `epoll_wait` until the kernel reports ready
  sockets, handles only those, and goes back to sleep.
- **Zero-copy file serving.** Static files go out with `sendfile`, so their
  bytes are copied inside the kernel and never pass through the process.
- **Keep-alive and pipelining.** A connection serves requests until the client
  sends `Connection: close`. Leftover bytes from a pipelined request are kept
  for the next pass.
- **Bounded resources.** At most 500 open connections; a connection idle for
  60 seconds is closed; request headers are capped at 8 KB (`431` beyond that).
- **Small and readable.** Parser, router, response writer, MIME table, access
  log and stats each live in their own file of a few dozen lines.

## Results

Measured with [wrk](https://github.com/wg/wrk) against `/index.html`.

| Setup | Requests/s | Latency | Notes |
|---|---:|---:|---|
| Azure B2ats v2, 1 thread, 200 connections, 30 s | 13.1k | 15.5 ms avg | from the [write-up](https://redgabriel.me/blog/zig-server.html) |
| Azure B2ats v2, 10 threads, 200 connections | 760 | 33.5 ms avg | **unexplained**, see below |
| Local (WSL2, 12 cores), 2 threads, 100 connections, 10 s | 2.2k | 43.9 ms p50 | a known bug, see below |
| Local, same, against `GET /health` | 28k–47k | 2.2 ms p50 | one write per response |

The last two rows are the interesting part. A single-write response (`/health`)
answers in under a millisecond, but every static file waits about 44 ms. The
static path sends the headers with `send` and then the body with `sendfile`:
two small writes on one connection. Nagle's algorithm holds the second write
until the first is acknowledged, and the client delays that ACK by about
40 ms.

Setting `TCP_NODELAY` on accepted sockets, tried on a scratch build, took one
static request from 44 ms to 0.14 ms and the 100-connection run from 2.2k to
12.8k requests/s. That fix isn't in `main` yet.

To reproduce:

```bash
wrk -t2 -c100 -d10s --latency http://localhost:8080/index.html
```

```bash
wrk -t1 -c1 -d3s --latency http://localhost:8080/index.html
```

## How it works

```text
listen socket ─┐
client fd 7  ──┼──▶ epoll ──▶ epoll_wait()  (sleeps until a socket is ready, at most 5 s)
client fd 8  ──┘                 │
                                 ├─ listen fd ready ─▶ accept(), register the new fd (edge-triggered)
                                 │
                                 └─ client fd ready ─▶ recv() until EAGAIN
                                                        parse the request line, route it
                                                        send headers, then sendfile() the body
                                 then ─▶ close every connection idle for 60 s, loop
```

- **Request handling** (`src/connection.zig`). Each connection owns an 8 KB
  buffer. Bytes are read until `EAGAIN`; once a full header block
  (`\r\n\r\n`) is in, the request line is parsed and dispatched. If more
  bytes follow, they are moved to the front of the buffer and parsed next.
- **Routing** (`src/router.zig`). API routes (`/health`, `/stats`,
  `/api/contact`) are matched first, then the path is served from `public/`.
  The query string is dropped before matching, so `style.css?v=8` serves
  `style.css`; that is how the site busts its year-long asset cache. Any path
  containing `..` is rejected with `400`.
- **Caching** (`src/router.zig`). CSS, JS, images and fonts get
  `max-age=31536000, immutable`; HTML and everything else gets five minutes;
  API responses get `no-store`.
- **Stats** (`src/stats.zig`). `GET /stats` returns uptime, request and byte
  counters, rolling requests per second, open connections and RSS (read from
  `/proc/self/status`).
- **Logging** (`src/logger.zig`). One line per request in
  `logs/access.log`: timestamp, method, path, status, bytes, milliseconds.

## Known issues

These are the things I'm fixing, roughly in order:

- **Static files wait about 44 ms.** Headers and body are two writes, and
  Nagle plus delayed ACK holds the second (see [Results](#results)).
- **One slow client can stall the loop.** When the socket's send buffer is
  full, `sendfile` returns `EAGAIN` and the code retries on the spot instead of
  waiting for `EPOLLOUT`, so every other connection waits too.
- **Request bodies are never read.** A `POST` body stays in the buffer and is
  parsed as the next request, which fails with `400`.
- **The 10-thread result above is unexplained.** Ten wrk threads gave 17×
  fewer requests than one.
- **A fresh checkout crashes on start** unless `logs/` exists: the log file is
  opened before the directory is created.
- The `Keep-Alive: timeout=30` header doesn't match the real 60 s timeout, and
  `HTTP/1.0` requests are rejected.
- There are no tests yet.

## Run

You need [Zig 0.15.2](https://ziglang.org/download/) and Linux (the server
uses `epoll` and `sendfile`).

```bash
zig build -Doptimize=ReleaseSafe
```

```bash
mkdir -p logs
```

```bash
./zig-out/bin/zig-server
```

Run it from the repository root: it serves `./public` and writes
`./logs/access.log`. It listens on port 8080 (set in `src/main.zig`). Then open
<http://localhost:8080>.

```bash
curl -i http://localhost:8080/health
```

```bash
curl -s http://localhost:8080/stats
```

## Deployment

The production box is an Azure B2ats v2 VM (2 vCPU, 1 GB). Caddy terminates
TLS and proxies plain HTTP/1.1 to the server on port 8080; systemd runs it as
a service; the firewall allows only ports 22, 80 and 443. The full story is in
the [write-up](https://redgabriel.me/blog/zig-server.html).

## The site in `public/`

The portfolio is plain HTML, CSS and JavaScript with no build step. Page
content lives in `public/data/*.json` and is rendered by small scripts in
`public/js/`; the browser-window frame and status bar are shared components in
`public/js/layout.js`. CSS and JS links carry a `?v=N` version, so a change
needs a bump of that number.

## Layout

```text
src/
  main.zig          route table, entry point (port 8080)
  server.zig        epoll loop, accept, idle sweep, connection cap
  connection.zig    per-connection buffer, read loop, keep-alive, pipelining
  router.zig        API routes, static files, sendfile, cache headers
  http/
    parser.zig      request line and Connection header
    response.zig    status line and headers
    mime.zig        content types by extension
  api/handlers.zig  /health, /stats, /api/contact
  stats.zig         counters and RSS
  logger.zig        access log
public/             the site this server serves
```

## License

MIT, see [LICENCE](LICENCE).
