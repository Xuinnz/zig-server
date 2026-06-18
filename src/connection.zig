const std = @import("std");
const posix = std.posix;
const parser = @import("http/parser.zig");
const response = @import("http/response.zig");
const mime = @import("http/mime.zig");
const router = @import("router.zig");

//connection phases
pub const Phase = enum {
    reading_headers,
    done,
};

//connection struct
pub const Connection = struct {
    fd: posix.fd_t,
    buffer: [8192]u8,
    total_read: usize,
    phase: Phase,

    //initialize connection
    pub fn init(fd: posix.fd_t) Connection {
        return .{
            .fd = fd,
            .buffer = undefined,
            .total_read = 0,
            .phase = .reading_headers,
        };
    }

    pub fn deinit(self: *Connection) void {
        posix.close(self.fd);
    }
};

pub fn handleEvent(conn: *Connection, allocator: std.mem.Allocator, r: *const router.Router) !bool {
    switch (conn.phase) {
        .reading_headers => {
            //loop to get all data
            while (true) {
                //buffer full (8192)
                if (conn.total_read == conn.buffer.len) {
                    var buf: [128]u8 = undefined;
                    var fbs = std.io.fixedBufferStream(&buf);
                    try response.write(fbs.writer(), .request_header_fields_too_large, "text/plain", "Too Large");
                    _ = try posix.send(conn.fd, fbs.getWritten(), 0);
                    return true;
                }
                //receive data
                const bytes_read = posix.recv(conn.fd, conn.buffer[conn.total_read..], 0) catch |err| {
                    //no more data in the current buffer
                    if (err == error.WouldBlock) break;
                    return true;
                };

                //no data read, msg done
                if (bytes_read == 0) return true;

                conn.total_read += bytes_read;
                const data = conn.buffer[0..conn.total_read];

                //parse till end of header
                if (std.mem.indexOf(u8, data, "\r\n\r\n")) |_| {
                    const req_line_end = std.mem.indexOf(u8, data, "\r\n") orelse 0;
                    const req_line = data[0..req_line_end];

                    const request = parser.parseRequestLine(req_line) catch {
                        var buf: [128]u8 = undefined;
                        var fbs = std.io.fixedBufferStream(&buf);
                        try response.write(fbs.writer(), .bad_request, "text/plain", "Bad Request");
                        _ = try posix.send(conn.fd, fbs.getWritten(), 0);
                        return true;
                    };

                    std.debug.print("{s} {s}\n", .{ request.method, request.path });
                    //after getting the header, we load the route.
                    _ = try r.dispatch(request.method, request.path, conn.fd, allocator);
                    return true;
                }
            }
            //if err = wouldBlock, end of buffer but no end of header yet. connection persist.
            return false;
        },

        //connection finished.
        .done => return true,
    }
}
