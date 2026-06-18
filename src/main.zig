const std = @import("std");
const server = @import("server.zig");
const router = @import("router.zig");
const handlers = @import("api/handlers.zig");

// applicable routes table.
const routes = [_]router.Route{
    .{ .method = "GET", .path = "/health", .handler = handlers.health },
    .{ .method = "POST", .path = "/api/contact", .handler = handlers.contact },
};

pub fn main() !void {
    const r = router.Router.init(&routes);
    try server.run(8080, &r);
}
