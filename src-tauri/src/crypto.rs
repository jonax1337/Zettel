//! AES-256-GCM file encryption for backup ZIPs.
//!
//! File layout:
//!   "ZETTEL-ENC-1\n"  (12 bytes — magic + version + newline; detection prefix)
//!   [16 bytes] argon2id salt
//!   [12 bytes] AES-GCM nonce
//!   [ciphertext || 16-byte GCM tag]
//!
//! Key derivation: Argon2id with default params, 32-byte output. Passwords are
//! zeroized after KDF.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Argon2, Params};
use rand::RngCore;
use zeroize::Zeroize;

pub const MAGIC: &[u8; 12] = b"ZETTEL-ENC-1";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const HEADER_LEN: usize = MAGIC.len() + SALT_LEN + NONCE_LEN;

pub fn is_encrypted(bytes: &[u8]) -> bool {
    bytes.len() >= MAGIC.len() && &bytes[..MAGIC.len()] == MAGIC
}

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; KEY_LEN], String> {
    let argon = Argon2::new(
        argon2::Algorithm::Argon2id,
        argon2::Version::V0x13,
        Params::default(),
    );
    let mut out = [0u8; KEY_LEN];
    argon
        .hash_password_into(password.as_bytes(), salt, &mut out)
        .map_err(|e| format!("kdf failed: {}", e))?;
    Ok(out)
}

pub fn encrypt(plaintext: &[u8], password: &mut String) -> Result<Vec<u8>, String> {
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut nonce_bytes);

    let mut key_bytes = derive_key(password, &salt)?;
    password.zeroize();

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("encrypt failed: {}", e))?;
    key_bytes.zeroize();

    let mut out = Vec::with_capacity(HEADER_LEN + ct.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

pub fn decrypt(blob: &[u8], password: &mut String) -> Result<Vec<u8>, String> {
    if !is_encrypted(blob) {
        return Err("not an encrypted Zettel backup".into());
    }
    if blob.len() < HEADER_LEN {
        return Err("encrypted blob truncated".into());
    }
    let salt = &blob[MAGIC.len()..MAGIC.len() + SALT_LEN];
    let nonce_bytes = &blob[MAGIC.len() + SALT_LEN..HEADER_LEN];
    let ct = &blob[HEADER_LEN..];

    let mut key_bytes = derive_key(password, salt)?;
    password.zeroize();

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    let nonce = Nonce::from_slice(nonce_bytes);
    let pt = cipher
        .decrypt(nonce, ct)
        .map_err(|_| "Falsches Passwort oder beschädigtes Backup.".to_string())?;
    key_bytes.zeroize();
    Ok(pt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_recovers_plaintext() {
        let plaintext = b"hello world, this is a backup zip";
        let mut pw = String::from("correct horse battery staple");
        let blob = encrypt(plaintext, &mut pw).unwrap();
        assert!(pw.is_empty(), "password must be zeroized after encrypt");

        let mut pw2 = String::from("correct horse battery staple");
        let recovered = decrypt(&blob, &mut pw2).unwrap();
        assert_eq!(recovered, plaintext);
    }

    #[test]
    fn wrong_password_fails() {
        let mut pw = String::from("real-password");
        let blob = encrypt(b"data", &mut pw).unwrap();
        let mut wrong = String::from("wrong-password");
        let err = decrypt(&blob, &mut wrong).unwrap_err();
        assert!(err.contains("Falsches Passwort") || err.contains("beschädigt"));
    }

    #[test]
    fn magic_header_present() {
        let mut pw = String::from("x");
        let blob = encrypt(b"data", &mut pw).unwrap();
        assert_eq!(&blob[..MAGIC.len()], MAGIC);
        assert!(is_encrypted(&blob));
    }

    #[test]
    fn non_encrypted_blob_rejected() {
        let mut pw = String::from("x");
        let err = decrypt(b"PK\x03\x04 plain zip", &mut pw).unwrap_err();
        assert!(err.contains("not an encrypted"));
    }

    #[test]
    fn truncated_blob_rejected() {
        let mut pw = String::from("x");
        let mut blob = MAGIC.to_vec();
        blob.push(0x00);
        let err = decrypt(&blob, &mut pw).unwrap_err();
        assert!(err.contains("truncated"));
    }

    #[test]
    fn distinct_nonces_per_encrypt() {
        let mut pw1 = String::from("same-password");
        let mut pw2 = String::from("same-password");
        let a = encrypt(b"same plaintext", &mut pw1).unwrap();
        let b = encrypt(b"same plaintext", &mut pw2).unwrap();
        assert_ne!(a, b, "salt/nonce randomness must produce distinct ciphertexts");
    }

    #[test]
    fn tampered_ciphertext_fails_auth() {
        let mut pw = String::from("password");
        let mut blob = encrypt(b"secret", &mut pw).unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0x01;
        let mut pw2 = String::from("password");
        assert!(decrypt(&blob, &mut pw2).is_err());
    }
}

