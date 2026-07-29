import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatUnits,
  isAddress,
  parseUnits,
} from "ethers";
import { EXPLORER, GIWA_RPC, TOKENS, type TokenSymbol } from "@/app/lib/dubu";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

type FaucetSymbol = Exclude<TokenSymbol, "mSPCX">;

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
] as const;

const CLAIM_AMOUNTS: Record<FaucetSymbol, string> = {
  mUSDC: "10000",
  mWETH: "2",
  mWBTC: "0.1",
  mBNB: "10",
  mXRP: "2000",
  mSOL: "50",
  mSKHY: "100",
  mAAPL: "20",
  mTSLA: "20",
};

const recentClaims = new Map<string, number>();
const REQUEST_COOLDOWN_MS = 60_000;
let transactionQueue: Promise<unknown> = Promise.resolve();

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

function getWallet() {
  const configuredKey = process.env.DUBU_FAUCET_PRIVATE_KEY?.trim();
  if (!configuredKey) {
    throw new Error("FAUCET_NOT_CONFIGURED");
  }

  const privateKey = configuredKey.startsWith("0x")
    ? configuredKey
    : `0x${configuredKey}`;

  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("FAUCET_KEY_INVALID");
  }

  return new Wallet(privateKey, new JsonRpcProvider(GIWA_RPC));
}

async function inTransactionQueue<T>(work: () => Promise<T>): Promise<T> {
  const previous = transactionQueue;
  let release!: () => void;
  transactionQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release();
  }
}

export async function GET() {
  try {
    const wallet = getWallet();
    const nativeBalance = await wallet.provider!.getBalance(wallet.address);
    const assets = await Promise.all(
      Object.entries(CLAIM_AMOUNTS).map(async ([rawSymbol, amount]) => {
        const symbol = rawSymbol as FaucetSymbol;
        const token = TOKENS[symbol];
        if (!token.address) return { symbol, amount, available: false };

        const contract = new Contract(token.address, ERC20_ABI, wallet.provider);
        const balance = await contract.balanceOf(wallet.address) as bigint;
        return {
          symbol,
          amount,
          available: nativeBalance > 0n && balance >= parseUnits(amount, token.decimals),
        };
      }),
    );

    return json({ configured: true, assets });
  } catch {
    return json({
      configured: false,
      assets: Object.entries(CLAIM_AMOUNTS).map(([symbol, amount]) => ({
        symbol,
        amount,
        available: false,
      })),
    });
  }
}

export async function POST(request: Request) {
  let payload: { address?: unknown; symbol?: unknown };

  try {
    payload = await request.json() as { address?: unknown; symbol?: unknown };
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const address = typeof payload.address === "string" ? payload.address.trim() : "";
  const symbol = typeof payload.symbol === "string" ? payload.symbol : "";

  if (!isAddress(address)) {
    return json({ error: "Enter a valid wallet address." }, 400);
  }

  if (!(symbol in CLAIM_AMOUNTS)) {
    return json({ error: "This asset is not available from the faucet." }, 400);
  }

  const faucetSymbol = symbol as FaucetSymbol;
  const token = TOKENS[faucetSymbol];
  if (!token.address) {
    return json({ error: "This asset is not available yet." }, 409);
  }
  const tokenAddress = token.address;

  const claimKey = `${address.toLowerCase()}:${faucetSymbol}`;
  const previousClaim = recentClaims.get(claimKey) ?? 0;
  if (Date.now() - previousClaim < REQUEST_COOLDOWN_MS) {
    return json({ error: "A request for this asset is already being processed." }, 429);
  }

  recentClaims.set(claimKey, Date.now());

  try {
    return await inTransactionQueue(async () => {
      const wallet = getWallet();
      const contract = new Contract(tokenAddress, ERC20_ABI, wallet);
      const amount = parseUnits(CLAIM_AMOUNTS[faucetSymbol], token.decimals);
      const [recipientBalance, faucetBalance] = await Promise.all([
        contract.balanceOf(address) as Promise<bigint>,
        contract.balanceOf(wallet.address) as Promise<bigint>,
      ]);

      if (recipientBalance >= amount) {
        return json({
          error: `This wallet already has enough ${faucetSymbol} to start trading.`,
          balance: formatUnits(recipientBalance, token.decimals),
        }, 409);
      }

      if (faucetBalance < amount) {
        return json({ error: `${faucetSymbol} is temporarily unavailable.` }, 503);
      }

      const transaction = await contract.transfer(address, amount);
      return json({
        status: "submitted",
        symbol: faucetSymbol,
        amount: CLAIM_AMOUNTS[faucetSymbol],
        transactionHash: transaction.hash,
        explorerUrl: `${EXPLORER}/tx/${transaction.hash}`,
      });
    });
  } catch (error) {
    recentClaims.delete(claimKey);

    const reason = error instanceof Error ? error.message : "";
    if (reason === "FAUCET_NOT_CONFIGURED" || reason === "FAUCET_KEY_INVALID") {
      console.error("Faucet configuration error:", reason);
      return json({ error: "The faucet is not configured yet." }, 503);
    }

    console.error("Faucet transfer failed:", error);
    return json({ error: "The transfer could not be submitted. Please try again shortly." }, 502);
  }
}
