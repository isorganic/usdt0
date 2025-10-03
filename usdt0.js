import { ethers } from "ethers";

// Konfigurasi InkOnChain
const RPC_URL   = "https://rpc-gel.inkonchain.com";
const CHAIN_ID  = 57073;
const provider  = new ethers.JsonRpcProvider(RPC_URL, {
  name: "inkonchain",
  chainId: CHAIN_ID
});

// Alamat kontrak
const ROUTER_ADDR = "0xA8C1C38FF57428e5C3a34E0899Be5Cb385476507";
const WETH_ADDR   = "0x4200000000000000000000000000000000000006";
const USDT0_ADDR  = "0x0200C29006150606B650577BBE7B6248F58470c1";

// ABI minimal
const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Wallet (ISI PRIVATE KEY KAMU)
const PRIVATE_KEY = "0x...."; // <<< Ganti dengan private key kamu
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const router = new ethers.Contract(ROUTER_ADDR, ROUTER_ABI, wallet);
const usdt0  = new ethers.Contract(USDT0_ADDR, ERC20_ABI, wallet);

// === Fungsi Cek Harga ETH ===
async function getEthPrice() {
  const decimals = await usdt0.decimals();
  const amounts = await router.getAmountsOut(
    ethers.parseEther("1"),
    [WETH_ADDR, USDT0_ADDR]
  );
  return Number(ethers.formatUnits(amounts[1], decimals));
}

// === Swap ETH → USDT0 ===
async function swapEthToUsdt0() {
  try {
    const decimals = await usdt0.decimals();
    const ethPrice = await getEthPrice();
    const usdTarget = (Math.random() * (1.2 - 1.1) + 1.1); // 1.1 - 1.2 USD
    const ethAmount = usdTarget / ethPrice;

    const ethInWei = ethers.parseEther(ethAmount.toFixed(18));
    const path = [WETH_ADDR, USDT0_ADDR];
    const deadline = Math.floor(Date.now() / 1000) + 120;

    console.log(`🚀 Swap ETH → USDT0 sebesar ~${usdTarget.toFixed(3)} USD (${ethAmount} ETH)`);

    const tx = await router.swapExactETHForTokens(
      0,
      path,
      wallet.address,
      deadline,
      { value: ethInWei }
    );

    const receipt = await tx.wait();
    console.log("✅ Swap ETH→USDT0 sukses:", receipt.hash);
    return true;

  } catch (err) {
    console.error("❌ Gagal swap ETH→USDT0:", err.message);
    return false;
  }
}

// === Swap USDT0 → ETH ===
async function swapUsdt0ToEth() {
  try {
    const decimals = await usdt0.decimals();
    const balance = await usdt0.balanceOf(wallet.address);
    if (balance == 0n) {
      console.log("⚠️ Tidak ada saldo USDT0 untuk ditukar balik.");
      return true;
    }

    // Approve router
    const approveTx = await usdt0.approve(ROUTER_ADDR, balance);
    await approveTx.wait();

    const path = [USDT0_ADDR, WETH_ADDR];
    const deadline = Math.floor(Date.now() / 1000) + 120;

    console.log(`↩️ Swap balik USDT0 → ETH (${ethers.formatUnits(balance, decimals)} USDT0)`);

    const tx = await router.swapExactTokensForETH(
      balance,
      0,
      path,
      wallet.address,
      deadline
    );

    const receipt = await tx.wait();
    console.log("✅ Swap USDT0→ETH sukses:", receipt.hash);
    return true;

  } catch (err) {
    console.error("❌ Gagal swap USDT0→ETH:", err.message);
    return false;
  }
}

// === Loop utama ===
async function mainLoop() {
  while (true) {
    const ok1 = await swapEthToUsdt0();
    if (!ok1) {
      console.log("⏳ Retry swap ETH→USDT0 dalam 20 detik...");
      await new Promise(r => setTimeout(r, 20000));
      continue;
    }

    const ok2 = await swapUsdt0ToEth();
    if (!ok2) {
      console.log("⏳ Retry swap USDT0→ETH dalam 20 detik...");
      await new Promise(r => setTimeout(r, 20000));
      continue;
    }

    console.log("🔄 Siklus selesai, lanjut lagi dalam 20 detik...\n");
    await new Promise(r => setTimeout(r, 20000));
  }
}

mainLoop();
