#! /bin/bash


rm -rf ./deployments/localhost &&
export NODE_ENV=TEST &&
pnpm hardhat deploy --tags ERC7744,MAO,rankify --network localhost
