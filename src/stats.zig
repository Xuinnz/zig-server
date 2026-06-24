const std = @import("std");

pub const Stats = struct {
    start_time: i64,
    total_requests: std.atomic.Value(u64),
    total_bytes_sent: std.atomic.Value(u64),
    active_connections: std.atomic.Value(u64),
    errors: std.atomic.Value(u64),
    last_window_requests: std.atomic.Value(u64),
    last_window_time: i64,

    pub fn init() Stats {
        return .{
            .start_time = std.time.timestamp(),
            .total_requests = std.atomic.Value(u64).init(0),
            .total_bytes_sent = std.atomic.Value(u64).init(0),
            .active_connections = std.atomic.Value(u64).init(0),
            .errors = std.atomic.Value(u64).init(0),
            .last_window_requests = std.atomic.Value(u64).init(0),
            .last_window_time = std.time.timestamp(),
        };
    }

    pub fn recordRequest(self: *Stats, bytes_sent: usize, is_error: bool) void {
        _ = self.total_requests.fetchAdd(1, .monotonic);
        _ = self.total_bytes_sent.fetchAdd(bytes_sent, .monotonic);
        if (is_error) _ = self.errors.fetchAdd(1, .monotonic);
    }

    pub fn connectionOpened(self: *Stats) void {
        _ = self.active_connections.fetchAdd(1, .monotonic);
    }

    pub fn connectionClosed(self: *Stats) void {
        _ = self.active_connections.fetchSub(1, .monotonic);
    }

    pub fn uptimeSeconds(self: *const Stats) i64 {
        return std.time.timestamp() - self.start_time;
    }

    pub fn rssKb() !u64 {
        const file = try std.fs.openFileAbsolute("/proc/self/status", .{});
        defer file.close();
        var buf: [4096]u8 = undefined;
        const n = try file.readAll(&buf);
        const content = buf[0..n];
        var lines = std.mem.splitSequence(u8, content, "\n");
        while (lines.next()) |line| {
            if (std.mem.startsWith(u8, line, "VmRSS:")) {
                const rest = std.mem.trim(u8, line[6..], " \t");
                const space = std.mem.indexOf(u8, rest, " ") orelse rest.len;
                return std.fmt.parseInt(u64, rest[0..space], 10) catch 0;
            }
        }
        return 0;
    }

    pub fn toJson(self: *Stats, buf: []u8) ![]u8 {
        const reqs = self.total_requests.load(.monotonic);
        const bytes = self.total_bytes_sent.load(.monotonic);
        const active = self.active_connections.load(.monotonic);
        const errs = self.errors.load(.monotonic);
        const uptime = self.uptimeSeconds();
        const rss = rssKb() catch 0;

        const uptime_safe: u64 = if (uptime <= 0) 1 else @intCast(uptime);
        const throughput_bps = bytes / uptime_safe;
        const lifetime_rps = reqs / uptime_safe;

        // rolling rps over last 5 seconds
        const window_reqs = reqs - self.last_window_requests.load(.monotonic);
        const window_time = std.time.timestamp() - self.last_window_time;
        const rolling_rps: u64 = if (window_time > 0)
            window_reqs / @as(u64, @intCast(window_time))
        else
            lifetime_rps;

        if (window_time >= 5) {
            self.last_window_requests.store(reqs, .monotonic);
            self.last_window_time = std.time.timestamp();
        }

        return std.fmt.bufPrint(buf,
            \\{{
            \\  "uptime_seconds": {d},
            \\  "total_requests": {d},
            \\  "requests_per_second": {d},
            \\  "rolling_requests_per_second": {d},
            \\  "total_bytes_sent": {d},
            \\  "throughput_bytes_per_second": {d},
            \\  "active_connections": {d},
            \\  "errors": {d},
            \\  "memory_rss_kb": {d}
            \\}}
        , .{ uptime, reqs, lifetime_rps, rolling_rps, bytes, throughput_bps, active, errs, rss });
    }
};
