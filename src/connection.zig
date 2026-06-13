const std = @import("std");
const posix = std.posix;
const parser = @import("http/parser.zig");
const response = @import("http/response.zig");
const mime = @import("http/mime.zig");

pub fn handleClient(fd: posix.fd_t) !void {
    defer posix.close(fd);

    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    //limit of 8192 for buffer
    var buffer: [8192]u8 = undefined;
    var total_read: usize = 0;

    while (true) {
        //case: buffer full
        if (total_read == buffer.len) {
            std.debug.print("Buffer full, rejecting request\n", .{});
            try sendError(fd, .request_header_fields_too_large);
            return;
        }
        //receive
        const bytes_read = try posix.recv(fd, buffer[total_read..], 0);
        //client closed connection
        if (bytes_read == 0) return;

        total_read += bytes_read;
        const current_data = buffer[0..total_read];

        //header parser
        if (std.mem.indexOf(u8, current_data, "\r\n\r\n")) |_| {
            const req_line_end = std.mem.indexOf(u8, current_data, "\r\n") orelse 0;
            const req_line = current_data[0..req_line_end];

            const request = parser.parseRequestLine(req_line) catch {
                try sendError(fd, .bad_request);
                return;
            };

            std.debug.print("Method: {s}, Path: {s}\n", .{ request.method, request.path });

            const path = if (std.mem.eql(u8, request.path, "/")) "/index.html" else request.path;
            try serveFile(fd, path, allocator);
            return;
        }
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
