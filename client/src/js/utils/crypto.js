import sodium from "libsodium-wrappers";

let initialized = false;
let keyPair = null;

export const initCrypto = async () => {
  if (initialized) return;
  await sodium.ready;
  initialized = true;
};

export const generateKeyPair = () => {
  keyPair = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(keyPair.publicKey),
    privateKey: sodium.to_base64(keyPair.privateKey),
  };
};

export const savePrivateKey = (privateKey) => {
  localStorage.setItem("privateKey", privateKey);
};

export const getPrivateKey = () => {
  return localStorage.getItem("privateKey");
};

export const getPublicKey = () => {
  const privateKey = getPrivateKey();
  if (!privateKey) return null;

  const privateKeyUint8 = sodium.from_base64(privateKey);
  const publicKey = sodium.crypto_scalarmult_base(privateKeyUint8);
  return sodium.to_base64(publicKey);
};

export const encryptMessage = (message, recipientPublicKey) => {
  const privateKey = getPrivateKey();
  if (!privateKey) throw new Error("No private key found");

  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const privateKeyUint8 = sodium.from_base64(privateKey);
  const recipientPublicKeyUint8 = sodium.from_base64(recipientPublicKey);

  const encrypted = sodium.crypto_box_easy(
    message,
    nonce,
    recipientPublicKeyUint8,
    privateKeyUint8
  );

  return {
    encrypted: sodium.to_base64(encrypted),
    nonce: sodium.to_base64(nonce),
  };
};

export const decryptMessage = (encryptedMessage, nonce, senderPublicKey) => {
  const privateKey = getPrivateKey();
  if (!privateKey) throw new Error("No private key found");

  const privateKeyUint8 = sodium.from_base64(privateKey);
  const senderPublicKeyUint8 = sodium.from_base64(senderPublicKey);
  const encryptedUint8 = sodium.from_base64(encryptedMessage);
  const nonceUint8 = sodium.from_base64(nonce);

  try {
    const decrypted = sodium.crypto_box_open_easy(
      encryptedUint8,
      nonceUint8,
      senderPublicKeyUint8,
      privateKeyUint8
    );
    return sodium.to_string(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[Encrypted message - decryption failed]";
  }
};
