import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{environment:'node',include:['tests/campaigns/ordering-help-economy.test.ts','tests/campaigns/ordering-hint-correctness-independence.test.ts','tests/campaigns/option-shuffle-v17-05.test.ts','tests/offline/outbox-campaign-display-overlay.test.ts'],maxWorkers:2}});
