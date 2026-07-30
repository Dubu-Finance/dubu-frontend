export const GIWA_CHAIN_ID = 91_342;
export const GIWA_RPC_URL = "https://sepolia-rpc.giwa.io";
export const DUBU_ROUTER_ADDRESS = "0x2B10D0b50ca3A7c0C7CCaBc969615b4Db3fb9471";

export const CHAIN_TOKENS = Object.freeze({
  mUSDC: {
    symbol: "mUSDC",
    address: "0xd28596C6750D87C53EA146134AfAB53de86C5155",
    decimals: 6,
  },
  mWETH: {
    symbol: "mWETH",
    address: "0x81e46C6379498beBEB5DCcD47ab2DdFaf967d445",
    decimals: 18,
  },
  mWBTC: {
    symbol: "mWBTC",
    address: "0x3548991B5EF2D7805EFa95bEa6CeDeAee3869875",
    decimals: 8,
  },
  mBNB: {
    symbol: "mBNB",
    address: "0x54fbDB9F5bf1c345F0230773C66607DF3f7b99AC",
    decimals: 18,
  },
  mXRP: {
    symbol: "mXRP",
    address: "0x4Cbc341D56232805B258ed5a33C7b80dbF1A9d01",
    decimals: 6,
  },
  mSOL: {
    symbol: "mSOL",
    address: "0x1F96E44136D765802005c5083a51830841dca9b3",
    decimals: 9,
  },
  mSKHY: {
    symbol: "mSKHY",
    address: "0x37D1e1307eba9B489844B9A1198b5F77577630FD",
    decimals: 8,
  },
  mAAPL: {
    symbol: "mAAPL",
    address: "0xab3F1C8A9358Feb5872F81330FC811C3c53Ae9ff",
    decimals: 8,
  },
  mTSLA: {
    symbol: "mTSLA",
    address: "0xf5456CF225efaf7807cBC14079733b211eAc84d7",
    decimals: 8,
  },
});

export const TOKEN_BY_ADDRESS = new Map(
  Object.values(CHAIN_TOKENS).map((token) => [token.address.toLowerCase(), token]),
);
