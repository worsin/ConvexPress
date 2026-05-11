import { describe, expect, test } from "bun:test";

import {
  buildNotificationFromEvent,
  interpolateTemplate,
  resolveNotificationRecipients,
} from "../notification";
import { NOTIFICATION_KEYS } from "../../notifications/validators";

describe("notification helpers", () => {
  test("interpolateTemplate keeps unknown placeholders and renders known values", () => {
    expect(
      interpolateTemplate("Hello {name}, see {missing}.", {
        name: "Ava",
      }),
    ).toBe("Hello Ava, see {missing}.");
  });

  test("builds public comment reply notifications with blog anchors", () => {
    const notification = buildNotificationFromEvent(
      "comment.replied",
      NOTIFICATION_KEYS.COMMENT_REPLY,
      {
        actorName: "Editor Jane",
        postTitle: "Premium Post",
        postSlug: "premium-post",
        commentId: "comment_123",
        parentCommentId: "comment_parent",
      },
    );

    expect(notification).toMatchObject({
      title: "Comment Reply",
      message: 'Editor Jane replied to your comment on "Premium Post".',
      actionUrl: "/blog/premium-post#comment-comment_123",
      actionLabel: "View Reply",
      groupKey: "comment.replied:comment_parent",
    });
  });

  test("builds support, KB, and subscription notifications from route metadata", () => {
    const ticketAssigned = buildNotificationFromEvent(
      "ticket.assigned",
      NOTIFICATION_KEYS.TICKET_ASSIGNED,
      {
        ticketId: "ticket_42",
        ticketNumber: "42",
      },
    );
    const kbReview = buildNotificationFromEvent(
      "kb.workflow_step_ready",
      NOTIFICATION_KEYS.KB_WORKFLOW_STEP_READY,
      {
        stepName: "Editorial Review",
        articleTitle: "Getting Started",
        articleId: "article_7",
        articleWorkflowId: "workflow_7",
      },
    );
    const subscriptionCreated = buildNotificationFromEvent(
      "commerce.subscription_created",
      NOTIFICATION_KEYS.SUBSCRIPTION_CREATED,
      {
        subscriptionId: "sub_9",
      },
    );

    expect(ticketAssigned).toMatchObject({
      actionUrl: "/admin/tickets/ticket_42",
      groupKey: "ticket.assigned:ticket_42",
    });
    expect(kbReview).toMatchObject({
      message: 'Review step "Editorial Review" is ready for "Getting Started".',
      actionUrl: "/admin/kb/article_7/edit",
      groupKey: "kb.workflow_step_ready:workflow_7",
    });
    expect(subscriptionCreated).toMatchObject({
      message: "Your subscription is now active.",
      actionUrl: "/dashboard/subscriptions/sub_9",
      groupKey: "commerce.subscription_created:sub_9",
    });
  });

  test("honors explicit payload key overrides for employee and customer recipients", async () => {
    const ctx = { db: {} } as any;

    await expect(
      resolveNotificationRecipients(
        ctx,
        "employee",
        {
          assignedTo: "user_employee_1",
          authorId: "ignored_author",
        },
        ["assignedTo"],
      ),
    ).resolves.toEqual(["user_employee_1"]);

    await expect(
      resolveNotificationRecipients(
        ctx,
        "customer",
        {
          parentAuthorId: "user_customer_1",
          userId: "ignored_customer",
        },
        ["parentAuthorId"],
      ),
    ).resolves.toEqual(["user_customer_1"]);
  });
});
