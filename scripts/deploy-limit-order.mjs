import { ContractFactory, JsonRpcProvider, Wallet, getAddress } from "ethers";
import { compileLimitOrderContract } from "./lib/limit-order-contract.mjs";

const rpcUrl = process.env.GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io";
const privateKey = process.env.LIMIT_ORDER_DEPLOYER_PRIVATE_KEY;
const router = process.env.DUBU_ROUTER_ADDRESS ?? "0x2B10D0b50ca3A7c0C7CCaBc969615b4Db3fb9471";

if (!privateKey) throw new Error("LIMIT_ORDER_DEPLOYER_PRIVATE_KEY is required.");

const provider = new JsonRpcProvider(rpcUrl);
const deployer = new Wallet(privateKey, provider);
const executor = process.env.LIMIT_ORDER_EXECUTOR_ADDRESS ?? deployer.address;
const feeRecipient = process.env.LIMIT_ORDER_FEE_RECIPIENT ?? executor;
const artifact = await compileLimitOrderContract();
const factory = new ContractFactory(artifact.abi, artifact.bytecode, deployer);

console.info(`[limit-order] deployer ${deployer.address}`);
console.info(`[limit-order] router ${getAddress(router)}`);
console.info(`[limit-order] executor ${getAddress(executor)}`);

const contract = await factory.deploy(
  getAddress(router),
  getAddress(feeRecipient),
  getAddress(executor),
);
const deploymentTransaction = contract.deploymentTransaction();
console.info(`[limit-order] submitted ${deploymentTransaction?.hash}`);
await contract.waitForDeployment();
const deploymentReceipt = deploymentTransaction
  ? await deploymentTransaction.wait()
  : null;
console.info(`[limit-order] settlement ${await contract.getAddress()}`);
console.info(`[limit-order] start block ${deploymentReceipt?.blockNumber ?? "unknown"}`);
