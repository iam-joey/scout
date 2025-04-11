const nftBalances = (ownerAdress: string) => {
  return `account/nft-balance/${ownerAdress}`;
};

const tokenBalance = (ownerAdress: string) => {
  return `account/token-balance/${ownerAdress}`;
};

export { nftBalances, tokenBalance };
