/**
 * Zod compiles fast object parsers with `new Function`, and probes whether it
 * may by calling `new Function("")`. Both are string evaluation, which the
 * site's Content-Security-Policy refuses (no 'unsafe-eval'), so every page
 * logged a violation. Browsers parse without it: the client entry imports
 * this first, before any schema parses.
 */
import { z } from "zod";

z.config({ jitless: true });
