const {
  BlockhashWithExpiryBlockHeight,
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  TransactionMessage,
  VersionedTransaction,
} = require("@solana/web3.js");
const axios = require("axios");
const bs58 = require("bs58");
const { Currency, CurrencyAmount } = require("@raydium-io/raydium-sdk");
const { connection } = require("../helpers/config");
const jito_Validators = [
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
];
const endpoints = [
  "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
];

async function getRandomValidator() {
  const res =
    jito_Validators[Math.floor(Math.random() * jito_Validators.length)];
  return new PublicKey(res);
}
async function jito_executeAndConfirm(
  transaction,
  payer,
  lastestBlockhash,
  jitofee
) {
  console.log("Executing transaction (jito)...");
  const jito_validator_wallet = await getRandomValidator();
  console.log("Selected Jito Validator: ", jito_validator_wallet.toBase58());
  try {
    const fee = new CurrencyAmount(Currency.SOL, jitofee, false).raw.toNumber();
    console.log(`Jito Fee: ${fee / 10 ** 9} sol`);
    const jitoFee_message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: lastestBlockhash.blockhash,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: jito_validator_wallet,
          lamports: fee,
        }),
      ],
    }).compileToV0Message();
    const jitoFee_transaction = new VersionedTransaction(jitoFee_message);
    jitoFee_transaction.sign([payer]);
    const jitoTxSignature = bs58.encode(jitoFee_transaction.signatures[0]);
    const serializedJitoFeeTransaction = bs58.encode(
      jitoFee_transaction.serialize()
    );
    const serializedTransaction = bs58.encode(transaction.serialize());
    const final_transaction = [
      serializedJitoFeeTransaction,
      serializedTransaction,
    ];
    const requests = endpoints.map((url) =>
      axios.post(url, {
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [final_transaction],
      })
    );
    console.log("Sending tx to Jito validators...");
    const res = await Promise.all(requests.map((p) => p.catch((e) => e)));
    const success_res = res.filter((r) => !(r instanceof Error));
    if (success_res.length > 0) {
      console.log(">=1 Jito validators accepted the tx");
      console.log("Confirming the jito transaction...");
      return await jito_confirm(jitoTxSignature, lastestBlockhash);
    } else {
      console.log("No Jito validators accepted the tx");
      return { confirmed: false, signature: jitoTxSignature };
    }
  } catch (e) {
    if (e instanceof axios.AxiosError) {
      console.log("Failed to execute the jito transaction");
    } else {
      console.log("Error during jito transaction execution: ", e);
    }
    return { confirmed: false, signature: null };
  }
}

async function jito_confirm(signature, latestBlockhash) {
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      blockhash: latestBlockhash.blockhash,
    },
    connection.commitment
  );
  return { confirmed: !confirmation.value.err, signature };
}

module.exports = { jito_executeAndConfirm };