import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PromotionReviewView } from "./PromotionReviewView";
import { fixture } from "./promotionReviewFixture";
test('missing route-policy selection explains the required control and fresh preview',()=>{
 const html=renderToStaticMarkup(<PromotionReviewView review={{...fixture(),status:'failed',failureCode:'ROUTE_POLICY_SELECTION_REQUIRED',canApply:false}} now={100}/>);
 expect(html).toContain('Select “Include site access rules”');expect(html).toContain('create a new preview');
 expect(html).not.toContain('Check the environment connections');
});
test('reusable source review explains imported publication and retained history with escaped titles',()=>{
 const review=fixture();review.recordCount=2;
 review.authoredRecords.push({key:'synced:studio',kind:'syncedBlock',sourceRevision:'3',dataJson:JSON.stringify({title:'Shared studio',publishedRevision:2,revisions:[{revision:1,title:'Original <script>',tree:{contract:'canonical-promotion-tree-v1',blocks:[],references:[]}},{revision:2,title:'Current studio',tree:{contract:'canonical-promotion-tree-v1',blocks:[],references:[]}}]})});
 review.changes.push({key:'synced:studio',kind:'syncedBlock',targetId:'target-studio',beforeRevision:'previous',fields:['title','publishedRevision','revisions']});
 const html=renderToStaticMarkup(<PromotionReviewView review={review} now={100} expanded />);
 expect(html).toContain('Reusable content revisions');expect(html).toContain('Current publication');expect(html).toContain('Required by a pinned placement');expect(html).toContain('existing production history is retained');expect(html).toContain('Original &lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('could not be validated');
});

test("blocked review shows incoming values, blockers, hashes and explicit absence of apply", () => {
  const html = renderToStaticMarkup(<PromotionReviewView review={fixture()} now={100} />);
  expect(html).toContain("A verified image is required."); expect(html).toContain("need verified copies"); expect(html).toContain("manifest-digest");
  expect(html).toContain("A new apply is unavailable"); expect(html).not.toContain("<button");
  expect(html).not.toContain("<script>"); expect(html).not.toContain("<img src=x"); expect(html).toContain("&lt;script&gt;"); expect(html).toContain("Reviewed fields: title, content");
});
test("client expiry overrides stale ready state with a new-preview instruction", () => {
  const html = renderToStaticMarkup(<PromotionReviewView review={{ ...fixture(), status: "reviewed", reviewReady: true }} now={201} />);
  expect(html).toContain("Review expired"); expect(html).not.toContain("Review ready"); expect(html).toContain("Create a new preview");
});

test("malformed or non-allowlisted authored data renders an explicit invalid state without showing it", () => {
  for (const dataJson of ['{', JSON.stringify({ title: "private secret", userPassword: "never-render" }), 'x'.repeat(500_001)]) {
    const review = fixture(); review.authoredRecords[0].dataJson = dataJson;
    const html = renderToStaticMarkup(<PromotionReviewView review={review} now={100} />);
    expect(html).toContain("could not be validated"); expect(html).not.toContain("private secret"); expect(html).not.toContain("never-render");
  }
});

test("durable applied receipt remains applied after review expiry and never presents readiness", () => {
  const review = fixture();
  const html = renderToStaticMarkup(<PromotionReviewView now={300} review={{ ...review, status: "reviewed", applyState: { applyId: "apply" as NonNullable<typeof review.applyState>["applyId"], receiptId: review.receiptId, reviewFingerprint: review.reviewFingerprint, status: "applied", canApply: false, recoveryNeeded: false, attempt: 1, dispatchCount: 1, retryAfter: null, failureCode: null, mappings: null, sourceCheckedAt: 100, dispatchedAt: 100, createdAt: 100, updatedAt: 110, finishedAt: 110 } }} />);
  expect(html).toContain("Applied to production");
  expect(html).toContain("Applied status was confirmed");
  expect(html).not.toContain("Ready for production confirmation");
  expect(html).not.toContain("Create a new preview");
});
test("unknown response is visibly unconfirmed instead of showing a successful or ready apply", () => {
  const html = renderToStaticMarkup(<PromotionReviewView review={{ ...fixture(), canApply: true, status: "reviewed" }} now={100} unknownOutcome />);
  expect(html).toContain("Apply outcome is unconfirmed");
  expect(html).not.toContain("Ready for production confirmation");
  expect(html).not.toContain("Applied to production");
});
