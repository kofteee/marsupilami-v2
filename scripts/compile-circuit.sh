#!/bin/bash

# Exit on error
set -e

# Base directory is the project root
PROJECT_ROOT=$(pwd)
BUILD_DIR="$PROJECT_ROOT/circuits/build"
FRONTEND_DIR="$PROJECT_ROOT/frontend/public/circuits"
CONTRACTS_DIR="$PROJECT_ROOT/contracts/contracts"

echo "🚀 Starting ZK Circuit Compilation..."

# 1. Create directories
mkdir -p "$BUILD_DIR"
mkdir -p "$FRONTEND_DIR"

# Ensure we are in the circuits directory for compilation
cd "$PROJECT_ROOT/circuits"

# 2. Compile circuit
echo "🔨 Compiling withdraw.circom..."
# Output to build directory, look for libraries in node_modules
circom withdraw.circom --r1cs --wasm --sym --output "$BUILD_DIR" -l ../node_modules

cd "$BUILD_DIR"

# 3. Generate local PTAU if not exists (faster and more reliable for dev)
PTAU_FILE="pot14_final.ptau"
if [ ! -f "$PTAU_FILE" ]; then
    echo "⚙️  Generating local PTAU file (Phase 1)..."
    snarkjs powersoftau new bn128 14 pot14_0000.ptau -v
    snarkjs powersoftau contribute pot14_0000.ptau pot14_0001.ptau --name="Dev Contribution" -v -e="MarsupilamiEntropy123"
    snarkjs powersoftau prepare phase2 pot14_0001.ptau "$PTAU_FILE" -v
    rm pot14_0000.ptau pot14_0001.ptau
fi

# 4. Groth16 Setup (Phase 2)
echo "⚙️  Generating initial ZKey..."
snarkjs groth16 setup "withdraw.r1cs" "$PTAU_FILE" "withdraw_0000.zkey"

# 5. Contribution
echo "✍️  Adding dummy contribution..."
snarkjs zkey contribute "withdraw_0000.zkey" "withdraw_final.zkey" --name="Marsupilami Dev" -v -e="MarsupilamiEntropy123"

# 6. Export Verification Key
echo "📋 Exporting Verification Key..."
snarkjs zkey export verificationkey "withdraw_final.zkey" "verification_key.json"

# 7. Generate Solidity Verifier
echo "📄 Generating Solidity Verifier at $CONTRACTS_DIR/Verifier.sol..."
snarkjs zkey export solidityverifier "withdraw_final.zkey" "$CONTRACTS_DIR/Verifier.sol"

# Fix Solidity version in auto-generated Verifier for compatibility
sed -i '' 's/pragma solidity \^0.6.11;/pragma solidity \^0.8.24;/g' "$CONTRACTS_DIR/Verifier.sol"

# 8. Move Assets to Frontend
echo "🚚 Moving assets to frontend public directory..."
cp "withdraw_js/withdraw.wasm" "$FRONTEND_DIR/withdraw.wasm"
cp "withdraw_final.zkey" "$FRONTEND_DIR/withdraw_final.zkey"
cp "verification_key.json" "$FRONTEND_DIR/verification_key.json"

echo "✅ ZK Assets Ready!"
echo "WASM: $FRONTEND_DIR/withdraw.wasm"
echo "ZKey: $FRONTEND_DIR/withdraw_final.zkey"
echo "Verifier: $CONTRACTS_DIR/Verifier.sol"