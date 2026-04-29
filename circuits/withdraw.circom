pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "merkleTree.circom"; 
template Withdraw(levels) {
    // Public inputs
    signal input merkleRoot;
    signal input nullifierHash;
    signal input choice;
    signal input amount;

    // Private inputs
    signal input secret;
    signal input nullifier;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // 1. Verify commitment = Poseidon(secret, nullifier, choice, amount)
    component commitmentHasher = Poseidon(4);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;
    commitmentHasher.inputs[2] <== choice;
    commitmentHasher.inputs[3] <== amount;
    signal commitment <== commitmentHasher.out;

    // 2. Verify nullifierHash = Poseidon(nullifier)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHasher.out === nullifierHash;

    // 3. Verify Merkle Tree inclusion
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== commitment;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
    tree.root === merkleRoot;
}

component main {public [merkleRoot, nullifierHash, choice, amount]} = Withdraw(20);
