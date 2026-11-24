package com.collabdesk.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * The React app owns client-side routing (/projects/abc/issues/def, /audit,
 * /auth/login). When a browser requests one of those paths directly (a
 * refresh, a bookmark, a shared link) there is no file at that path, so it
 * is forwarded to index.html and the client router takes over.
 *
 * Only the app's own route prefixes are listed, on purpose. The previous
 * catch-all ("any path without a dot") also swallowed the WebSocket
 * handshake at /ws/websocket — the controller mapping outranks the
 * WebSocket handler mapping — so in production the socket upgrade got
 * index.html instead of the STOMP endpoint and the app stayed "Offline".
 */
@Controller
public class SpaForwardingController {

    @GetMapping({ "/auth/**", "/projects", "/projects/**", "/audit" })
    public String forward() {
        return "forward:/index.html";
    }
}
