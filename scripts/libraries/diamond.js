/* global hre, ethers */

const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 };

// get function selectors from ABI
function getSelectors(contract) {
  const signatures = Object.keys(contract.interface.functions);
  const selectors = signatures.reduce((acc, val) => {
    if (val !== 'init(bytes)') {
      acc.push(contract.interface.getSighash(val));
    }
    return acc;
  }, []);
  selectors.contract = contract;
  selectors.remove = remove;
  selectors.get = get;
  return selectors;
}

// get function selector from function signature
function getSelector(func) {
  const abiInterface = new ethers.utils.Interface([func]);
  return abiInterface.getSighash(ethers.utils.Fragment.from(func));
}

// used with getSelectors to remove selectors from an array of selectors
// functionNames argument is an array of function signatures
function remove(functionNames) {
  const selectors = this.filter(v => {
    for (const functionName of functionNames) {
      if (v === this.contract.interface.getSighash(functionName)) {
        return false;
      }
    }
    return true;
  });
  selectors.contract = this.contract;
  selectors.remove = this.remove;
  selectors.get = this.get;
  return selectors;
}

// used with getSelectors to get selectors from an array of selectors
// functionNames argument is an array of function signatures
function get(functionNames) {
  const selectors = this.filter(v => {
    for (const functionName of functionNames) {
      if (v === this.contract.interface.getSighash(functionName)) {
        return true;
      }
    }
    return false;
  });
  selectors.contract = this.contract;
  selectors.remove = this.remove;
  selectors.get = this.get;
  return selectors;
}

// remove selectors using an array of signatures
function removeSelectors(selectors, signatures) {
  const iface = new ethers.utils.Interface(signatures.map(v => 'function ' + v));
  const removeSelectors = signatures.map(v => iface.getSighash(v));
  selectors = selectors.filter(v => !removeSelectors.includes(v));
  return selectors;
}

// find a particular address position in the return value of diamondLoupeFacet.facets()
function findAddressPositionInFacets(facetAddress, facets) {
  for (let i = 0; i < facets.length; i++) {
    if (facets[i].facetAddress === facetAddress) {
      return i;
    }
  }
}

async function cutFacets({ facets, initializer, diamondAddress, signer, initializerArgs }) {
  // const getSelectors = await import("./libraries/diamond.js").then(
  //   (m) => m.getSelectors
  // );

  // const FacetCutAction = await import("./libraries/diamond.js").then(
  //   (m) => m.FacetCutAction
  // );

  const cut = [];
  for (const facet of facets) {
    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet),
    });
  }

  const diamondCut = await ethers.getContractAt('IDiamondCut', diamondAddress);
  let tx;
  let receipt;

  // call to init function
  let functionCall = initializer ? initializer.interface.encodeFunctionData('init', initializerArgs) : [];
  tx = await diamondCut
    .connect(signer)
    .diamondCut(cut, initializer?.address ?? hre.ethers.constants.AddressZero, functionCall);
  if (require.main === module) {
    console.log('Diamond cut tx: ', tx.hash);
  }
  receipt = await tx.wait();
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }

  return receipt;
}

async function replaceFacet(DiamondAddress, facetName, signer, initializer, initializerArgs) {
  const Facet = await hre.ethers.getContractFactory(facetName, signer);
  const facet = await Facet.deploy();
  await facet.deployed();

  const diamond = await ethers.getContractAt('IDiamondCut', DiamondAddress);
  const cut = [
    {
      facetAddress: facet.address,
      action: FacetCutAction.Replace,
      functionSelectors: getSelectors(facet),
    },
  ];

  let functionCall = initializer ? initializer.interface.encodeFunctionData('init', initializerArgs) : [];

  const tx = await diamond
    .connect(signer)
    .diamondCut(cut, initializer?.address ?? hre.ethers.constants.AddressZero, functionCall);

  return tx;
}

async function deployDiamond(FacetNames, signer, initializer, initializerArgs) {
  // console.log(
  //   "deploying diamond",
  //   FacetNames,
  //   initializer,
  //   initializerArgs,
  //   signer.address
  // );
  const DiamondCutFacet = await ethers.getContractFactory('DiamondCutFacet', signer);
  const diamondCutFacet = await DiamondCutFacet.deploy();
  await diamondCutFacet.deployed();
  if (require.main === module) {
    console.log('DiamondCutFacet deployed:', diamondCutFacet.address);
  }

  const Diamond = await ethers.getContractFactory('DiamondClonable', signer);
  const diamond = await Diamond.deploy(signer.address, diamondCutFacet.address);
  await diamond.deployed();
  if (require.main === module) {
    console.log('Diamond deployed:', diamond.address);
  }

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = await ethers.getContractFactory(initializer ?? 'DiamondInit', signer);
  const diamondInit = await DiamondInit.deploy();
  await diamondInit.deployed();
  if (require.main === module) {
    console.log('DiamondInit deployed:', diamondInit.address);
  }

  // deploy facets
  // console.log("Deploying facets");
  const facets = [];
  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName, signer);

    const facet = await Facet.deploy();
    await facet.deployed();
    if (require.main === module) {
      console.log(`Facet ${FacetName} deployed at:`, facet.address);
    }
    facets.push(facet);
  }

  await cutFacets({
    facets,
    initializer: diamondInit,
    diamondAddress: diamond.address,
    signer: signer,
    initializerArgs,
  });
  return diamond.address;
}

exports.deployDiamond = deployDiamond;
exports.replaceFacet = replaceFacet;
exports.cutFacets = cutFacets;
exports.getSelectors = getSelectors;
exports.getSelector = getSelector;
exports.FacetCutAction = FacetCutAction;
exports.remove = remove;
exports.removeSelectors = removeSelectors;
exports.findAddressPositionInFacets = findAddressPositionInFacets;
