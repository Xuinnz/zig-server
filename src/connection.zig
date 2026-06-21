const std = @import("std");
const posix = std.posix;
const parser = @import("http/parser.zig");
const response = @import("http/response.zig");
const mime = @import("http/mime.zig");
const router = @import("router.zig");

//connection struct
pub const Connection = struct {
    fd: posix.fd_t,
    buffer: [8192]u8,
    total_read: usize,
    keep_alive: bool,

    //initialize connection
    pub fn init(fd: posix.fd_t) Connection {
        return .{
            .fd = fd,
            .buffer = undefined,
            .total_read = 0,
            .keep_alive = true,
        };
    }

    pub fn reset(self: *Connection) void {
        self.total_read = 0;
    }

    pub fn deinit(self: *Connection) void {
        posix.close(self.fd);
    }
};

//handle event socket
//if it returns true, it means that we can close the socket
//if false, we cannot return the socket yet.
pub fn handleEvent(conn: *Connection, allocator: std.mem.Allocator, r: *const router.Router) !bool {
    while (true) {
        //buffer is full,
        if (conn.total_read == conn.buffer.len) {
            try sendErrorDirect(conn.fd, .request_header_fields_too_large, false);
            return true;
        }

        const bytes_read = posix.recv(conn.fd, conn.buffer[conn.total_read..], 0) catch |err| {
            if (err == error.WouldBlock) return false; // waiting for the next request
            return true; //actual error, we return true
        };

        //client finished
        if (bytes_read == 0) return true;

        conn.total_read += bytes_read;
        const data = conn.buffer[0..conn.total_read];

        //full header
        const header_end = std.mem.indexOf(u8, data, "\r\n\r\n") orelse continue;
        const headers = data[0..header_end];

        //req line only (method, path, version)
        const req_line_end = std.mem.indexOf(u8, headers, "\r\n") orelse 0;
        const req_line = headers[0..req_line_end];

        //we parse the req line
        const request = parser.parseRequestLine(req_line) catch {
            try sendErrorDirect(conn.fd, .bad_request, false);
            return true;
        };

        //we parse the full header to check the keep-alive
        const keep_alive = std.mem.eql(u8, parser.parseConnection(headers), "keep-alive");
        conn.keep_alive = keep_alive;

        std.debug.print("{s} {s} (keep-alive: {})\n", .{ request.method, request.path, keep_alive });

        _ = try r.dispatch(request.method, request.path, conn.fd, allocator, keep_alive);

        if (!keep_alive) return true; // client wants to close

        // reset for next request on same connection
        // consume exactly the processed request from the buffer
        const consumed = header_end + 4; // 4 = len of "\r\n\r\n"
        const remaining = conn.total_read - consumed;
        if (remaining > 0) {
            // move leftover bytes (pipelined request) to front of buffer
            std.mem.copyForwards(u8, &conn.buffer, conn.buffer[consumed..conn.total_read]);
        }
        conn.total_read = remaining;
        // loop back and process next request
    }
}

fn sendErrorDirect(fd: posix.fd_t, code: response.StatusCode, keep_alive: bool) !void {
    var buf: [256]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    try response.write(fbs.writer(), code, "text/plain", response.statusText(code), keep_alive);
    _ = try posix.send(fd, fbs.getWritten(), 0);
}
