import { ethers } from "ethers";

// ================== Konfigurasi ==================
const RPC_URL   = "https://rpc-gel.inkonchain.com";
const CHAIN_ID  = 57073;
const provider  = new ethers.JsonRpcProvider(RPC_URL, { name: "inkonchain", chainId: CHAIN_ID });

// Router Inkyswap
const ROUTER_ADDR = "0xA8C1C38FF57428e5C3a34E0899Be5Cb385476507";

// Token
const WETH_ADDR   = "0x4200000000000000000000000000000000000006";
const TOKENS = {
  USDT0: "0x0200C29006150606B650577BBE7B6248F58470c1",
  Purple: "0xD642B49d10cc6e1BC1c6945725667c35e0875f22",
  Anita: "0x0606FC632ee812bA970af72F8489baAa443C4B98",
  Shroomy: "0x0c5E2D1C98cd265C751e02F8F3293bC5764F9111"
};

// Warna log per token
const COLORS = {
  USDT0: "\x1b[32m",   // hijau
  Purple: "\x1b[35m",  // ungu
  Anita: "\x1b[34m",   // biru
  Shroomy: "\x1b[33m", // kuning
  RESET: "\x1b[0m"
};

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

// Buat instance kontrak token
const tokenContracts = {};
for (let t in TOKENS) {
  tokenContracts[t] = new ethers.Contract(TOKENS[t], ERC20_ABI, wallet);
}

// ================== Fungsi bantu ==================
function getTime() {
  return new Date().toLocaleTimeString();
}

// Tampilkan saldo ETH + token + estimasi USD + countdown 20 detik
async function showBalances() {
  const ethPriceInUsd = await getEthPrice(); // ETH→USD
  const ethBalance = await provider.getBalance(wallet.address); // <<< diubah dari wallet.getBalance()
  console.log(`\n[${getTime()}] 💰 SALDO SEBELUM LOOP`);
  console.log(`\x1b[31mETH: ${ethers.formatEther(ethBalance)} ETH (~${(Number(ethers.formatEther(ethBalance))*ethPriceInUsd).toFixed(3)} USD)\x1b[0m`);

  for (let token of Object.keys(TOKENS)) {
    const balance = await tokenContracts[token].balanceOf(wallet.address);
    const decimals = await tokenContracts[token].decimals();
    let usdValue = 0;

    try {
      if (Number(balance) > 0) {
        const amountsOut = await router.getAmountsOut(balance, [TOKENS[token], WETH_ADDR]);
        usdValue = Number(ethers.formatUnits(amountsOut[1], 18)) * ethPriceInUsd;
      }
    } catch (err) {
      usdValue = 0;
    }

    console.log(`${COLORS[token]}${token}: ${ethers.formatUnits(balance, decimals)} (~${usdValue.toFixed(3)} USD)${COLORS.RESET}`);
  }

  console.log(`\n⏳ Menunggu 20 detik sebelum loop berikutnya...`);
  for (let i = 20; i >= 1; i--) {
    process.stdout.write(`\r${i} detik...`);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log("\n");
}

// Dapatkan harga 1 ETH dalam USD (via USDT0)
async function getEthPrice() {
  const decimals = await tokenContracts["USDT0"].decimals();
  const amounts = await router.getAmountsOut(
    ethers.parseEther("1"),
    [WETH_ADDR, TOKENS["USDT0"]]
  );
  return Number(ethers.formatUnits(amounts[1], decimals));
}

// Swap ETH → Token (~1.1–1.2 USD)
async function swapEthToToken(token) {
  const decimals = await tokenContracts[token].decimals();
  const usdTarget = Math.random() * (1.2 - 1.1) + 1.1;

  while (true) {
    try {
      const ethPriceInUsd = await getEthPrice();
      const ethAmount = usdTarget / ethPriceInUsd;
      const ethInWei = ethers.parseEther(ethAmount.toFixed(18));

      const path = [WETH_ADDR, TOKENS[token]];
      const deadline = Math.floor(Date.now() / 1000) + 120;

      console.log(`${COLORS[token]}[${getTime()}] 🔄 Swap ETH → ${token} ~${usdTarget.toFixed(3)} USD (${ethAmount} ETH)${COLORS.RESET}`);

      const tx = await router.swapExactETHForTokens(
        0, path, wallet.address, deadline, { value: ethInWei }
      );
      const receipt = await tx.wait();
      console.log(`${COLORS[token]}[${getTime()}] ✅ Swap ETH→${token} sukses: ${receipt.hash}${COLORS.RESET}`);
      return true;
    } catch (err) {
      console.error(`${COLORS[token]}[${getTime()}] ❌ Gagal swap ETH→${token}: ${err.message}, retry dalam 10 detik...${COLORS.RESET}`);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}

// Swap Token → ETH
async function swapTokenToEth(token) {
  const decimals = await tokenContracts[token].decimals();

  while (true) {
    try {
      const balance = await tokenContracts[token].balanceOf(wallet.address);
      if (balance == 0n) {
        console.log(`${COLORS[token]}[${getTime()}] ⚠️ Tidak ada saldo ${token} untuk ditukar balik.${COLORS.RESET}`);
        return true;
      }

      const approveTx = await tokenContracts[token].approve(ROUTER_ADDR, balance);
      await approveTx.wait();

      const path = [TOKENS[token], WETH_ADDR];
      const deadline = Math.floor(Date.now() / 1000) + 120;

      console.log(`${COLORS[token]}[${getTime()}] ↩️ Swap ${token} → ETH (${ethers.formatUnits(balance, decimals)} ${token})${COLORS.RESET}`);
      const tx = await router.swapExactTokensForETH(
        balance, 0, path, wallet.address, deadline
      );
      const receipt = await tx.wait();
      console.log(`${COLORS[token]}[${getTime()}] ✅ Swap ${token}→ETH sukses: ${receipt.hash}${COLORS.RESET}`);
      return true;
    } catch (err) {
      console.error(`${COLORS[token]}[${getTime()}] ❌ Gagal swap ${token}→ETH: ${err.message}, retry dalam 10 detik...${COLORS.RESET}`);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}

// ================== Loop utama ==================
async function mainLoop() {
  let loopCount = 1;
  const tokenOrder = ["USDT0", "Purple", "Anita", "Shroomy"];

  while (true) {
    console.log(`\n================== LOOP #${loopCount} ==================`);

    // Tampilkan saldo + estimasi USD + countdown 20 detik
    await showBalances();

    for (let token of tokenOrder) {
      await swapEthToToken(token);
      await swapTokenToEth(token);
    }

    console.log(`[${getTime()}] 🔁 Loop #${loopCount} selesai.`);
    loopCount++;
  }
}

mainLoop();
