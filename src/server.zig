const std = @import("std");
const posix = std.posix;
const linux = std.os.linux;
const Connection = @import("connection.zig").Connection;
const handler = @import("connection.zig");
const router = @import("router.zig");
const Logger = @import("logger.zig").Logger;

const TIMEOUT_SECS: i64 = 30;
const EPOLL_WAIT_MS: i32 = 5000; // check for timeouts every 5s

pub fn run(port: u16, r: *const router.Router) !void {
    //initialize logging
    var log = try Logger.init("logs/access.log");
    defer log.deinit();
    std.fs.cwd().makeDir("logs") catch |err| {
        if (err != error.PathAlreadyExists) return err;
    };

    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // epoll instance
    const epoll_fd = try posix.epoll_create1(0);
    defer posix.close(epoll_fd);

    // server socket, ipv4 and TCP
    const server_fd = try posix.socket(posix.AF.INET, posix.SOCK.STREAM | posix.SOCK.NONBLOCK, 0);
    defer posix.close(server_fd);

    //reuse the same addr
    try posix.setsockopt(server_fd, posix.SOL.SOCKET, posix.SO.REUSEADDR, &std.mem.toBytes(@as(c_int, 1)));

    var addr = std.mem.zeroes(posix.sockaddr.in);
    addr.family = posix.AF.INET;
    addr.port = std.mem.nativeToBig(u16, port);
    addr.addr = 0;

    //bind the ip address and port
    try posix.bind(server_fd, @ptrCast(&addr), @sizeOf(posix.sockaddr.in));
    //128 queue limit
    try posix.listen(server_fd, 128);

    // watch server_fd for incoming connections
    var server_event = linux.epoll_event{
        .events = linux.EPOLL.IN,
        .data = .{ .fd = server_fd },
    };

    try posix.epoll_ctl(epoll_fd, linux.EPOLL.CTL_ADD, server_fd, &server_event);

    // use hashmap to connect fd to its connection
    var connections = std.AutoHashMap(posix.fd_t, *Connection).init(allocator);
    defer connections.deinit();

    //events holder, can only process 64 at one batch
    var events: [64]linux.epoll_event = undefined;
    std.debug.print("Listening on port {d} (epoll)\n", .{port});

    while (true) {
        // block until events are ready
        //this returns the number of events from epoll_fd, then copy itself to events for looping
        const n = posix.epoll_wait(epoll_fd, &events, EPOLL_WAIT_MS); //wake up every 5s to check for timeout

        //loop through the list
        for (events[0..n]) |event| {
            const fd: posix.fd_t = event.data.fd;

            if (fd == server_fd) {
                // new connection incoming
                var client_addr: posix.sockaddr.storage = undefined;
                var client_len: posix.socklen_t = @sizeOf(posix.sockaddr.storage);
                const client_fd = posix.accept(server_fd, @ptrCast(&client_addr), &client_len, posix.SOCK.NONBLOCK) catch |err| {
                    std.debug.print("Accept error: {}\n", .{err});
                    continue;
                };

                // allocate connection state
                const conn = try allocator.create(Connection);
                conn.* = Connection.init(client_fd);

                //add to hashmap
                try connections.put(client_fd, conn);

                // watch client_fd for readability
                var client_event = linux.epoll_event{
                    .events = linux.EPOLL.IN | linux.EPOLL.ET, // edge-triggered
                    .data = .{ .fd = client_fd }, //identification
                };

                try posix.epoll_ctl(epoll_fd, linux.EPOLL.CTL_ADD, client_fd, &client_event);
            } else {
                // existing connection has data
                if (connections.get(fd)) |conn| {
                    //pass down the router
                    const done = handler.handleEvent(conn, allocator, r, &log) catch true;
                    if (done) {
                        // remove from epoll, cleanup
                        try posix.epoll_ctl(epoll_fd, linux.EPOLL.CTL_DEL, fd, null);
                        _ = connections.remove(fd);
                        conn.deinit();
                        allocator.destroy(conn);
                    }
                }
            }
        }
        //we put all the timed out clients into a 64 array
        //TODO: if we want to make this bigger, we could allocate a heap allocator for this one.
        var timed_out: [64]posix.fd_t = undefined;
        var timed_out_count: usize = 0;

        //iterate through the hashmap using iterator
        var it = connections.iterator();
        //instead of deleting on the fly, we first list the timed out fds, then delete them next
        //this is to avoid undefined behavior
        while (it.next()) |entry| {
            if (timed_out_count >= timed_out.len) break;
            //so entry is a hashmap key, then we access its ptr value, then we get the actual pointer to connection
            if (entry.value_ptr.*.isTimedOut(TIMEOUT_SECS)) {
                timed_out[timed_out_count] = entry.key_ptr.*;
                timed_out_count += 1;
            }
        }
        //then remove separately
        for (timed_out[0..timed_out_count]) |fd| {
            if (connections.get(fd)) |conn| {
                std.debug.print("connection timeout fd={}\n", .{fd});
                posix.epoll_ctl(epoll_fd, linux.EPOLL.CTL_DEL, fd, null) catch {};
                _ = connections.remove(fd);
                conn.deinit();
                allocator.destroy(conn);
            }
        }
    }
}
