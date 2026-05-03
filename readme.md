# zig web server
A zig web server created from scratch. 

## tcp.zig
A TCP Server of IPv4 that creates and binds the socket. This section contains all the things I learned when coding this.

```bash const sockfd = try posix.socket(posix.AF.INET, posix.SOCK.STREAM, 0);
const sockfd = try posix.socket(posix.AF.INET, posix.SOCK.STREAM, 0);
```

This makes a File Descriptor (FD) specifically a socket. it gives an integer of `3` since 1 and 2 is already used. if you create another file descriptor before that, the sockfd will be 4. `posix.AF.INET` means it's IPv4 (for IPv6, it's `INET6`).  `posix.SOCK.STREAM` means it's a TCP Connection (`posix.SOCK.DGRAM` for UDP, `posix.SOCK.RAW` for raw sockets means no standard transport layer).

```bash 
posix.setsockopt(sockfd, posix.SOL.SOCKET, posix.SO.REUSEADDR, std.mem.asBytes(&yes));
```

If you close a port and use it again, it will show `"Address already in use"`. This is because the OS dont release port instantly. This is used to force to reuse the port again.

```bash
var addr = std.mem.zeroes(posix.sockaddr.in);
addr.port = std.mem.nativeToBig(u16, 8080);
addr.addr = 0;
addr.family = posix.AF.INET; 
```
Creating the struct of raw socket address. this contains leftover data from the ram so we need to fill it with zeroes. then make the address port to 8080, and family to `INET` (IPv4).

```bash
posix.bind(sockfd, @as(*const posix.sockaddr, @ptrCast(&addr)), @sizeOf(posix.sockaddr.in));
```
Binding the socket address into the socket file descriptor. Basically it tells the OS that any traffic arriving on Port `8080` will be sent into this specific File Descriptor.

```bash 
 try posix.listen(sockfd, 128);
 ```
 This makes the file descriptor be ready to accept incoming connections. `128` means it can only have 128 connections in queue. 129th and above will get rejected (connection refuse).


### Hanlding Client
```bash
var client_addr: posix.sockaddr.storage = undefined;

```
This is needed to accept a client connection. This will store the client address when the posix.accept is successful.  `sockaddr.in`(16b) for ipv4, `sockaddr.in6` (24b) for  ipv6, and `sockaddr.storage` (128b) to accept any.

```bash 
var client_addr_len: posix.socklen_t = @sizeOf(posix.sockaddr.storage);
const client_fd = try posix.accept(sockfd, @as(*posix.sockaddr, @ptrCast(&client_addr)), &client_addr_len, 0);
```
To accept connections. when posix.accept is successful, we put the type, ip, port into client_addr. then make it a clientfd. this specific client_fd is used to talk with the  client_addr we just got.

```bash
var buffer: [8192]u8 = undefined;
var total_read: usize = 0;
```
used to store the message from the fd. buffer for 8192 chars only and total read to make sure that we dont go outside that.

```bash
const bytes_read = try posix.recv(fd, buffer[total_read..], 0);
```
We use `posix.recv` to listen on what is the fd trying to say. that [total_read..] is for memory slice.


```bash
try posix.send(fd, "HTTP/1.1 400 Bad Request\r\n\r\n", 0);
```
We use `posix.send` to send message to the client_fd. 


### HTTP Parser
A HTTP Parser that parses the header to make by its method, path, version. Adding more states soon.

```bash
const HttpRequest = struct {
    method: []const u8,
    path: []const u8,
    version: []const u8,
}; 
```
this three states are currently implemented. adding more soon.

### Purpose
For learning purposes only