import { useMemo, type ReactNode } from "react";
import { createLowlight } from "lowlight";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";

const highlighter = createLowlight({ javascript, typescript, json, xml, css, bash, python, sql, yaml, markdown });
const highlightLimit = 20000;
type Token = {
  type: string;
  value?: string;
  children?: Token[];
  properties?: { className?: unknown };
};

function renderTokens(tokens: readonly Token[]): ReactNode[] {
  return tokens.map((token, index) => {
    if (token.type === "text") return token.value ?? "";
    if (token.type !== "element") return null;
    const classes = token.properties?.className;
    return <span key={index} className={Array.isArray(classes) ? classes.filter(value => typeof value === "string").join(" ") : undefined}>{renderTokens(token.children ?? [])}</span>;
  });
}

/** Only text and span nodes reach React; authored code is never parsed as HTML. */
export function CodeHighlight({ source, language }: { source: string; language: string }) {
  const content = useMemo(() => {
    const name = language.trim().toLowerCase();
    // Keep unknown languages and large samples readable without synchronous
    // autodetection or unbounded highlighting work during editor keystrokes.
    if (source.length > highlightLimit || !highlighter.registered(name)) return source;
    try {
      return renderTokens(highlighter.highlight(name, source).children);
    } catch {
      return source;
    }
  }, [source, language]);
  return <>{content}</>;
}
