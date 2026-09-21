import { useState } from "react";
import * as P from "../src/templates/sdk/primitives";
/** Internal comparison of real template primitives; never shipped as site content. */
export function DensityStudy() {
    const [long, setLong] = useState(false);
    return <details data-density-study className="density-study">
    <summary>Heading scale and card spacing</summary>
    <label><input type="checkbox" checked={long} onChange={event => setLong(event.target.checked)}/> Use long specimen copy</label>
    <P.Section spacing="compact" width="wide" label="Heading scale and card spacing">
      <P.Stack gap="lg">
        {(["display", "lg", "md", "sm"] as const).map((size, index) => <div key={size} data-density-heading={size}>
          <P.Heading level={index < 2 ? 2 : index === 2 ? 3 : 4} size={size}>
            {long ? "Useful equipment for everyday adventures, carefully chosen and made to last" : "Equipment for everyday adventures"}
          </P.Heading>
        </div>)}
        <P.Grid columns={{ base: 1, md: 2, lg: 4 }} gap="md">
          {(["none", "compact", "default", "spacious"] as const).map(padding => <div key={padding} data-density-card={padding}>
            <P.Card padding={padding} variant="outline"><P.Stack gap="sm">
              <P.Eyebrow>{padding} spacing</P.Eyebrow>
              <P.Heading level={3} size="md">Ready for the everyday</P.Heading>
              <P.Text>{long ? "A dependable collection of tools, objects and useful details. Built around real routines, with enough room for the information you need to make a confident choice." : "Good tools. Clear information. Nothing in the way."}</P.Text>
              <P.Button label="Browse the collection" href="#composition" variant="outline"/>
            </P.Stack></P.Card>
          </div>)}
        </P.Grid>
        <div data-density-plain>
          <P.Card variant="plain" padding="none">
            <P.Text>A plain card keeps its borderless, unpadded presentation.</P.Text>
          </P.Card>
        </div>
      </P.Stack>
    </P.Section>
  </details>;
}
