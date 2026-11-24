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
    private static final String EVIL_PROJECT_ID    = "20000000-0000-0000-0000-000000000001";

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

    @Test
    @DisplayName("A cached Acme issue is never served to Eve — cache keys include the tenant")
    void cachedIssueStaysInItsTenant() throws Exception {
        String aliceToken = loginAs("alice@acme.com", "admin123");
        String eveToken = loginAs("eve@evil.com", "admin123");

        // Alice warms the cache first...
        mvc.perform(get("/api/projects/{projectId}/issues/{issueId}", ACME_PROJECT_ID, ACME_ISSUE_ID)
                        .header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isOk());
        // ...and Eve asking for the same ids must still be refused.
        mvc.perform(get("/api/projects/{projectId}/issues/{issueId}", ACME_PROJECT_ID, ACME_ISSUE_ID)
                        .header("Authorization", "Bearer " + eveToken))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("A cached Acme project is never served to Eve")
    void cachedProjectStaysInItsTenant() throws Exception {
        String aliceToken = loginAs("alice@acme.com", "admin123");
        String eveToken = loginAs("eve@evil.com", "admin123");

        mvc.perform(get("/api/projects/{projectId}", ACME_PROJECT_ID)
                        .header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isOk());
        mvc.perform(get("/api/projects/{projectId}", ACME_PROJECT_ID)
                        .header("Authorization", "Bearer " + eveToken))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("An issue is only reachable under its own project's URL")
    void issueUnderWrongProjectIs404() throws Exception {
        String aliceToken = loginAs("alice@acme.com", "admin123");

        mvc.perform(get("/api/projects/{projectId}/issues/{issueId}", EVIL_PROJECT_ID, ACME_ISSUE_ID)
                        .header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Bob (member) cannot delete a project Alice created — expects 403")
    void memberCannotDeleteSomeoneElsesProject() throws Exception {
        String bobToken = loginAs("bob@acme.com", "admin123");

        mvc.perform(delete("/api/projects/{projectId}", ACME_PROJECT_ID)
                        .header("Authorization", "Bearer " + bobToken))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Eve cannot delete Acme's project — expects 404, not 403, so ids don't leak")
    void eveCannotDeleteAcmeProject() throws Exception {
        String eveToken = loginAs("eve@evil.com", "admin123");

        mvc.perform(delete("/api/projects/{projectId}", ACME_PROJECT_ID)
                        .header("Authorization", "Bearer " + eveToken))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("The user directory only lists your own workspace, without emails")
    void userDirectoryIsTenantScoped() throws Exception {
        String eveToken = loginAs("eve@evil.com", "admin123");

        mvc.perform(get("/api/users").header("Authorization", "Bearer " + eveToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].displayName").value("Eve Attacker"))
                .andExpect(jsonPath("$[0].email").doesNotExist());
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
