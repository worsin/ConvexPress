import { test } from "./_fixtures";
import { smokeRoute } from "./_helpers";

test.describe.configure({ mode: "parallel" });

test("lms-overview [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/lms", { expectHeading: /LMS/ });
});

test("lms-courses [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/lms/courses", { expectHeading: /Courses/ });
});

test("lms-catalog [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/lms/catalog", { expectHeading: /Course Catalog/ });
});

test("lms-my-courses [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/lms/my-courses", { expectHeading: /My Learning/ });
});

test("lms-certificates [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/lms/certificates", {
		expectHeading: /Certificate Templates/,
	});
});

test("lms-verify [P1]", async ({ authedPage }) => {
	await smokeRoute(authedPage, "/lms/verify", { expectHeading: /Verify Certificate/ });
});
