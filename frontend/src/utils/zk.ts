import { ethers } from 'ethers';
// @ts-ignore
import { buildPoseidon } from 'circomlibjs';
// @ts-ignore
import * as snarkjs from 'snarkjs';

export async function generateSecret(signer: ethers.Signer, eventId: string, choice: string) {
    const message = `Generate key for Event ${eventId} ${choice}`;
    const signature = await signer.signMessage(message);
    // Use the signature to create a deterministic secret
    return ethers.keccak256(ethers.toUtf8Bytes(signature));
}

export async function calculateCommitment(secret: string, nullifier: string, choice: number, amount: bigint) {
    const poseidon = await buildPoseidon();
    const hash = poseidon([
        BigInt(secret),
        BigInt(nullifier),
        BigInt(choice),
        amount
    ]);
    return poseidon.F.toObject(hash);
}

export async function calculateNullifierHash(nullifier: string) {
    const poseidon = await buildPoseidon();
    const hash = poseidon([BigInt(nullifier)]);
    return poseidon.F.toObject(hash);
}

export async function getMerklePathFromContract(contract: ethers.BaseContract, leafIndex: number) {
    // @ts-ignore
    const [pathElements, pathIndices] = await contract.getMerklePath(leafIndex);
    // @ts-ignore
    const root = await contract.tree(20, 0); // Assuming 20 levels
    return {
        pathElements: pathElements.map((x: any) => BigInt(x)),
        pathIndices: pathIndices.map((x: any) => Number(x)),
        root: BigInt(root)
    };
}

export async function generateProof(
    inputs: {
        merkleRoot: bigint;
        nullifierHash: bigint;
        choice: number;
        amount: bigint;
        secret: string | bigint;
        nullifier: string | bigint;
        pathElements: bigint[];
        pathIndices: number[];
    }
) {
    // In a browser environment, these paths should be relative to the public folder
    const wasmPath = "/circuits/withdraw.wasm";
    const zkeyPath = "/circuits/withdraw_final.zkey";

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        inputs,
        wasmPath,
        zkeyPath
    );

    return {
        proof,
        publicSignals
    };
}

export function formatProofForContract(proof: any) {
    return {
        a: [proof.pi_a[0], proof.pi_a[1]],
        b: [
            [proof.pi_b[0][1], proof.pi_b[0][0]],
            [proof.pi_b[1][1], proof.pi_b[1][0]]
        ],
        c: [proof.pi_c[0], proof.pi_c[1]]
    };
}
