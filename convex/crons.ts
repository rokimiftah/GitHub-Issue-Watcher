// // convex/crons.ts
// import { cronJobs } from "convex/server";

// import { internal } from "./_generated/api";

// const crons = cronJobs();

// crons.daily(
// 	"clean expired cache",
// 	{ hourUTC: 0, minuteUTC: 0 },
// 	internal.llmAnalysis.cleanExpiredCache,
// );

// export default crons;
