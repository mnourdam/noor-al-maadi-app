
import { getProductionUniverseReport } from "./src/lib/encyclopedia/priority/production.server";

async function run() {
  try {
    const report = await getProductionUniverseReport();
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
