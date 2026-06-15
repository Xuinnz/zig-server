const std = @import("std");
const posix = std.posix;
const parser = @import("http/parser.zig");
const response = @import("http/response.zig");
const mime = @import("http/mime.zig");

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

pub fn handleEvent(conn: *Connection, allocator: std.mem.Allocator) !bool {
    switch (conn.phase) {
        .reading_headers => {
            //loop to get all data
            while (true) {
                //buffer full (8192)
                if (conn.total_read == conn.buffer.len) {
                    try sendError(conn.fd, .request_header_fields_too_large);
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
                        try sendError(conn.fd, .bad_request);
                        return true;
                    };

                    std.debug.print("{s} {s}\n", .{ request.method, request.path });

                    //req path, will move to routing soon
                    const path = if (std.mem.eql(u8, request.path, "/")) "/index.html" else request.path;
                    try serveFile(conn.fd, path, allocator);
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

fn sendError(fd: posix.fd_t, code: response.StatusCode) !void {
    var buf: [256]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    try response.write(fbs.writer(), code, "text/plain", response.statusText(code));
    _ = try posix.send(fd, fbs.getWritten(), 0);
}

fn sendStatic(fd: posix.fd_t, body: []const u8) !void {
    //TODO: this is 4KB limit, stream the file in chunks directly to posix.send
    var buf: [4096]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    try response.write(fbs.writer(), .ok, "text/plain", body);
    _ = try posix.send(fd, fbs.getWritten(), 0);
}

fn serveFile(fd: posix.fd_t, path: []const u8, allocator: std.mem.Allocator) !void {
    var file_path_buf: [512]u8 = undefined;
    //concat public to file path so they can only access these.
    const file_path = try std.fmt.bufPrint(&file_path_buf, "public{s}", .{path});

    //open and read the file
    const file = std.fs.cwd().openFile(file_path, .{}) catch {
        try sendError(fd, .not_found);
        return;
    };
    defer file.close();

    //file content load into the allocator, currently hard capped of 1MB
    const body = try file.readToEndAlloc(allocator, 1024 * 1024);
    defer allocator.free(body);

    //extract file extention
    const ext = std.fs.path.extension(file_path);
    const content_type = mime.fromExtension(ext);

    var header_buf: [512]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&header_buf);
    try response.writeHeaders(fbs.writer(), .ok, content_type, body.len);
    _ = try posix.send(fd, fbs.getWritten(), 0);

    // body
    _ = try posix.send(fd, body, 0);
}
