// Mock the network/heavy dependencies that coingeckoUtils imports at module load
// so this unit test is deterministic and isolated from node_modules behavior.
const stellarContractCall = jest.fn();

jest.mock("../adapters/utils/rpcProxy", () => ({
  __esModule: true,
  default: {
    stellar: {
      contractCall: (...args: any[]) => stellarContractCall(...args),
    },
  },
}));

jest.mock("@defillama/sdk", () => ({
  __esModule: true,
  erc20: { decimals: jest.fn(), symbol: jest.fn() },
  ChainApi: jest.fn(),
  cache: { cachedFetch: jest.fn() },
}));

jest.mock("node-fetch", () => ({ __esModule: true, default: jest.fn() }));

jest.mock("@solana/web3.js", () => ({ __esModule: true, PublicKey: jest.fn() }));

jest.mock("../adapters/solana/utils", () => ({
  __esModule: true,
  getConnection: jest.fn(),
}));

jest.mock("../adapters/utils/starknet", () => ({
  __esModule: true,
  cairoErc20Abis: {},
  call: jest.fn(),
  feltArrToStr: jest.fn(),
}));

import { getSymbolAndDecimals, isMetadataBlacklisted } from "./coingeckoUtils";

// Real Stellar contract IDs (StrKey, uppercase) for tokens that the ecosystem
// reported as missing from TVL views. They are stored lowercased upstream.
const SOLV_BTC = "CBIJBDNZNF4X35BJ4FFZWCDBSCKOP5NB4PLG4SNENRMLAPYG4P5FM6VN";
const USDM1 = "CAC743NYRBMS76L2DCPAXZTOEF6EJPKPVEC5OX2SXY7HOWNXISSLUE2C";

describe("Stellar token metadata", () => {
  beforeEach(() => {
    stellarContractCall.mockReset();
  });

  describe("isMetadataBlacklisted", () => {
    it("no longer blacklists the previously-skipped Stellar contract tokens", () => {
      // These were hard-coded into the metadata blacklist, which dropped them
      // from reporting. The fix removes them so they can be resolved on-chain.
      for (const id of [SOLV_BTC, USDM1]) {
        expect(isMetadataBlacklisted("stellar", id)).toBe(false);
        expect(isMetadataBlacklisted("stellar", id.toLowerCase())).toBe(false);
      }
    });

    it("still blacklists tokens on chains with no metadata path", () => {
      expect(isMetadataBlacklisted("cardano", "anything")).toBe(true);
    });
  });

  describe("getSymbolAndDecimals", () => {
    it("resolves a classic asset (CODE-ISSUER) without any contract call", async () => {
      const issuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
      const result = await getSymbolAndDecimals(
        `usdc-${issuer}`.toLowerCase(),
        "stellar",
        "usd-coin",
        `USDC-${issuer}`,
      );
      expect(result).toEqual({ symbol: "USDC", decimals: 7 });
      expect(stellarContractCall).not.toHaveBeenCalled();
    });

    it("resolves a contract token (SolvBTC) via the Soroban token interface", async () => {
      stellarContractCall.mockImplementation((_id: string, method: string) =>
        Promise.resolve(method === "symbol" ? "SolvBTC" : 8),
      );

      const result = await getSymbolAndDecimals(
        SOLV_BTC.toLowerCase(),
        "stellar",
        "solv-btc",
        SOLV_BTC,
      );

      expect(result).toEqual({ symbol: "SolvBTC", decimals: 8 });
      // Soroban contract IDs are case-sensitive uppercase StrKey.
      expect(stellarContractCall).toHaveBeenCalledWith(SOLV_BTC, "symbol");
      expect(stellarContractCall).toHaveBeenCalledWith(SOLV_BTC, "decimals");
    });

    it("recovers the canonical uppercase contract ID when no originalAddress is passed", async () => {
      stellarContractCall.mockImplementation((_id: string, method: string) =>
        Promise.resolve(method === "symbol" ? "USDM1" : 6),
      );

      const result = await getSymbolAndDecimals(
        USDM1.toLowerCase(),
        "stellar",
        "usdm1",
        // originalAddress intentionally omitted
      );

      expect(result).toEqual({ symbol: "USDM1", decimals: 6 });
      expect(stellarContractCall).toHaveBeenCalledWith(USDM1, "symbol");
    });

    it("coerces string decimals returned by the RPC proxy to a number", async () => {
      stellarContractCall.mockImplementation((_id: string, method: string) =>
        Promise.resolve(method === "symbol" ? "SolvBTC" : "8"),
      );

      const result = await getSymbolAndDecimals(SOLV_BTC.toLowerCase(), "stellar", "solv-btc", SOLV_BTC);
      expect(result).toEqual({ symbol: "SolvBTC", decimals: 8 });
    });

    it("returns undefined (skips) when the contract returns no usable metadata", async () => {
      stellarContractCall.mockResolvedValue(undefined);
      const result = await getSymbolAndDecimals(SOLV_BTC.toLowerCase(), "stellar", "solv-btc", SOLV_BTC);
      expect(result).toBeUndefined();
    });

    it("returns undefined (skips) when the RPC proxy call throws", async () => {
      stellarContractCall.mockRejectedValue(new Error("rpc unavailable"));
      const result = await getSymbolAndDecimals(SOLV_BTC.toLowerCase(), "stellar", "solv-btc", SOLV_BTC);
      expect(result).toBeUndefined();
    });
  });
});
