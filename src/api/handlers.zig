const std = @import("std");
const posix = std.posix;
const response = @import("../http/response.zig");
const Stats = @import("../stats.zig").Stats;
var global_stats: *Stats = undefined;
pub fn init(s: *Stats) void {
    global_stats = s;
}

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

pub fn stats(fd: posix.fd_t, allocator: std.mem.Allocator, keep_alive: bool) !usize {
    _ = allocator;
    // stats is a global — we need access to it
    // pass it via a module-level pointer
    var buf: [1024]u8 = undefined;
    const json = try global_stats.toJson(&buf);

    var header_buf: [256]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&header_buf);
    try response.writeHeaders(fbs.writer(), .ok, "application/json", json.len, keep_alive, .none);
    _ = try posix.send(fd, fbs.getWritten(), 0);
    _ = try posix.send(fd, json, 0);
    return json.len;
}
