package com.collabdesk.config;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.ShallowEtagHeaderFilter;

@Configuration
public class WebConfig {

    /**
     * Computes an ETag from the response body and short-circuits to 304 Not Modified
     * when the client's If-None-Match matches. Combined with the Cache-Control headers
     * set per-endpoint (see ProjectController/IssueController), this gives the browser
     * a real HTTP caching layer on top of the app-level Caffeine cache: within the
     * max-age window nothing is sent at all, and after it expires a matching ETag
     * still avoids re-transferring a body that hasn't changed.
     */
    @Bean
    public FilterRegistrationBean<ShallowEtagHeaderFilter> shallowEtagHeaderFilter() {
        FilterRegistrationBean<ShallowEtagHeaderFilter> bean =
                new FilterRegistrationBean<>(new ShallowEtagHeaderFilter());
        bean.addUrlPatterns("/api/*");
        return bean;
    }
}
