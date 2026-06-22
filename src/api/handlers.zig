const std = @import("std");
const posix = std.posix;
const response = @import("../http/response.zig");

pub fn health(fd: posix.fd_t, allocator: std.mem.Allocator, keep_alive: bool) !usize {
    _ = allocator;
    const body = "{\"status\":\"ok\"}";
    var buf: [256]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    try response.write(fbs.writer(), .ok, "application/json", body, keep_alive, .none);
    _ = try posix.send(fd, fbs.getWritten(), 0);
    return body.len;
}

pub fn contact(fd: posix.fd_t, allocator: std.mem.Allocator, keep_alive: bool) !usize {
    _ = allocator;
    const body = "{\"message\":\"received\"}";
    var buf: [256]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    try response.write(fbs.writer(), .ok, "application/json", body, keep_alive, .none);
    _ = try posix.send(fd, fbs.getWritten(), 0);
    return body.len;
}
