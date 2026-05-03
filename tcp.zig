const std = @import("std");
const posix = std.posix;
const parser = @import("http-parser.zig");

pub fn main() !void {
    //create the socket
    //INET = ipv4 STREAM = TCP
    const sockfd = try posix.socket(posix.AF.INET, posix.SOCK.STREAM, 0);
    defer posix.close(sockfd); //close after running

    const yes: i32 = 1;
    try posix.setsockopt(sockfd, posix.SOL.SOCKET, posix.SO.REUSEADDR, std.mem.asBytes(&yes));

    //construct the raw socket addr
    var addr = std.mem.zeroes(posix.sockaddr.in); //fill with zeroes to flush garbage ram
    addr.port = std.mem.nativeToBig(u16, 8080); //make the port 8080
    addr.addr = 0; //connect to all. (1 if just loopback)
    addr.family = posix.AF.INET; //connect to ipv4

    //bind the socket
    try posix.bind(sockfd, @as(*const posix.sockaddr, @ptrCast(&addr)), @sizeOf(posix.sockaddr.in));

    //we can accept socket now
    try posix.listen(sockfd, 128);

    while (true) {
        //accept a client connection
        var client_addr: posix.sockaddr.storage = undefined;
        //socketaddr, socketaddr.in = 16b, can only accept ipv4
        //socketaddr.in6 = 24b, can accept ipv6
        //socketaddr.storage = 128b, can accept any
        var client_addr_len: posix.socklen_t = @sizeOf(posix.sockaddr.storage);
        const client_fd = try posix.accept(sockfd, @as(*posix.sockaddr, @ptrCast(&client_addr)), &client_addr_len, 0);

        handleClient(client_fd) catch |err| {
            std.debug.print("Client error: {}\n", .{err});
        };
    }
}
fn handleClient(fd: posix.fd_t) !void {
    defer posix.close(fd);

    var buffer: [8192]u8 = undefined;
    var total_read: usize = 0;
    while (true) {
        //if exceeded
        if (total_read == buffer.len) {
            std.debug.print("SECURITY: Headers exceed max", .{});
            const err_msg = "HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n";
            _ = try posix.send(fd, err_msg, 0);
            return;
        }

        const bytes_read = try posix.recv(fd, buffer[total_read..], 0);
        if (bytes_read == 0) return;

        total_read += bytes_read;
        const current_data = buffer[0..total_read];

        if (std.mem.indexOf(u8, current_data, "\r\n\r\n")) |idx| {
            const header_end_idx = std.mem.indexOf(u8, current_data, "\r\n") orelse idx;
            const req_line = current_data[0..header_end_idx];

            const request = parser.parseRequestLine(req_line) catch |err| {
                std.debug.print("Parse Error: {}\n", .{err});
                _ = try posix.send(fd, "HTTP/1.1 400 Bad Request\r\n\r\n", 0);
                return;
            };
            std.debug.print("Method: {s}, Path: {s}\n", .{ request.method, request.path });
            _ = try posix.send(fd, "HTTP/1.1 200 OK\r\n\r\nOK", 0);
            return; // Exit after handling
        }
    }
}
