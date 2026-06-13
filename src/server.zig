const std = @import("std");
const posix = std.posix;
const connect = @import("connection.zig");

//thread wrapper
fn clientThread(fd: posix.fd_t) void {
    connect.handleClient(fd) catch |err| {
        std.debug.print("[Thread {}] Client Dropped: {}\n", .{ std.Thread.getCurrentId(), err });
    };
}

pub fn run(port: u16) !void {
    //file descriptor for the socket
    const sockfd = try posix.socket(posix.AF.INET, posix.SOCK.STREAM, 0);
    defer posix.close(sockfd);

    try posix.setsockopt(sockfd, posix.SOL.SOCKET, posix.SO.REUSEADDR, &std.mem.toBytes(@as(c_int, 1)));

    var addr = std.mem.zeroes(posix.sockaddr.in);
    addr.family = posix.AF.INET;
    addr.port = std.mem.nativeToBig(u16, port);
    addr.addr = 0;

    //bind to port 8080
    try posix.bind(sockfd, @ptrCast(&addr), @sizeOf(posix.sockaddr.in));
    //listen to the port, with 128 queue limit
    try posix.listen(sockfd, 128);

    while (true) {
        var client_addr: posix.sockaddr.storage = undefined; //to store the client addr
        var client_addr_len: posix.socklen_t = @sizeOf(posix.sockaddr.storage); //size of client_addr
        //create file descriptor for the client
        const client_fd = try posix.accept(sockfd, @as(*posix.sockaddr, @ptrCast(&client_addr)), &client_addr_len, 0);

        const timeout = posix.timeval{ .sec = 1, .usec = 0 };
        try posix.setsockopt(client_fd, posix.SOL.SOCKET, posix.SO.RCVTIMEO, std.mem.asBytes(&timeout));

        //create a thread for every client.
        const thread = try std.Thread.spawn(.{}, clientThread, .{client_fd});
        thread.detach();

        //currently, this is in multi-threading. this will work if low concurrent users
        //but it will due to 1:1 threads-clients ratio
        //TODO: implement epoll
    }
}
