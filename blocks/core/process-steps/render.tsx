import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Prose, Intro, ResolvedImage } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "./process.css";

export default defineBlock("core/process-steps", ({ attrs, resources }) => (
  <P.Stack gap="lg">
    <Intro {...attrs} />
    <ol className="cp-library-process" role="list">
      {attrs.steps.map((item, index) => (
        <li key={index}>
          <P.Card><P.Stack gap="md">
            <P.Eyebrow>{String(index + 1).padStart(2, "0")}</P.Eyebrow>
            {item.media && <div className="cp-library-process-media"><ResolvedImage {...item.media} resources={resources} /></div>}
            {item.title && <P.Heading level={3} size="md">{item.title}</P.Heading>}
            {item.body && <Prose text={item.body} />}
          </P.Stack></P.Card>
        </li>
      ))}
    </ol>
  </P.Stack>
));
