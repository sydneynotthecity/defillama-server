import { getSymbolAndDecimals } from "./coingeckoUtils";

// Hits Soroban RPC (default: https://mainnet.sorobanrpc.com).
// Override with STELLAR_RPC if needed in CI.
test("Stellar contract token METADATA resolves via Soroban RPC", async () => {
  const USDM1 = "CAC743NYRBMS76L2DCPAXZTOEF6EJPKPVEC5OX2SXY7HOWNXISSLUE2C";
  const out = await getSymbolAndDecimals(
    USDM1.toLowerCase(),
    "stellar",
    "USDM1",
    USDM1
  );
  expect(out).toEqual({ symbol: "USDM1", decimals: 7 });
}, 15000);
