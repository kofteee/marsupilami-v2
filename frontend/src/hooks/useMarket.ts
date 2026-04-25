import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ethers } from "ethers";
import { getSigner, getProvider } from "../utils/sapphire";
import PredictionMarketABI from "../abi/PredictionMarket.json";
import MarketFactoryABI from "../abi/MarketFactory.json";
import { getContracts } from "../utils/config";

export interface DemoState {
  marketAddress: string;
  question: string;
  startedAt: string;
  totalBettors: number;
  durationMin: number;
  marketFactory: string;
}

export interface LiveBet {
  user: string;
  amount: string;
  blockNumber: number;
  txHash: string;
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
      const provider = new ethers.JsonRpcProvider("http://localhost:8545");
      const contract = new ethers.Contract(marketAddress, PredictionMarketABI, provider);
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 2000);
      const events = await contract.queryFilter(contract.filters.BetPlaced(), fromBlock);
      return events
        .map(e => ({
          user: e.args[0] as string,
          amount: ethers.formatEther(e.args[1] as bigint),
          blockNumber: e.blockNumber,
          txHash: e.transactionHash,
        }))
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
}

export interface Position {
  yesAmount: string;
  noAmount: string;
  hasClaimed: boolean;
}

export function useMarkets() {
  return useQuery({
    queryKey: ["markets"],
    queryFn: async (): Promise<string[]> => {
      const provider = new ethers.JsonRpcProvider("http://localhost:8545");
      const contracts = getContracts(BigInt(31337));

      if (!contracts.marketFactory) {
        return [];
      }

      const factory = new ethers.Contract(
        contracts.marketFactory,
        MarketFactoryABI,
        provider
      );

      const count = await factory.getMarketCount();
      const markets = await factory.getMarkets(0, count);
      return markets;
    },
    refetchInterval: 5000,
  });
}

export function useMarketInfo(marketAddress: string) {
  return useQuery({
    queryKey: ["market", marketAddress],
    queryFn: async (): Promise<MarketInfo> => {
      const provider = new ethers.JsonRpcProvider("http://localhost:8545");
      const market = new ethers.Contract(
        marketAddress,
        PredictionMarketABI,
        provider
      );

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
      };
    },
    refetchInterval: 2000,
  });
}

export function useMyPosition(marketAddress: string) {
  return useQuery({
    queryKey: ["position", marketAddress],
    queryFn: async (): Promise<Position> => {
      const signer = await getSigner();
      const market = new ethers.Contract(
        marketAddress,
        PredictionMarketABI,
        signer
      );

      const position = await market.getMyPosition();

      return {
        yesAmount: ethers.formatEther(position.yesAmount),
        noAmount: ethers.formatEther(position.noAmount),
        hasClaimed: position.hasClaimed,
      };
    },
  });
}

export function usePlaceBet(marketAddress: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ choice, amount }: { choice: 0 | 1; amount: string }) => {
      const signer = await getSigner();
      const market = new ethers.Contract(
        marketAddress,
        PredictionMarketABI,
        signer
      );

      const tx = await market.placeBet(choice, {
        value: ethers.parseEther(amount),
      });

      return tx.wait();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market", marketAddress] });
      queryClient.invalidateQueries({ queryKey: ["position", marketAddress] });
    },
  });
}

export function useClaim(marketAddress: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const signer = await getSigner();
      const market = new ethers.Contract(
        marketAddress,
        PredictionMarketABI,
        signer
      );

      const tx = await market.claim();
      return tx.wait();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position", marketAddress] });
    },
  });
}

export function useCreateMarket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ question, durationDays }: { question: string; durationDays: number }) => {
      const signer = await getSigner();
      const network = await signer.provider!.getNetwork();
      const contracts = getContracts(network.chainId);

      const factory = new ethers.Contract(
        contracts.marketFactory,
        MarketFactoryABI,
        signer
      );

      const durationSeconds = durationDays * 24 * 60 * 60;
      const tx = await factory.createMarket(question, durationSeconds);
      return tx.wait();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["markets"] });
    },
  });
}
