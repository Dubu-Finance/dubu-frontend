import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileLimitOrderContract } from "./lib/limit-order-contract.mjs";

const artifact = await compileLimitOrderContract();
const outputDirectory = resolve("artifacts");
const outputPath = resolve(outputDirectory, "DubuLimitOrderSettlement.json");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.info(`[limit-order] artifact written to ${outputPath}`);
