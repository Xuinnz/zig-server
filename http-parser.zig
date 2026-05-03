const std = @import("std");
const posix = std.posix;

const HttpRequest = struct {
    method: []const u8,
    path: []const u8,
    version: []const u8,
};

const ParseError = error{
    InvalidMethod,
    InvalidPath,
    InvalidProtocol,
    MalformedRequestLine,
};

pub fn parseRequestLine(line: []const u8) ParseError!HttpRequest {
    const first_space_idx = std.mem.indexOfScalar(u8, line, ' ') orelse return error.MalformedRequestLine;
    const method = line[0..first_space_idx];

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
    };
}
