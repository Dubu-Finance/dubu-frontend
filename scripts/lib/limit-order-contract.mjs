import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = resolve(MODULE_DIR, "../../contracts/DubuLimitOrderSettlement.sol");

export async function compileLimitOrderContract() {
  const source = await readFile(CONTRACT_PATH, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      "DubuLimitOrderSettlement.sol": { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 500 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
  }

  const compiled = output.contracts?.["DubuLimitOrderSettlement.sol"]?.DubuLimitOrderSettlement;
  if (!compiled?.abi || !compiled?.evm?.bytecode?.object) {
    throw new Error("DubuLimitOrderSettlement compiler output is incomplete.");
  }

  return {
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
    deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
  };
}
