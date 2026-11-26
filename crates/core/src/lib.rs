//! Pausa domain logic and the API's data shapes. No I/O: runs natively (tests) and compiled to WASM (Worker).
//!
//! The types in [`dto`] are the API contract. `cargo test` writes them as TypeScript to `packages/api-types/src`
//! (see `.cargo/config.toml`), so the client never re-declares a shape by hand.

pub mod auth;
pub mod catalog;
pub mod circles;
pub mod diary;
pub mod discovery;
pub mod dto;
pub mod export;
pub mod import;
pub mod limits;
pub mod lists;
pub mod profile;
pub mod push;
pub mod ranking;
pub mod rating;
pub mod review;
pub mod serata;
pub mod shell;
pub mod streaming;
