import { ethers } from 'ethers';

const VOTING_ABI = [
  'function getState() view returns (uint8)',
  'function owner() view returns (address)',
  'function getResults() view returns (uint256[] ids, uint256[] voteCounts)',
];

export type ContractState = 'IDLE' | 'ACTIVE' | 'ENDED';

class ChainReader {
  private provider: ethers.JsonRpcProvider | null = null;

  private getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      const rpcUrl = process.env.SEPOLIA_RPC_URL;
      if (!rpcUrl) throw new Error('SEPOLIA_RPC_URL is not configured');
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
    }
    return this.provider;
  }

  async getState(address: string): Promise<ContractState> {
    const contract = new ethers.Contract(address, VOTING_ABI, this.getProvider());
    const stateNum = Number(await contract.getState());
    const states: ContractState[] = ['IDLE', 'ACTIVE', 'ENDED'];
    return states[stateNum] ?? 'IDLE';
  }

  async getOwner(address: string): Promise<string> {
    const contract = new ethers.Contract(address, VOTING_ABI, this.getProvider());
    return (await contract.owner()) as string;
  }

  async getResults(address: string): Promise<{ ids: number[]; votes: number[] }> {
    const contract = new ethers.Contract(address, VOTING_ABI, this.getProvider());
    const [ids, votes] = await contract.getResults() as [bigint[], bigint[]];
    return {
      ids: ids.map(Number),
      votes: votes.map(Number),
    };
  }
}

export const chainReader = new ChainReader();
