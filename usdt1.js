import { ethers } from "ethers";

// ========== WARNA ==========
const RED   = "\x1b[31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

// ========== KONFIGURASI ==========
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

// Wallet
const PRIVATE_KEY = "0x...."; // <<< Ganti dengan private key kamu
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const router = new ethers.Contract(ROUTER_ADDR, ROUTER_ABI, wallet);
const usdt0  = new ethers.Contract(USDT0_ADDR, ERC20_ABI, wallet);

// Variabel global untuk menyimpan jumlah USDT0 hasil swap terakhir
let lastSwapUsdt0 = 0n;

// === Delay helper ===
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// === Fungsi Cek Harga ETH ===
async function getEthPrice() {
  const decimals = await usdt0.decimals();
  const amounts = await router.getAmountsOut(
    ethers.parseEther("1"),
    [WETH_ADDR, USDT0_ADDR]
  );
  return Number(ethers.formatUnits(amounts[1], decimals));
}

// === Fungsi Cek Saldo ===
async function cekSaldo() {
  const ethBalance = await provider.getBalance(wallet.address);
  const usdtBalance = await usdt0.balanceOf(wallet.address);
  const decimals = await usdt0.decimals();
  const ethPrice = await getEthPrice();

  const ethInUsd = Number(ethers.formatEther(ethBalance)) * ethPrice;
  const usdtInUsd = Number(ethers.formatUnits(usdtBalance, decimals));

  console.log(`\n💰 Saldo saat ini:`);
  console.log(`${RED}ETH   : ${ethers.formatEther(ethBalance)} (~${ethInUsd.toFixed(2)} USD)${RESET}`);
  console.log(`${GREEN}USDT0 : ${ethers.formatUnits(usdtBalance, decimals)} (~${usdtInUsd.toFixed(2)} USD)${RESET}\n`);
}

// === Swap ETH → USDT0 ===
async function swapEthToUsdt0() {
  try {
    const decimals = await usdt0.decimals();

    // Simpan saldo sebelum swap untuk hitung delta
    const prevUsdtBalance = await usdt0.balanceOf(wallet.address);

    const ethPrice = await getEthPrice();
    const usdTarget = (Math.random() * (1.2 - 1.1) + 1.1); // 1.1 - 1.2 USD
    const ethAmount = usdTarget / ethPrice;

    const ethInWei = ethers.parseEther(ethAmount.toFixed(18));
    const path = [WETH_ADDR, USDT0_ADDR];
    const deadline = Math.floor(Date.now() / 1000) + 120;

    console.log(`${GREEN}🚀 Swap ETH → USDT0 sebesar ~${usdTarget.toFixed(3)} USD (${ethAmount} ETH)${RESET}`);

    const tx = await router.swapExactETHForTokens(
      0,
      path,
      wallet.address,
      deadline,
      { value: ethInWei }
    );

    const receipt = await tx.wait();

    const newUsdtBalance = await usdt0.balanceOf(wallet.address);
    let received = newUsdtBalance - prevUsdtBalance;
    if (received < 0n) received = 0n;

    lastSwapUsdt0 = received;

    console.log(`${GREEN}✅ Swap ETH→USDT0 sukses: ${receipt.hash}${RESET}`);
    console.log(`${GREEN}   → Diterima: ${ethers.formatUnits(received, decimals)} USDT0${RESET}`);
    return true;

  } catch (err) {
    console.error(`${RED}❌ Gagal swap ETH→USDT0: ${err.message}${RESET}`);
    return false;
  }
}

// === Swap USDT0 → ETH ===
async function swapUsdt0ToEth() {
  try {
    const decimals = await usdt0.decimals();

    if (lastSwapUsdt0 === 0n) {
      console.log(`${GREEN}⚠️ Tidak ada hasil swap sebelumnya untuk ditukar balik.${RESET}`);
      return true;
    }

    // Approve router untuk jumlah hasil swap terakhir
    const approveTx = await usdt0.approve(ROUTER_ADDR, lastSwapUsdt0);
    await approveTx.wait();

    const path = [USDT0_ADDR, WETH_ADDR];
    const deadline = Math.floor(Date.now() / 1000) + 120;

    console.log(`${GREEN}↩️ Swap balik USDT0 → ETH (${ethers.formatUnits(lastSwapUsdt0, decimals)} USDT0)${RESET}`);

    const tx = await router.swapExactTokensForETH(
      lastSwapUsdt0,
      0,
      path,
      wallet.address,
      deadline
    );

    const receipt = await tx.wait();
    console.log(`${GREEN}✅ Swap USDT0→ETH sukses: ${receipt.hash}${RESET}`);

    // Reset hasil swap terakhir
    lastSwapUsdt0 = 0n;
    return true;

  } catch (err) {
    console.error(`${RED}❌ Gagal swap USDT0→ETH: ${err.message}${RESET}`);
    return false;
  }
}

// === Loop dengan mekanisme retry keras kepala ===
async function mainLoop() {
  while (true) {
    await cekSaldo();

    // === SWAP ETH → USDT0 ===
    let ok1 = false;
    while (!ok1) {
      ok1 = await swapEthToUsdt0();
      if (!ok1) {
        console.log("⏳ Retry swap ETH→USDT0 dalam 10 detik...");
        await delay(10000);
      }
    }

    // === SWAP USDT0 → ETH ===
    let ok2 = false;
    while (!ok2) {
      ok2 = await swapUsdt0ToEth();
      if (!ok2) {
        console.log("⏳ Retry swap USDT0→ETH dalam 10 detik...");
        await delay(10000);
      }
    }

    console.log("🔄 Siklus selesai, lanjut lagi dalam 20 detik...\n");
    await delay(20000);
  }
}

mainLoop();
