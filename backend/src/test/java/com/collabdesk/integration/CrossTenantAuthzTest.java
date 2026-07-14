package com.collabdesk.integration;

import com.collabdesk.dto.request.LoginRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Proves row-level tenant isolation.
 * Eve (evil.com tenant) must NOT be able to read or mutate Acme's issues.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CrossTenantAuthzTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;

    // Issue belonging to Acme tenant (seeded in data.sql / test fixtures)
    private static final String ACME_PROJECT_ID    = "10000000-0000-0000-0000-000000000001";
    private static final String ACME_ISSUE_ID      = "30000000-0000-0000-0000-000000000001";

    @Test
    @DisplayName("Eve (Evil Corp) cannot read Acme's issue — expects 404")
    void eveCannotReadAcmeIssue() throws Exception {
        String eveToken = loginAs("eve@evil.com", "admin123");

        mvc.perform(get("/api/projects/{projectId}/issues/{issueId}",
                        ACME_PROJECT_ID, ACME_ISSUE_ID)
                        .header("Authorization", "Bearer " + eveToken))
                .andExpect(status().isNotFound()); // tenant filter hides it as 404
    }

    @Test
    @DisplayName("Alice (Acme Admin) can read her own issue — expects 200")
    void aliceCanReadOwnIssue() throws Exception {
        String aliceToken = loginAs("alice@acme.com", "admin123");

        mvc.perform(get("/api/projects/{projectId}/issues/{issueId}",
                        ACME_PROJECT_ID, ACME_ISSUE_ID)
                        .header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isOk());
    }

    private String loginAs(String email, String password) throws Exception {
        MvcResult result = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(new LoginRequest(email, password, "test-device"))))
                .andExpect(status().isOk())
                .andReturn();

        return mapper.readTree(result.getResponse().getContentAsString())
                .get("accessToken").asText();
    }
}
