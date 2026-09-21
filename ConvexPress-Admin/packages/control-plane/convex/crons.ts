import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("Fleet policy due jobs", { minutes: 1 }, internal.fleet.jobs.tick, {});
export default crons;
