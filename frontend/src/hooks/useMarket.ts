import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ethers } from "ethers";
import { getSigner, getProvider } from "../utils/sapphire";
import PredictionMarketABI from "../abi/PredictionMarket.json";
import MarketFactoryABI from "../abi/MarketFactory.json";
import OracleRegistryABI from "../abi/OracleRegistry.json";
import { getContracts } from "../utils/config";

export interface DemoState {
  marketAddress: string;
  question: string;
  startedAt: string;
  totalBettors: number;
  durationMin: number;
  oddsUpdateMin: number;
  marketFactory: string;
}

export interface LiveBet {
  user: string;
  amount: string;
  blockNumber: number;
  txHash: string;
}

export function useNetwork() {
  return useQuery({
    queryKey: ["network"],
    queryFn: async () => {
      try {
        const provider = await getProvider();
        const network = await provider.getNetwork();
        return getContracts(network.chainId);
      } catch {
        const localProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        const network = await localProvider.getNetwork();
        return getContracts(network.chainId);
      }
    }
  });
}

export function useDemoState() {
  return useQuery<DemoState | null>({
    queryKey: ["demoState"],
    queryFn: async () => {
      try {
        const res = await fetch("/demo-state.json", { cache: "no-store" });
        if (!res.ok) return null;
        return res.json() as Promise<DemoState>;
      } catch {
        return null;
      }
    },
    refetchInterval: 5000,
  });
}

export function useLiveFeed(marketAddress: string | undefined) {
  return useQuery<LiveBet[]>({
    queryKey: ["livefeed", marketAddress],
    queryFn: async (): Promise<LiveBet[]> => {
      if (!marketAddress) return [];
      const provider = await getProvider();
      const contract = new ethers.Contract(marketAddress, PredictionMarketABI.abi, provider);
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 2000);
      const events = await contract.queryFilter(contract.filters.BetPlaced(), fromBlock);
      return events
        .map(e => {
          const log = e as any;
          return {
            user: log.args[0] as string,
            amount: ethers.formatEther(log.args[1] as bigint),
            blockNumber: e.blockNumber,
            txHash: e.transactionHash,
          };
        })
        .reverse();
    },
    refetchInterval: 2000,
    enabled: !!marketAddress,
  });
}

export interface MarketInfo {
  address: string;
  question: string;
  bettingDeadline: number;
  resolutionDeadline: number;
  state: number;
  outcome: number;
  yesPool: string;
  noPool: string;
  totalDeposits: string;
  yesOdds: number;
  noOdds: number;
  lastOddsUpdate: number;
  symbol: string;
}

// Traditional Position interface removed - everything is ZK now

export function useMarkets() {
  return useQuery({
    queryKey: ["markets"],
    queryFn: async (): Promise<string[]> => {
      const getMarketsFromProvider = async (provider: any) => {
        try {
          const network = await provider.getNetwork();
          const contracts = getContracts(network.chainId);
          
          if (!contracts.marketFactory) {
            console.warn(`[useMarkets] No marketFactory address found for chain ${network.chainId}`);
            return [];
          }

          const factory = new ethers.Contract(contracts.marketFactory, MarketFactoryABI, provider);
          const count = await factory.getMarketCount();
          return await factory.getMarkets(0, count);
        } catch (err) {
          console.error("[useMarkets] Failed to fetch markets from provider:", err);
          throw err;
        }
      };

      try {
        console.log("[useMarkets] Attempting to fetch from local provider...");
        const localProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        return await getMarketsFromProvider(localProvider);
      } catch (err) {
        console.warn("[useMarkets] Local provider failed, falling back to browser provider", err);
        try {
          const browserProvider = await getProvider();
          return await getMarketsFromProvider(browserProvider);
        } catch (browserErr) {
          console.error("[useMarkets] Both local and browser providers failed", browserErr);
          throw browserErr;
        }
      }
    },
    refetchInterval: 5000,
  });
}

export function useMarketInfo(marketAddress: string) {
  return useQuery({
    queryKey: ["market", marketAddress],
    queryFn: async (): Promise<MarketInfo> => {
      const getInfoFromProvider = async (provider: any) => {
        const network = await provider.getNetwork();
        const contracts = getContracts(network.chainId);
        const market = new ethers.Contract(marketAddress, PredictionMarketABI.abi, provider);
        const info = await market.getMarketInfo();
        const odds = await market.getOdds();
        return {
          address: marketAddress,
          question: info._question,
          bettingDeadline: Number(info._bettingDeadline),
          resolutionDeadline: Number(info._resolutionDeadline),
          state: Number(info._state),
          outcome: Number(info._outcome),
          yesPool: ethers.formatEther(info._publicYesPool),
          noPool: ethers.formatEther(info._publicNoPool),
          totalDeposits: ethers.formatEther(info._totalDeposits),
          yesOdds: Number(odds.yesBps) / 100,
          noOdds: Number(odds.noBps) / 100,
          lastOddsUpdate: Number(await market.lastOddsUpdate()),
          symbol: contracts.symbol || "ETH",
        };
      };

      try {
        const localProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        return await getInfoFromProvider(localProvider);
      } catch (err) {
        const browserProvider = await getProvider();
        return await getInfoFromProvider(browserProvider);
      }
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchInterval: 5000,
  });
}

// Traditional betting and position hooks removed. Everything is ZK now.

export interface OracleInfo {
  address: string;
  stake: string;
  successfulResolutions: number;
  failedResolutions: number;
  isActive: boolean;
}

export function useRegisteredOracles() {
  return useQuery({
    queryKey: ["oracles"],
    queryFn: async (): Promise<OracleInfo[]> => {
      const getOraclesFromProvider = async (provider: any) => {
        try {
          const network = await provider.getNetwork();
          const contracts = getContracts(network.chainId);
          
          if (!contracts.oracleRegistry) {
            console.warn(`[useRegisteredOracles] No oracleRegistry address found for chain ${network.chainId}`);
            return [];
          }

          const registry = new ethers.Contract(
            contracts.oracleRegistry,
            OracleRegistryABI,
            provider
          );

          const count = await registry.getOracleCount();
          const oracles: OracleInfo[] = [];

          for (let i = 0; i < count; i++) {
            const address = await registry.oracleList(i);
            const info = await registry.oracles(address);
            if (info.isActive) {
              oracles.push({
                address,
                stake: ethers.formatEther(info.stake),
                successfulResolutions: Number(info.successfulResolutions),
                failedResolutions: Number(info.failedResolutions),
                isActive: info.isActive,
              });
            }
          }
          return oracles;
        } catch (err) {
          console.error("[useRegisteredOracles] Failed to fetch oracles:", err);
          throw err;
        }
      };

      try {
        const localProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        return await getOraclesFromProvider(localProvider);
      } catch (err) {
        console.warn("[useRegisteredOracles] Local provider failed, trying browser", err);
        try {
          const browserProvider = await getProvider();
          return await getOraclesFromProvider(browserProvider);
        } catch (browserErr) {
          console.error("[useRegisteredOracles] Both providers failed", browserErr);
          throw browserErr;
        }
      }
    },
    refetchInterval: 10000,
  });
}

export function useCreateMarket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ question, durationDays, oracles }: { question: string; durationDays: number; oracles: string[] }) => {
      const signer = await getSigner();
      const network = await signer.provider!.getNetwork();
      const contracts = getContracts(network.chainId);

      const factory = new ethers.Contract(
        contracts.marketFactory,
        MarketFactoryABI,
        signer
      );

      const durationSeconds = durationDays * 24 * 60 * 60;
      const tx = await factory.createMarket(question, durationSeconds, oracles);
      return tx.wait();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["markets"] });
    },
  });
}
