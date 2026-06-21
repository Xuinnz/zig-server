const std = @import("std");

//common status codes
pub const StatusCode = enum(u16) {
    ok = 200,
    not_found = 404,
    bad_request = 400,
    request_header_fields_too_large = 431,
    internal_server_error = 500,
};

pub fn statusText(code: StatusCode) []const u8 {
    return switch (code) {
        .ok => "OK",
        .not_found => "Not Found",
        .bad_request => "Bad Request",
        .request_header_fields_too_large => "Request Header Fields Too Large",
        .internal_server_error => "Internal Server Error",
    };
}

pub const CacheControl = enum {
    none,
    short,
    long,
};

pub fn cacheHeader(cache: CacheControl) []const u8 {
    return switch (cache) {
        .none => "Cache-Control: no-store\r\n",
        .short => "Cache-Control: public, max-age=300\r\n",
        .long => "Cache-Control: public, max-age=31536000, immutable\r\n",
    };
}

// for file serving only, this sends headers, send body separately
pub fn writeHeaders(
    writer: anytype,
    code: StatusCode,
    content_type: []const u8,
    content_length: usize,
    keep_alive: bool,
    cache: CacheControl,
) !void {
    try writer.print("HTTP/1.1 {d} {s}\r\n", .{ @intFromEnum(code), statusText(code) });
    try writer.print("Content-Type: {s}\r\n", .{content_type});
    try writer.print("Content-Length: {d}\r\n", .{content_length});
    try writer.writeAll(cacheHeader(cache));
    if (keep_alive) {
        try writer.writeAll("Connection: keep-alive\r\n");
        try writer.writeAll("Keep-Alive: timeout=30, max=100\r\n");
    } else {
        try writer.writeAll("Connection: close\r\n");
    }
    try writer.writeAll("\r\n");
}

//writer
pub fn write(
    writer: anytype,
    code: StatusCode,
    content_type: []const u8,
    body: []const u8,
    keep_alive: bool,
    cache: CacheControl,
) !void {
    try writeHeaders(writer, code, content_type, body.len, keep_alive, cache);
    try writer.writeAll(body);
}
