package com.collabdesk.controller;

import com.collabdesk.domain.entity.User;
import com.collabdesk.dto.request.CreateCommentRequest;
import com.collabdesk.dto.response.CommentResponse;
import com.collabdesk.service.CommentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/issues/{issueId}/comments")
@RequiredArgsConstructor
public class CommentController {

    private final CommentService commentService;

    @GetMapping
    public List<CommentResponse> list(
            @PathVariable UUID issueId,
            @AuthenticationPrincipal User user) {
        return commentService.list(issueId, user);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CommentResponse create(
            @PathVariable UUID issueId,
            @Valid @RequestBody CreateCommentRequest req,
            @AuthenticationPrincipal User user) {
        return commentService.create(issueId, req, user);
    }

    @DeleteMapping("/{commentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @PathVariable UUID issueId,
            @PathVariable UUID commentId,
            @AuthenticationPrincipal User user) {
        commentService.delete(issueId, commentId, user);
    }
}
