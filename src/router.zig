const std = @import("std");
const posix = std.posix;
const response = @import("http/response.zig");
const mime = @import("http/mime.zig");

pub const HandlerFn = *const fn (fd: posix.fd_t, allocator: std.mem.Allocator, keep_alive: bool) anyerror!usize;

pub const Route = struct {
    method: []const u8,
    path: []const u8,
    handler: HandlerFn,
};

pub const DispatchResult = struct {
    status: u16,
    bytes_sent: usize,
};

const ServeResult = struct {
    found: bool,
    bytes_sent: usize,
};

//Router initialize and dispatch
pub const Router = struct {
    routes: []const Route,

    pub fn init(routes: []const Route) Router {
        return .{ .routes = routes };
    }

    //response
    pub fn dispatch(
        self: *const Router,
        method: []const u8,
        path: []const u8,
        fd: posix.fd_t,
        allocator: std.mem.Allocator,
        keep_alive: bool,
    ) !DispatchResult {
        // //if a request contains "..", they're try to access outside public folder, return bad request
        if (std.mem.indexOf(u8, path, "..") != null) {
            try sendError(fd, .bad_request, keep_alive);
            return .{ .status = 400, .bytes_sent = 0 };
        }

        //we check api if the route is existing in
        for (self.routes) |route| {
            if (std.mem.eql(u8, route.method, method) and std.mem.eql(u8, route.path, path)) {
                const bytes = try route.handler(fd, allocator, keep_alive);
                return .{ .status = 200, .bytes_sent = bytes };
            }
        }

        //if no api exist, we check files
        const result = try serveStatic(fd, path, keep_alive);
        if (result.found) return .{ .status = 200, .bytes_sent = result.bytes_sent };

        try sendError(fd, .not_found, keep_alive);
        return .{ .status = 404, .bytes_sent = 0 };
    }
};
//serving file
fn serveStatic(fd: posix.fd_t, path: []const u8, keep_alive: bool) !ServeResult {
    var file_path_buf: [512]u8 = undefined;
    //if path is "/", we go to index.html
    const normalized = if (std.mem.eql(u8, path, "/")) "/index.html" else path;

    const file_path = std.fmt.bufPrint(&file_path_buf, "public{s}", .{normalized}) catch {
        std.debug.print("bufPrint failed for path: {s}\n", .{normalized});
        return .{ .found = false, .bytes_sent = 0 };
    };

    const file = std.fs.cwd().openFile(file_path, .{}) catch |err| {
        std.debug.print("openFile failed: {} for path: {s}\n", .{ err, file_path });
        return .{ .found = false, .bytes_sent = 0 };
    };

    defer file.close();

    const stat = file.stat() catch |err| {
        std.debug.print("stat failed: {}\n", .{err});
        return .{ .found = false, .bytes_sent = 0 };
    };
    const file_size = stat.size;

    const ext = std.fs.path.extension(file_path);
    const content_type = mime.fromExtension(ext);

    var header_buf: [512]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&header_buf);

    const cache = getCacheControl(path);

    //send header first
    try response.writeHeaders(fbs.writer(), .ok, content_type, file_size, keep_alive, cache);
    _ = try posix.send(fd, fbs.getWritten(), 0);

    //send body
    try sendFile(fd, file, file_size);

    return .{ .found = true, .bytes_sent = file_size };
}

//instead of copying the file to user space, we just copy the file inside kernel
fn sendFile(socket_fd: posix.fd_t, file: std.fs.File, file_size: u64) !void {
    const linux = std.os.linux;
    var offset: i64 = 0;
    var remaining: usize = @intCast(file_size);

    while (remaining > 0) {
        const chunk = @min(remaining, 1024 * 1024 * 512);
        const sent = linux.sendfile(socket_fd, file.handle, &offset, chunk);
        const err = posix.errno(sent);

        std.debug.print("sendfile returned: {}, errno: {}\n", .{ sent, err });

        switch (err) {
            .SUCCESS => {
                remaining -= sent;
            },
            .AGAIN => continue,
            .INTR => continue,
            else => return posix.unexpectedErrno(err),
        }
    }
}

fn sendError(fd: posix.fd_t, code: response.StatusCode, keep_alive: bool) !void {
    var buf: [256]u8 = undefined;
    var fbs = std.io.fixedBufferStream(&buf);
    try response.write(fbs.writer(), code, "text/plain", response.statusText(code), keep_alive, .none);
    _ = try posix.send(fd, fbs.getWritten(), 0);
}

fn getCacheControl(path: []const u8) response.CacheControl {
    const ext = std.fs.path.extension(path);
    // long cache for static assets
    if (std.mem.eql(u8, ext, ".css")) return .long;
    if (std.mem.eql(u8, ext, ".js")) return .long;
    if (std.mem.eql(u8, ext, ".png")) return .long;
    if (std.mem.eql(u8, ext, ".jpg")) return .long;
    if (std.mem.eql(u8, ext, ".ico")) return .long;
    if (std.mem.eql(u8, ext, ".woff")) return .long;
    if (std.mem.eql(u8, ext, ".woff2")) return .long;
    if (std.mem.eql(u8, ext, ".html")) return .short;
    return .short;
}
