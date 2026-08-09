import { generatePriorityAudit } from "./src/lib/encyclopedia/priority/engine.server";

async function run() {
  try {
    const result = await generatePriorityAudit();
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
