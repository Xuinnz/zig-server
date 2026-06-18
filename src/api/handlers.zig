const std = @import("std");
const posix = std.posix;
const response = @import("../http/response.zig");

pub fn health(fd: posix.fd_t, allocator: std.mem.Allocator) !void {
    _ = allocator;
    var buf: [256]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    try response.write(fbs.writer(), .ok, "application/json",
        \\{"status": "ok}
    );
    _ = try posix.send(fd, fbs.getWritten(), 0);
}

pub fn contact(fd: posix.fd_t, allocator: std.mem.Allocator) !void {
    _ = allocator;
    var buf: [256]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    try response.write(fbs.writer(), .ok, "application/json",
        \\{"message": "received"}
    );
    _ = try posix.send(fd, fbs.getWritten(), 0);
}
