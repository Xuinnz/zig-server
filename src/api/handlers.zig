const std = @import("std");
const posix = std.posix;
const response = @import("../http/response.zig");

pub fn health(fd: posix.fd_t, allocator: std.mem.Allocator, keep_alive: bool) !void {
    _ = allocator;
    var buf: [256]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    try response.write(fbs.writer(), .ok, "application/json",
        \\{"status":"ok"}
    , keep_alive, .none);
    _ = try posix.send(fd, fbs.getWritten(), 0);
}

pub fn contact(fd: posix.fd_t, allocator: std.mem.Allocator, keep_alive: bool) !void {
    _ = allocator;
    var buf: [256]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    try response.write(fbs.writer(), .ok, "application/json",
        \\{"message":"received"}
    , keep_alive, .none);
    _ = try posix.send(fd, fbs.getWritten(), 0);
}
