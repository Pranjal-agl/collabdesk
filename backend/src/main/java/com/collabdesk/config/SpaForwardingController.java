package com.collabdesk.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * Angular owns client-side routing (e.g. /projects/abc/issues/def). When a
 * browser requests one of those paths directly (a refresh, a bookmark, a
 * shared link), Spring's default static-resource handler has no file at
 * that path and would 404. This forwards any such path to index.html so
 * Angular's router can take over and resolve it client-side.
 *
 * The regex excludes paths whose last segment contains a dot, so real
 * static assets (main.js, styles.css, favicon.ico, ...) are left alone and
 * served normally.
 */
@Controller
public class SpaForwardingController {

    @RequestMapping(value = { "/{path:^(?!api|ws|actuator|h2-console)[^\\.]+}", "/**/{path:[^\\.]+}" })
    public String forward() {
        return "forward:/index.html";
    }
}
