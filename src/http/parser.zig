const std = @import("std");
const posix = std.posix;

//http request, will add more
const HttpRequest = struct {
    method: []const u8,
    path: []const u8,
    version: []const u8,
    connection: []const u8,
};

//http errors, will add more
const ParseError = error{
    InvalidMethod,
    InvalidPath,
    InvalidProtocol,
    MalformedRequestLine,
};

//http parser
pub fn parseRequestLine(line: []const u8) ParseError!HttpRequest {
    const first_space_idx = std.mem.indexOfScalar(u8, line, ' ') orelse return error.MalformedRequestLine;
    const method = line[0..first_space_idx];

    //TODO: add more request method
    //only GET and POST is recognized for now
    if (!std.mem.eql(u8, method, "GET") and !std.mem.eql(u8, method, "POST")) {
        return error.InvalidMethod;
    }

    const remaining = line[first_space_idx + 1 ..];
    const second_space_idx = std.mem.indexOfScalar(u8, remaining, ' ') orelse return error.MalformedRequestLine;

    const path = remaining[0..second_space_idx];

    if (path.len == 0 or path[0] != '/') {
        return error.InvalidPath;
    }

    const version = remaining[second_space_idx + 1 ..];
    if (!std.mem.eql(u8, version, "HTTP/1.1")) {
        return error.InvalidProtocol;
    }

    return HttpRequest{
        .method = method,
        .path = path,
        .version = version,
        .connection = "keep-alive",
    };
}

//parse header connection
pub fn parseConnection(headers: []const u8) []const u8 {
    var lines = std.mem.splitSequence(u8, headers, "\r\n");
    while (lines.next()) |line| {
        //prune
        if (line.len < 12) continue;
        //case-insensitive
        var lower_buf: [64]u8 = undefined;
        const prefix_len = @min(line.len, 11);
        const prefix = std.ascii.lowerString(lower_buf[0..prefix_len], line[0..prefix_len]);
        if (std.mem.eql(u8, prefix, "connection:")) {
            //trim all spaces
            const value = std.mem.trim(u8, line[11..], " ");
            var lower_val: [32]u8 = undefined;
            const var_len = @min(value.len, 32);
            //if it explicitly says close, we close it. otherwise, we keep it alive
            return if (std.mem.eql(
                u8,
                std.ascii.lowerString(lower_val[0..var_len], value[0..var_len]),
                "close",
            )) "close" else "keep-alive";
        }
    }
    //default
    return "keep-alive";
}
