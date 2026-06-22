const std = @import("std");

pub const Logger = struct {
    file: std.fs.File,
    mutex: std.Thread.Mutex,

    pub fn init(path: []const u8) !Logger {
        const file = try std.fs.cwd().createFile(path, .{
            .read = false,
            .truncate = false,
        });
        try file.seekFromEnd(0);
        return .{
            .file = file,
            .mutex = .{},
        };
    }

    pub fn deinit(self: *Logger) void {
        self.file.close();
    }

    pub fn log(
        self: *Logger,
        method: []const u8,
        path: []const u8,
        status: u16,
        bytes_sent: usize,
        duration_ms: u64,
    ) void {
        self.mutex.lock();
        defer self.mutex.unlock();

        const ts = std.time.timestamp();

        var buf: [512]u8 = undefined;
        var fbs = std.io.fixedBufferStream(&buf);

        fbs.writer().print("{d} {s} {s} {d} {d} {d}ms\n", .{
            ts,
            method,
            path,
            status,
            bytes_sent,
            duration_ms,
        }) catch return;
        self.file.writeAll(fbs.getWritten()) catch |err| {
            std.debug.print("log write failed: {}\n", .{err});
        };
    }
};
